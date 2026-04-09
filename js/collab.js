/* ========================================
   Collab – Kollaboratives Arbeiten
   ======================================== */

const Collab = (() => {
    const API_BASE = 'api/';
    const POLL_INTERVAL = 1000;       // State-Polling alle 1 Sekunde
    const CURSOR_INTERVAL = 300;      // Cursor senden alle 300ms
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
        if (_pushTimer) { clearTimeout(_pushTimer); _pushTimer = null; }
        if (_cursorTimer) { clearInterval(_cursorTimer); _cursorTimer = null; }
        _roomId = null;
        _version = 0;
        _sseErrors = 0;
        _onlineUsers = [];
        _remoteCursors = [];
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

            _eventSource.onmessage = (e) => {
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
                data.messages.forEach(m => {
                    _lastMsgId = Math.max(_lastMsgId, intval(m.id));
                    _onMessage(m);
                });
            }
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

        // Re-apply pending ops locally so they aren't lost
        if (savedOps.length > 0) {
            savedOps.forEach(op => {
                const site = State.sites[op.siteIdx];
                if (!site) return;
                if (op.type === 'add' && op.object) {
                    // Only re-add if not already present (server may have it)
                    if (!site.objects.find(o => o.id === op.object.id)) {
                        site.objects.push(JSON.parse(JSON.stringify(op.object)));
                    }
                } else if (op.type === 'update' && op.objectId && op.props) {
                    const obj = site.objects.find(o => o.id === op.objectId);
                    if (obj) Object.assign(obj, op.props);
                } else if (op.type === 'remove' && op.objectId) {
                    site.objects = site.objects.filter(o => o.id !== op.objectId);
                }
            });
            // Re-queue ops so they get flushed to server
            _pendingOps.push(...savedOps);
            clearTimeout(_opsTimer);
            _opsTimer = setTimeout(flushOps, 300);
        }

        Canvas.render();
    }

    // --- Operations-basierter Sync ---

    let _pendingOps = [];
    let _opsTimer = null;

    function pushState() {
        // Fallback: wenn keine Ops gesammelt, ganzen State senden
        if (!_roomId || _syncLock || _locked) return;
        if (_pendingOps.length > 0) {
            flushOps();
        } else {
            // Full-state push als Fallback (z.B. fuer Site-Aenderungen)
            // Debounce at 150ms to batch rapid changes without losing data
            clearTimeout(_opsTimer);
            _opsTimer = setTimeout(doFullPush, 150);
        }
    }

    function pushOp(op) {
        if (!_roomId || _syncLock || _locked) return;
        _pendingOps.push(op);
        clearTimeout(_opsTimer);
        _opsTimer = setTimeout(flushOps, 300);
    }

    async function flushOps() {
        if (!_roomId || _syncLock || _pendingOps.length === 0) return;
        const ops = _pendingOps.splice(0);
        try {
            const resp = await fetch(API_BASE + 'room-ops.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: _roomId, ops }),
            });
            const data = await resp.json();
            if (data.ok) {
                _version = data.version;
            } else {
                console.warn('Collab: Ops failed:', data.error);
            }
        } catch (e) {
            console.warn('Collab: Ops push failed:', e);
        }
    }

    async function doFullPush() {
        if (!_roomId || _syncLock) return;
        try {
            const resp = await fetch(API_BASE + 'room-update.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: _roomId,
                    state: State.exportJSON(),
                    expectedVersion: _version,
                }),
            });
            const data = await resp.json();
            if (data.ok) {
                _version = data.version;
            } else if (data.conflict) {
                // Conflict: server has newer version – merge via onRemoteUpdate
                // which preserves any pending ops
                onRemoteUpdate(data.state, data.currentVersion);
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
