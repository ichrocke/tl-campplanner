/* ========================================
   Collab – Kollaboratives Arbeiten
   ======================================== */

const Collab = (() => {
    const API_BASE = 'api/';

    let _roomId = null;
    let _version = 0;
    let _userId = null;
    let _userName = '';
    let _eventSource = null;
    let _pollTimer = null;
    let _pushTimer = null;
    let _syncLock = false;
    let _sseErrors = 0;
    let _onlineUsers = [];
    let _onUsersChange = null;

    function init() {
        // Zufaellige User-ID pro Session
        _userId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        _userName = 'User ' + _userId.slice(-4);
    }

    function isConnected() {
        return _roomId !== null;
    }

    function getRoomId() {
        return _roomId;
    }

    function getOnlineUsers() {
        return _onlineUsers;
    }

    function onUsersChange(fn) {
        _onUsersChange = fn;
    }

    // --- Raum beitreten ---

    async function joinRoom(roomId) {
        if (!roomId) return false;
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
            updateUrl();
            return true;
        } catch (e) {
            console.error('Collab: Join failed:', e);
            return false;
        }
    }

    // --- Verbindung trennen ---

    function disconnect() {
        if (_eventSource) {
            _eventSource.close();
            _eventSource = null;
        }
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
        if (_pushTimer) {
            clearTimeout(_pushTimer);
            _pushTimer = null;
        }
        _roomId = null;
        _version = 0;
        _sseErrors = 0;
        _onlineUsers = [];
        if (_onUsersChange) _onUsersChange([]);
        updateUrl();
    }

    // --- SSE / Polling ---

    function startListening() {
        _sseErrors = 0;
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
                } catch (err) { /* ignore parse errors */ }
            };

            _eventSource.addEventListener('users', (e) => {
                try {
                    _onlineUsers = JSON.parse(e.data);
                    if (_onUsersChange) _onUsersChange(_onlineUsers);
                } catch (err) { /* ignore */ }
            });

            _eventSource.addEventListener('timeout', () => {
                // Server beendet SSE nach Zeitlimit, neu verbinden
                _eventSource.close();
                setTimeout(() => {
                    if (_roomId) trySSE();
                }, 500);
            });

            _eventSource.onerror = () => {
                _sseErrors++;
                if (_sseErrors > 3) {
                    _eventSource.close();
                    _eventSource = null;
                    console.warn('Collab: SSE failed, falling back to polling');
                    startPolling();
                }
            };
        } catch (e) {
            startPolling();
        }
    }

    function startPolling() {
        if (_pollTimer) return;
        _pollTimer = setInterval(async () => {
            if (!_roomId) return;
            try {
                const resp = await fetch(API_BASE + 'room-state.php?room=' + encodeURIComponent(_roomId) + '&since=' + _version);
                const data = await resp.json();
                if (data.changed && data.version > _version) {
                    onRemoteUpdate(data.state, data.version);
                }
            } catch (e) { /* ignore, retry next interval */ }
        }, 2500);
    }

    // --- Remote Update empfangen ---

    function onRemoteUpdate(stateJson, version) {
        _version = version;
        _syncLock = true;
        try {
            State.importJSON(stateJson, true);
        } catch (e) {
            console.warn('Collab: Failed to apply remote state:', e);
        }
        _syncLock = false;
        Canvas.render();
    }

    // --- State zum Server pushen (debounced) ---

    function pushState() {
        if (!_roomId || _syncLock) return;
        clearTimeout(_pushTimer);
        _pushTimer = setTimeout(doPush, 600);
    }

    async function doPush() {
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
                // Konflikt: Server-State uebernehmen
                _version = data.currentVersion;
                _syncLock = true;
                try {
                    State.importJSON(data.state, true);
                } catch (e) { /* ignore */ }
                _syncLock = false;
                Canvas.render();
            }
        } catch (e) {
            console.warn('Collab: Push failed:', e);
        }
    }

    // --- URL-Parameter verwalten ---

    function updateUrl() {
        const url = new URL(window.location);
        if (_roomId) {
            url.searchParams.set('room', _roomId);
        } else {
            url.searchParams.delete('room');
        }
        history.replaceState(null, '', url);
    }

    // --- Room-ID aus URL lesen ---

    function getRoomFromUrl() {
        return new URLSearchParams(window.location.search).get('room');
    }

    init();

    return {
        isConnected,
        getRoomId,
        joinRoom,
        disconnect,
        pushState,
        getRoomFromUrl,
        getOnlineUsers,
        onUsersChange,
        get syncLock() { return _syncLock; },
    };
})();
