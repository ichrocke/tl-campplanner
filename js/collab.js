/* ========================================
   Collab – Kollaboratives Arbeiten
   ======================================== */

const Collab = (() => {
    const API_BASE = 'api/';
    const POLL_INTERVAL = 1000;       // State-Polling alle 1 Sekunde
    const CURSOR_INTERVAL = 500;      // Cursor senden alle 500ms (S8: weniger Server-Last)
    const CURSOR_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];

    let _roomId = null;
    let _version = 0;
    let _userId = null;
    let _userName = '';
    let _userColor = '';
    let _eventSource = null;
    let _pollTimer = null;
    let _pushTimer = null;
    let _cursorTimer = null;
    let _syncLock = false;
    let _sseErrors = 0;
    let _onlineUsers = [];
    let _remoteCursors = [];
    let _onUsersChange = null;
    let _localCursorX = 0;
    let _localCursorY = 0;
    let _locked = false;
    let _wasLocked = false;
    let _expiresDeadline = null;
    let _lastMsgId = 0;
    let _msgInitialized = false;
    let _onMessage = null;

    function init() {
        _userId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        _userColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
        // Gespeicherten Namen laden oder Standard
        _userName = localStorage.getItem('collab_userName') || '';
    }

    function isConnected() {
        return _roomId !== null;
    }

    function isLocked() { return _locked; }
    function getExpiresDeadline() { return _expiresDeadline; }
    function getRoomId() { return _roomId; }
    function getUserName() { return _userName; }
    function getOnlineUsers() { return _onlineUsers; }
    function getRemoteCursors() { return _remoteCursors; }

    function onUsersChange(fn) {
        _onUsersChange = fn;
    }

    // --- Name abfragen ---

    function promptName() {
        const saved = localStorage.getItem('collab_userName') || '';
        const name = prompt(I18n.t('collab.enterName'), saved);
        if (name && name.trim()) {
            _userName = name.trim();
            localStorage.setItem('collab_userName', _userName);
        } else if (!_userName) {
            _userName = 'User ' + _userId.slice(-4);
        }
    }

    // --- Raum beitreten ---

    async function joinRoom(roomId) {
        if (!roomId) return false;

        // Name abfragen beim Beitreten
        promptName();
        if (typeof window.showDataWarning === 'function') window.showDataWarning();

        try {
            const resp = await fetch(API_BASE + 'room-state.php?room=' + encodeURIComponent(roomId));
            const data = await resp.json();
            if (data.error) {
                console.warn('Collab: Room not found:', data.error);
                return false;
            }
            _roomId = roomId;
            _version = data.version;

            // Server-State laden
            _syncLock = true;
            try {
                State.importJSON(data.state, true);
            } catch (e) {
                console.warn('Collab: Failed to import state:', e);
            }
            _syncLock = false;

            // Sicherstellen, dass mindestens ein Zeltplatz existiert
            if (!State.activeSite) {
                State.createSite();
            }

            startListening();
            startCursorSync();
            updateUrl();
            return true;
        } catch (e) {
            console.error('Collab: Join failed:', e);
            return false;
        }
    }

    // --- Verbindung trennen ---

    function disconnect() {
        if (_eventSource) { _eventSource.close(); _eventSource = null; }
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
        if (_cursorTimer) { clearInterval(_cursorTimer); _cursorTimer = null; }
        _roomId = null;
        _version = 0;
        _sseErrors = 0;
        _onlineUsers = [];
        _remoteCursors = [];
        // C8: reset all sync state so nothing leaks into the next room joined
        _pendingOps = [];
        _needFullPush = false;
        _opsInFlight = false;
        _opSinceLastPush = false;
        _lastMsgId = 0;
        _msgInitialized = false;
        _locked = false;
        _wasLocked = false;
        if (_onUsersChange) _onUsersChange([]);
        updateUrl();
        Canvas.render();
    }

    // --- Polling + SSE ---

    function startListening() {
        startPolling();
        trySSE();
    }

    function trySSE() {
        try {
            const url = API_BASE + 'room-sse.php?room=' + encodeURIComponent(_roomId) +
                '&since=' + _version +
                '&uid=' + encodeURIComponent(_userId) +
                '&uname=' + encodeURIComponent(_userName);
            _eventSource = new EventSource(url);

            _eventSource.onopen = () => { _sseErrors = 0; };

            _eventSource.onmessage = (e) => {
                _sseErrors = 0; // C12: a working stream clears the error counter
                try {
                    const data = JSON.parse(e.data);
                    if (data.version && data.version > _version) {
                        onRemoteUpdate(data.state, data.version);
                    }
                } catch (err) { /* ignore */ }
            };

            _eventSource.addEventListener('users', (e) => {
                try {
                    _onlineUsers = JSON.parse(e.data);
                    if (_onUsersChange) _onUsersChange(_onlineUsers);
                } catch (err) { /* ignore */ }
            });

            _eventSource.addEventListener('timeout', () => {
                _eventSource.close();
                setTimeout(() => { if (_roomId) trySSE(); }, 1000);
            });

            _eventSource.onerror = () => {
                _sseErrors++;
                if (_sseErrors > 3) {
                    _eventSource.close();
                    _eventSource = null;
                }
            };
        } catch (e) { /* Polling laeuft bereits */ }
    }

    function startPolling() {
        if (_pollTimer) return;
        _pollTimer = setInterval(async () => {
            if (!_roomId) return;
            try {
                const resp = await fetch(API_BASE + 'room-state.php?room=' + encodeURIComponent(_roomId) + '&since=' + _version);
                const data = await resp.json();
                // Ablaufzeit aktualisieren
                if (data.expiresIn !== undefined) {
                    _expiresDeadline = (data.expiresIn >= 0) ? Date.now() + data.expiresIn * 1000 : null;
                }
                // Lock-Status pruefen
                if (data.locked !== undefined) {
                    const newLocked = !!data.locked;
                    if (newLocked !== _locked) {
                        _locked = newLocked;
                        if (_locked && !_wasLocked) {
                            UI.showHint(I18n.t('collab.roomLocked'));
                        } else if (!_locked && _wasLocked) {
                            UI.showHint(I18n.t('collab.roomUnlocked'));
                            setTimeout(() => UI.showHint(''), 3000);
                            // C9: push local edits made while the room was locked
                            _needFullPush = true;
                            scheduleSync(200);
                        }
                        _wasLocked = _locked;
                        if (_onUsersChange) _onUsersChange(_onlineUsers);
                    }
                }
                if (data.changed && data.version > _version) {
                    onRemoteUpdate(data.state, data.version);
                }
                // Nachrichten abfragen
                pollMessages();
            } catch (e) { /* retry next interval */ }
        }, POLL_INTERVAL);
    }

    async function pollMessages() {
        if (!_roomId || !_onMessage) return;
        try {
            const resp = await fetch(API_BASE + 'room-messages.php?room=' + encodeURIComponent(_roomId) + '&since=' + _lastMsgId);
            const data = await resp.json();
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(m => { _lastMsgId = Math.max(_lastMsgId, intval(m.id)); });
                // C13: don't replay the whole history as a toast flood on join –
                // only show messages that arrive after we've joined.
                if (_msgInitialized) data.messages.forEach(m => _onMessage(m));
            }
            _msgInitialized = true;
        } catch (e) { /* ignore */ }
    }

    function intval(v) { return parseInt(v) || 0; }

    // --- Cursor-Sync ---

    function startCursorSync() {
        if (_cursorTimer) return;
        _cursorTimer = setInterval(async () => {
            if (!_roomId) return;
            try {
                const resp = await fetch(API_BASE + 'room-cursors.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        roomId: _roomId,
                        userId: _userId,
                        userName: _userName,
                        x: _localCursorX,
                        y: _localCursorY,
                        color: _userColor,
                    }),
                });
                const data = await resp.json();
                if (data.cursors) {
                    _remoteCursors = data.cursors;
                    // Online-Users aus Cursor-Daten ableiten
                    const allUsers = data.cursors.map(c => ({ user_id: c.user_id, user_name: c.user_name }));
                    allUsers.push({ user_id: _userId, user_name: _userName });
                    _onlineUsers = allUsers;
                    if (_onUsersChange) _onUsersChange(_onlineUsers);
                    Canvas.render();
                }
            } catch (e) { /* ignore */ }
        }, CURSOR_INTERVAL);
    }

    function updateLocalCursor(worldX, worldY) {
        _localCursorX = worldX;
        _localCursorY = worldY;
    }

    // --- Nachrichten ---

    function onMessage(fn) { _onMessage = fn; }

    async function sendMessage(text) {
        if (!_roomId || !text.trim()) return false;
        try {
            const resp = await fetch(API_BASE + 'room-messages.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: _roomId,
                    userName: _userName,
                    message: text.trim(),
                }),
            });
            const data = await resp.json();
            return !!data.ok;
        } catch (e) { return false; }
    }

    // --- Remote Update empfangen ---

    function onRemoteUpdate(stateJson, version) {
        // While our own sync round-trip is in flight, let it reconcile instead of
        // racing it (prevents flicker / lost in-flight ops).
        if (_opsInFlight) return;
        _version = version;

        // Save pending ops before overwriting state – they haven't been sent yet
        const savedOps = _pendingOps.splice(0);

        _syncLock = true;
        try {
            State.importJSON(stateJson, true);
        } catch (e) {
            console.warn('Collab: Failed to apply remote state:', e);
        }
        _syncLock = false;

        // Re-apply pending ops locally so they aren't lost (address site by ID)
        if (savedOps.length > 0) {
            savedOps.forEach(op => {
                const site = (op.siteId && State.sites.find(s => s.id === op.siteId)) || State.sites[op.siteIdx];
                if (!site) return;
                if (op.type === 'add' && op.object) {
                    if (!site.objects.find(o => o.id === op.object.id)) {
                        site.objects.push(JSON.parse(JSON.stringify(op.object)));
                    }
                } else if (op.type === 'update' && op.objectId && op.props) {
                    const obj = site.objects.find(o => o.id === op.objectId);
                    if (obj) Object.assign(obj, op.props);
                } else if (op.type === 'remove' && op.objectId) {
                    site.objects = site.objects.filter(o => o.id !== op.objectId);
                } else if (op.type === 'site_props' && op.props) {
                    // Structural props (layers etc.) – without this, a freshly
                    // created layer is wiped by the remote state before its op
                    // has been sent.
                    Object.keys(op.props).forEach(k => {
                        if (k === 'objects' || k === 'id') return;
                        const v = op.props[k];
                        site[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
                    });
                }
            });
            _pendingOps.push(...savedOps);
            scheduleSync(300);
        }

        Canvas.render();
    }

    // --- Operations-basierter Sync (serialisiert) ---

    let _pendingOps = [];
    let _syncTimer = null;
    let _needFullPush = false;   // a structural/full-state change is waiting to be sent
    let _opsInFlight = false;    // guards against overlapping sync round-trips
    let _opSinceLastPush = false; // did the current change emit an object op?

    // Called by app.js onChange for EVERY local change. If the change did not emit
    // an object op, it is structural and needs a full-state push (C3).
    function pushState() {
        if (!_roomId || _syncLock || _locked) return;
        if (!_opSinceLastPush) _needFullPush = true;
        _opSinceLastPush = false;
        scheduleSync(150);
    }

    function pushOp(op) {
        if (!_roomId || _syncLock || _locked) return;
        _pendingOps.push(op);
        _opSinceLastPush = true;
        scheduleSync(250);
    }

    function scheduleSync(delay) {
        if (_opsInFlight) return; // runSync reschedules itself when it finishes
        clearTimeout(_syncTimer);
        _syncTimer = setTimeout(runSync, delay || 200);
    }

    // Serialized sync: flush object ops first, then a full push if needed. This
    // avoids the previous shared-timer bug where an op cancelled a pending full
    // push (C2) and where a structural change was never sent while ops were
    // queued (C3).
    async function runSync() {
        if (!_roomId || _syncLock || _locked || _opsInFlight) return;
        if (_pendingOps.length === 0 && !_needFullPush) return;
        _opsInFlight = true;
        try {
            // 1) flush queued object ops
            if (_pendingOps.length > 0) {
                const ops = _pendingOps.slice();
                _opSinceLastPush = false;
                const resp = await fetch(API_BASE + 'room-ops.php', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: _roomId, ops }),
                });
                const data = await resp.json();
                if (data.ok) {
                    _pendingOps.splice(0, ops.length); // keep ops queued during the await (C7)
                    _version = data.version;
                    // C1: adopt merged server state (others' concurrent changes)
                    // when no local ops are still pending.
                    if (data.state && _pendingOps.length === 0) adoptRemoteState(data.state);
                } else {
                    return; // keep ops queued for retry (C7); reschedule in finally
                }
            }
            // 2) full-state push for structural changes, after ops are in (C2/C3)
            if (_needFullPush && _pendingOps.length === 0) {
                _needFullPush = false;
                await doFullPush();
            }
        } catch (e) {
            console.warn('Collab: sync failed:', e); // ops stay queued (C7)
        } finally {
            _opsInFlight = false;
            if (_pendingOps.length > 0 || _needFullPush) scheduleSync(300);
        }
    }

    function adoptRemoteState(stateJson) {
        _syncLock = true;
        try { State.importJSON(stateJson, true); }
        catch (e) { console.warn('Collab: adopt state failed:', e); }
        _syncLock = false;
        if (typeof Canvas !== 'undefined') Canvas.render();
    }

    async function doFullPush() {
        try {
            const resp = await fetch(API_BASE + 'room-update.php', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: _roomId, state: State.exportJSON(), expectedVersion: _version }),
            });
            const data = await resp.json();
            if (data.ok) {
                _version = data.version;
            } else if (data.conflict) {
                // Someone else changed the room first – adopt their state.
                // (A purely structural local change may be lost here; full
                // op-based structural sync is a later improvement – C6/C16.)
                _version = data.currentVersion;
                adoptRemoteState(data.state);
            }
        } catch (e) {
            console.warn('Collab: Push failed:', e);
        }
    }

    // --- URL ---

    function updateUrl() {
        const url = new URL(window.location);
        if (_roomId) { url.searchParams.set('room', _roomId); }
        else { url.searchParams.delete('room'); }
        history.replaceState(null, '', url);
    }

    function getRoomFromUrl() {
        return new URLSearchParams(window.location.search).get('room');
    }

    init();

    return {
        isConnected,
        isLocked,
        getExpiresDeadline,
        getRoomId,
        getUserName,
        joinRoom,
        disconnect,
        pushState,
        getRoomFromUrl,
        getOnlineUsers,
        getRemoteCursors,
        onUsersChange,
        onMessage,
        sendMessage,
        pushOp,
        updateLocalCursor,
        get syncLock() { return _syncLock; },
    };
})();
