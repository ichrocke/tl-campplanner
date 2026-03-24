<?php
// Admin-Seite: Raeume erstellen, auflisten, loeschen
// Aufruf: api/admin.php?key=ADMIN_KEY
require_once __DIR__ . '/db.php';

if (($_GET['key'] ?? '') !== ADMIN_KEY) {
    jsonResponse(['error' => 'Unauthorized'], 403);
}

$pdo = getDB();
$action = $_GET['action'] ?? 'list';

// Ablauf berechnen: Gesamtminuten ab jetzt (0 = unbegrenzt)
function calcTotalMinutes($days, $hours, $minutes) {
    $d = intval($days); $h = intval($hours); $m = intval($minutes);
    return $d * 1440 + $h * 60 + $m;
}

// Abgelaufene Raeume aufraeumen
cleanupExpiredRooms();

// Raum erstellen
if ($action === 'create') {
    $name = trim($_GET['name'] ?? '');
    if (!$name) $name = 'Raum ' . date('d.m.Y H:i');
    $totalMin = calcTotalMinutes($_GET['days'] ?? 0, $_GET['hours'] ?? 0, $_GET['minutes'] ?? 0);
    $id = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);
    $emptyState = json_encode([
        'version' => 1,
        'sites' => [],
        'minDistance' => 2,
        'displaySettings' => new stdClass(),
        'showDistances' => false,
        'minimapEnabled' => true,
    ]);
    if ($totalMin > 0) {
        $stmt = $pdo->prepare('INSERT INTO rooms (id, name, state_json, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))');
        $stmt->execute([$id, $name, $emptyState, $totalMin]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO rooms (id, name, state_json, expires_at) VALUES (?, ?, ?, NULL)');
        $stmt->execute([$id, $name, $emptyState]);
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Ablauf aendern
if ($action === 'set_ttl') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $totalMin = calcTotalMinutes($_GET['days'] ?? 0, $_GET['hours'] ?? 0, $_GET['minutes'] ?? 0);
        if ($totalMin > 0) {
            $pdo->prepare('UPDATE rooms SET expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?')->execute([$totalMin, $id]);
        } else {
            $pdo->prepare('UPDATE rooms SET expires_at = NULL WHERE id = ?')->execute([$id]);
        }
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Raum umbenennen
if ($action === 'rename') {
    $id = $_GET['id'] ?? '';
    $newName = trim($_GET['name'] ?? '');
    if ($id && $newName) {
        $pdo->prepare('UPDATE rooms SET name = ? WHERE id = ?')->execute([$newName, $id]);
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Nachrichten eines Raums laden (JSON)
if ($action === 'messages') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $stmt = $pdo->prepare('SELECT id, user_name, message, created_at FROM room_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 50');
        $stmt->execute([$id]);
        jsonResponse(['messages' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }
    jsonResponse(['messages' => []]);
}

// Einzelne Nachricht loeschen
if ($action === 'delete_msg') {
    $msgId = intval($_GET['msgId'] ?? 0);
    if ($msgId) {
        $pdo->prepare('DELETE FROM room_messages WHERE id = ?')->execute([$msgId]);
    }
    jsonResponse(['ok' => true]);
}

// Alle Nachrichten eines Raums loeschen
if ($action === 'clear_msgs') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $pdo->prepare('DELETE FROM room_messages WHERE room_id = ?')->execute([$id]);
    }
    jsonResponse(['ok' => true]);
}

// Nachricht an Raum senden
if ($action === 'message') {
    $id = $_GET['id'] ?? '';
    $msg = trim($_GET['msg'] ?? '');
    if ($id && $msg) {
        $stmt = $pdo->prepare('INSERT INTO room_messages (room_id, user_name, message) VALUES (?, ?, ?)');
        $stmt->execute([$id, 'Admin', $msg]);
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Raum sperren/entsperren
if ($action === 'lock' || $action === 'unlock') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $val = ($action === 'lock') ? 1 : 0;
        $stmt = $pdo->prepare('UPDATE rooms SET locked = ? WHERE id = ?');
        $stmt->execute([$val, $id]);
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Raum loeschen (ins Archiv)
if ($action === 'delete') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $pdo->prepare("INSERT IGNORE INTO rooms_archive (id, name, state_json, version, created_at, archived_at, archive_reason)
            SELECT id, name, state_json, version, created_at, NOW(), 'deleted'
            FROM rooms WHERE id = ?")->execute([$id]);
        $pdo->prepare('DELETE FROM rooms WHERE id = ?')->execute([$id]);
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Archiv: Raum wiederherstellen
if ($action === 'restore') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $arch = $pdo->prepare('SELECT * FROM rooms_archive WHERE id = ?');
        $arch->execute([$id]);
        $row = $arch->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $pdo->prepare('INSERT INTO rooms (id, name, state_json, version, created_at) VALUES (?, ?, ?, ?, ?)')->execute([$row['id'], $row['name'], $row['state_json'], $row['version'], $row['created_at']]);
            $pdo->prepare('DELETE FROM rooms_archive WHERE id = ?')->execute([$id]);
        }
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Archiv: Einzelnen endgueltig loeschen
if ($action === 'purge') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $pdo->prepare('DELETE FROM rooms_archive WHERE id = ?')->execute([$id]);
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Archiv: Alle endgueltig loeschen
if ($action === 'purge_all') {
    $pdo->exec('DELETE FROM rooms_archive');
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Statistiken
$stats = [];
$stats['rooms_active'] = intval($pdo->query('SELECT COUNT(*) FROM rooms')->fetchColumn());
$stats['rooms_archived'] = intval($pdo->query('SELECT COUNT(*) FROM rooms_archive')->fetchColumn());
$stats['rooms_locked'] = intval($pdo->query('SELECT COUNT(*) FROM rooms WHERE locked = 1')->fetchColumn());
$stats['users_online'] = intval($pdo->query('SELECT COUNT(DISTINCT user_id) FROM room_users WHERE last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)')->fetchColumn());
$stats['messages_total'] = intval($pdo->query('SELECT COUNT(*) FROM room_messages')->fetchColumn());
$stats['messages_today'] = intval($pdo->query('SELECT COUNT(*) FROM room_messages WHERE created_at > CURDATE()')->fetchColumn());
$stats['total_objects'] = 0;
$stats['total_size_kb'] = 0;
foreach ($pdo->query('SELECT state_json, LENGTH(state_json) as sz FROM rooms')->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $stats['total_size_kb'] += intval($row['sz']);
    try { $d = json_decode($row['state_json'], true); if ($d && !empty($d['sites'])) foreach ($d['sites'] as $s) $stats['total_objects'] += count($s['objects'] ?? []); } catch (Exception $e) {}
}
$stats['total_size_kb'] = round($stats['total_size_kb'] / 1024, 1);
$stats['rooms_created_today'] = intval($pdo->query('SELECT COUNT(*) FROM rooms WHERE created_at > CURDATE()')->fetchColumn());

// Liste aller Raeume
$stmt = $pdo->query('SELECT id, name, version, created_at, updated_at, last_activity, IFNULL(locked, 0) as locked,
    IFNULL(TIMESTAMPDIFF(SECOND, NOW(), expires_at), -1) as expires_in,
    LENGTH(state_json) as state_size,
    (SELECT COUNT(*) FROM room_users ru WHERE ru.room_id = rooms.id AND ru.last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)) as online_users
    FROM rooms ORDER BY updated_at DESC');
$rooms = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Archiv laden
$archStmt = $pdo->query('SELECT id, name, version, created_at, archived_at, archive_reason,
    LENGTH(state_json) as state_size,
    TIMESTAMPDIFF(SECOND, archived_at, DATE_ADD(archived_at, INTERVAL 7 DAY)) as total_ttl,
    GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(archived_at, INTERVAL 7 DAY))) as purge_in
    FROM rooms_archive ORDER BY archived_at DESC');
$archived = $archStmt ? $archStmt->fetchAll(PDO::FETCH_ASSOC) : [];

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Collab Admin</title>
<style>
:root { --bg:#0f172a; --surface:#1e293b; --surface2:#334155; --border:#475569; --text:#f1f5f9; --text2:#94a3b8; --accent:#3b82f6; --green:#22c55e; --red:#ef4444; --radius:12px; }
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface);border-bottom:1px solid var(--surface2);position:sticky;top:0;z-index:100}
.topbar h1{font-size:17px;font-weight:600}
.hamburger{background:none;border:none;color:var(--text);cursor:pointer;padding:4px}
.nav-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200}
.nav-overlay.open{display:block}
.nav-drawer{position:fixed;top:0;right:0;width:240px;height:100%;background:var(--surface);z-index:201;transform:translateX(100%);transition:transform 0.2s ease;padding:16px;display:flex;flex-direction:column;gap:4px}
.nav-overlay.open .nav-drawer{transform:translateX(0)}
.nav-item{display:block;padding:12px 14px;border-radius:var(--radius);color:var(--text);text-decoration:none;font-size:15px;cursor:pointer;border:none;background:none;text-align:left;width:100%}
.nav-item:hover,.nav-item.active{background:var(--surface2)}
.nav-item .badge{float:right;background:var(--accent);color:#fff;font-size:11px;padding:1px 7px;border-radius:10px}
.container{max-width:640px;margin:0 auto;padding:16px}
.tab-content{display:none}.tab-content.active{display:block}
.create-form{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.create-form input[type=text]{flex:1;min-width:0;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);font-size:15px;outline:none}
.create-form input::placeholder{color:var(--text2)}
.create-form input:focus{border-color:var(--accent)}
.btn{padding:10px 18px;border:none;border-radius:var(--radius);font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:opacity 0.15s;text-decoration:none;display:inline-block;text-align:center}
.btn:active{opacity:0.8}
.btn-create{background:var(--green);color:#fff}
.btn-link{background:var(--accent);color:#fff}
.btn-delete{background:var(--red);color:#fff}
.btn-lock{background:#f59e0b;color:#fff}
.btn-unlock{background:var(--green);color:#fff}
.btn-sm{padding:6px 12px;font-size:13px}
.ttl-group{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text2)}
.ttl-group input{width:42px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px;text-align:center}
.ttl-group.create-ttl input{width:48px;padding:8px 6px;font-size:14px}
.ttl-group.create-ttl{font-size:14px;color:var(--text)}
.room-list{display:flex;flex-direction:column;gap:10px}
.room-card{background:var(--surface);border:1px solid var(--surface2);border-radius:var(--radius);padding:14px 16px;overflow:hidden}
.room-card.locked{border-color:#f59e0b;opacity:0.8}
.room-card.archived{opacity:0.6;border-style:dashed}
.room-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px}
.room-name{font-weight:600;font-size:15px}
.room-id{font-family:monospace;font-size:12px;color:var(--text2);background:var(--surface2);padding:2px 8px;border-radius:6px}
.room-meta{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--text2);margin-bottom:10px}
.room-meta span{display:flex;align-items:center;gap:4px}
.room-actions{display:flex;flex-wrap:wrap;gap:6px}
.lock-badge{font-size:11px;color:#f59e0b;font-weight:600}
.expiry-badge{font-size:11px;color:var(--text2)}
.expiry-badge.soon{color:var(--red);font-weight:600}
.archive-badge{font-size:11px;padding:1px 6px;border-radius:4px;background:var(--surface2)}
.dot-online{width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block}
.dot-offline{width:7px;height:7px;border-radius:50%;background:var(--border);display:inline-block}
.msg-row{display:flex;gap:4px;margin-top:6px}
.msg-row input{flex:1;min-width:0;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-size:12px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.stat-card{background:var(--surface);border:1px solid var(--surface2);border-radius:var(--radius);padding:14px;text-align:center}
.stat-val{font-size:28px;font-weight:700;color:var(--accent)}
.stat-label{font-size:11px;color:var(--text2);margin-top:2px}
.section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.empty{text-align:center;color:var(--text2);padding:40px 0;font-size:14px}
.hint{font-size:11px;color:var(--text2);margin:-2px 0 16px;line-height:1.4}
.archive-actions{flex-direction:row!important}
.desktop-tabs{display:flex;gap:4px;padding:0 16px 0;background:var(--surface);border-bottom:1px solid var(--surface2)}
.dtab{padding:10px 16px;border:none;background:none;color:var(--text2);font-size:14px;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s}
.dtab.active{color:var(--text);border-bottom-color:var(--accent)}
.dtab:hover{color:var(--text)}
.dtab .badge{background:var(--surface2);color:var(--text2);font-size:11px;padding:1px 7px;border-radius:10px;margin-left:4px}
.dtab.active .badge{background:var(--accent);color:#fff}
@media(max-width:640px){.desktop-tabs{display:none}}
@media(min-width:641px){.topbar .hamburger:last-child{display:none}}
.popup-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:300;align-items:center;justify-content:center;padding:16px}
.popup-overlay.open{display:flex}
.popup-box{background:var(--surface);border:1px solid var(--surface2);border-radius:var(--radius);padding:20px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto}
.popup-title{font-size:17px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.popup-actions{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.popup-actions .btn{text-align:center;padding:12px 18px;font-size:15px}
.popup-section{margin-bottom:14px}
.popup-section label{display:block;font-size:12px;color:var(--text2);margin-bottom:6px}
.popup-section .ttl-group{gap:6px}
.popup-section .ttl-group input{width:50px;padding:8px 6px;font-size:14px}
.popup-section .btn{padding:10px 16px;font-size:14px}
.popup-section .msg-row input{padding:10px 12px;font-size:14px}
.popup-close{display:block;width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:none;color:var(--text2);font-size:14px;cursor:pointer;margin-top:8px}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--green);color:#fff;padding:10px 20px;border-radius:var(--radius);font-size:14px;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:300}
.toast.show{opacity:1}
@media(max-width:480px){
    .room-actions{flex-direction:column}
    .room-actions .btn-sm,.room-actions .ttl-group{width:100%}
    .room-actions .ttl-group{justify-content:center}
    .create-form{flex-direction:column}
    .create-form input,.create-form .btn{width:100%}
    .ttl-group.create-ttl{justify-content:center}
    .stats-grid{grid-template-columns:repeat(2,1fr)}
    .msg-row{flex-direction:column}
}
</style>
</head>
<body>

<!-- Top bar -->
<div class="topbar">
    <h1>Collab Admin</h1>
    <div style="display:flex;align-items:center;gap:8px">
        <button class="hamburger" onclick="toggleSearch()" aria-label="Suche">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button class="hamburger" onclick="toggleSort()" aria-label="Sortieren">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/></svg>
        </button>
        <button class="hamburger" onclick="toggleNav()" aria-label="Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
    </div>
</div>

<!-- Search bar (hidden by default) -->
<div id="search-bar" style="display:none;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--surface2)">
    <input type="text" id="search-input" placeholder="Name oder ID suchen..." oninput="filterRooms()" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text);font-size:15px;outline:none">
</div>

<!-- Sort bar (hidden by default) -->
<div id="sort-bar" style="display:none;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--surface2);display:none">
    <select id="sort-select" onchange="sortRooms()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);color:var(--text);font-size:14px">
        <option value="updated">Letzte Aktivitaet</option>
        <option value="name">Name (A-Z)</option>
        <option value="name-desc">Name (Z-A)</option>
        <option value="created">Erstelldatum</option>
        <option value="online">Online User</option>
        <option value="expiry">Ablaufzeit</option>
    </select>
</div>

<!-- Desktop tab bar -->
<div class="desktop-tabs">
    <button class="dtab active" onclick="showTab('rooms',this)">Raeume <span class="badge"><?= count($rooms) ?></span></button>
    <button class="dtab" onclick="showTab('archive',this)">Archiv <span class="badge"><?= count($archived) ?></span></button>
    <button class="dtab" onclick="showTab('stats',this)">Statistik</button>
</div>

<!-- Mobile navigation drawer -->
<div id="nav-overlay" class="nav-overlay" onclick="toggleNav()">
    <div class="nav-drawer" onclick="event.stopPropagation()">
        <button class="nav-item active" onclick="showTab('rooms')">Aktive Raeume <span class="badge"><?= count($rooms) ?></span></button>
        <button class="nav-item" onclick="showTab('archive')">Archiv <span class="badge"><?= count($archived) ?></span></button>
        <button class="nav-item" onclick="showTab('stats')">Statistik</button>
    </div>
</div>

<div class="container">

    <!-- TAB: Aktive Raeume -->
    <div id="tab-rooms" class="tab-content active">
        <form class="create-form">
            <input type="hidden" name="key" value="<?= htmlspecialchars(ADMIN_KEY) ?>">
            <input type="hidden" name="action" value="create">
            <input type="text" name="name" placeholder="Raumname (optional)">
            <div class="ttl-group create-ttl">
                <input type="number" name="days" value="1" min="0"> T
                <input type="number" name="hours" value="0" min="0" max="23"> Std
                <input type="number" name="minutes" value="0" min="0" max="59"> Min
            </div>
            <button type="submit" class="btn btn-create">+ Erstellen</button>
        </form>
        <p class="hint">Alle Felder 0 = unbegrenzt</p>

        <div class="room-list">
        <?php if (empty($rooms)): ?>
            <div class="empty">Noch keine Raeume erstellt.</div>
        <?php endif; ?>

        <?php foreach ($rooms as $r):
            $isLocked = intval($r['locked']);
            $remaining = intval($r['expires_in']);
            $expiresForever = ($remaining < 0);
            $expiresSoon = false;
            $expiryText = 'Unbegrenzt';
            if (!$expiresForever) {
                if ($remaining <= 0) { $expiryText = 'Abgelaufen'; }
                elseif ($remaining < 3600) { $expiryText = ceil($remaining/60) . ' Min.'; $expiresSoon = true; }
                elseif ($remaining < 86400) { $h = floor($remaining/3600); $m = ceil(($remaining%3600)/60); $expiryText = $h . ' Std. ' . $m . ' Min.'; $expiresSoon = ($remaining < 7200); }
                else { $d = floor($remaining/86400); $h = floor(($remaining%86400)/3600); $expiryText = $d . ' T ' . $h . ' Std.'; }
            }
        ?>
            <div class="room-card <?= $isLocked ? 'locked' : '' ?>" onclick="openRoom('<?= $r['id'] ?>')" style="cursor:pointer"
                 data-name="<?= htmlspecialchars(strtolower($r['name'])) ?>"
                 data-id="<?= $r['id'] ?>"
                 data-updated="<?= $r['updated_at'] ?>"
                 data-created="<?= $r['created_at'] ?>"
                 data-online="<?= $r['online_users'] ?>"
                 data-expiry="<?= $remaining ?>">
                <div class="room-header">
                    <span class="room-name"><?= htmlspecialchars($r['name']) ?> <?= $isLocked ? '<span class="lock-badge">GESPERRT</span>' : '' ?></span>
                    <span class="room-id"><?= htmlspecialchars($r['id']) ?></span>
                </div>
                <div class="room-meta">
                    <span><span class="<?= $r['online_users'] > 0 ? 'dot-online' : 'dot-offline' ?>"></span> <?= $r['online_users'] ?> online</span>
                    <span>v<?= $r['version'] ?></span>
                    <span><?= round($r['state_size'] / 1024, 1) ?> KB</span>
                    <span><?= date('d.m.Y H:i', strtotime($r['last_activity'])) ?></span>
                    <span class="expiry-badge <?= $expiresSoon ? 'soon' : '' ?>"><?= $expiryText ?></span>
                </div>
            </div>
            <!-- Hidden detail popup data -->
            <template id="detail-<?= $r['id'] ?>">
                <div class="popup-title"><?= htmlspecialchars($r['name']) ?> <span class="room-id"><?= $r['id'] ?></span></div>
                <div class="popup-section">
                    <label>Name</label>
                    <div class="msg-row">
                        <input type="text" id="rename-<?= $r['id'] ?>" value="<?= htmlspecialchars($r['name']) ?>">
                        <button class="btn btn-link" onclick="renameRoom('<?= $r['id'] ?>')">Umbenennen</button>
                    </div>
                </div>
                <div class="popup-actions">
                    <button class="btn btn-link" onclick="copyLink('<?= $r['id'] ?>');closePopup()">Link kopieren</button>
                    <?php if ($isLocked): ?>
                        <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=unlock&id=<?= $r['id'] ?>" class="btn btn-unlock">Entsperren</a>
                    <?php else: ?>
                        <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=lock&id=<?= $r['id'] ?>" class="btn btn-lock">Sperren</a>
                    <?php endif; ?>
                    <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=delete&id=<?= $r['id'] ?>" class="btn btn-delete" onclick="return confirm('Raum wirklich loeschen?')">Loeschen</a>
                </div>
                <div class="popup-section">
                    <label>Ablauf neu setzen</label>
                    <form class="ttl-group" style="justify-content:center" onsubmit="return setTtl(event,'<?= $r['id'] ?>')">
                        <input type="number" name="days" value="0" min="0"> T
                        <input type="number" name="hours" value="0" min="0"> S
                        <input type="number" name="minutes" value="0" min="0"> M
                        <button type="submit" class="btn btn-link">Setzen</button>
                    </form>
                </div>
                <div class="popup-section">
                    <label>Nachricht senden</label>
                    <div class="msg-row">
                        <input type="text" id="msg-<?= $r['id'] ?>" placeholder="Nachricht an Raum...">
                        <button class="btn btn-link" onclick="sendMsg('<?= $r['id'] ?>')">Senden</button>
                        <button class="btn btn-sm" style="background:var(--surface2);color:var(--text)" onclick="loadHistory('<?= $r['id'] ?>')">Verlauf</button>
                    </div>
                    <div id="history-<?= $r['id'] ?>" style="display:none;margin-top:8px"></div>
                </div>
            </template>
        <?php endforeach; ?>
        </div>
    </div>

    <!-- TAB: Archiv -->
    <div id="tab-archive" class="tab-content">
        <?php if (empty($archived)): ?>
            <div class="empty">Archiv ist leer.</div>
        <?php else: ?>
            <div class="section-header">
                <span><?= count($archived) ?> archivierte Raeume</span>
                <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=purge_all" class="btn btn-delete btn-sm" onclick="return confirm('Alle endgueltig loeschen?')">Alle loeschen</a>
            </div>
            <div class="room-list">
            <?php foreach ($archived as $a):
                $purgeIn = intval($a['purge_in']);
                $daysLeft = max(1, ceil($purgeIn / 86400));
                $reason = $a['archive_reason'] === 'expired' ? 'Abgelaufen' : 'Geloescht';
            ?>
                <div class="room-card archived">
                    <div class="room-header">
                        <span class="room-name"><?= htmlspecialchars($a['name']) ?> <span class="archive-badge"><?= $reason ?></span></span>
                        <span class="room-id"><?= htmlspecialchars($a['id']) ?></span>
                    </div>
                    <div class="room-meta">
                        <span>v<?= $a['version'] ?></span>
                        <span><?= round($a['state_size'] / 1024, 1) ?> KB</span>
                        <span><?= date('d.m.Y H:i', strtotime($a['archived_at'])) ?></span>
                        <span>Loeschung in <?= $daysLeft ?> T</span>
                    </div>
                    <div class="room-actions archive-actions">
                        <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=restore&id=<?= $a['id'] ?>" class="btn btn-unlock btn-sm" style="flex:1;text-align:center">Wiederherstellen</a>
                        <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=purge&id=<?= $a['id'] ?>" class="btn btn-delete btn-sm" onclick="return confirm('Endgueltig loeschen?')" style="flex:1;text-align:center">Loeschen</a>
                    </div>
                </div>
    <?php endforeach; ?>
    </div>
    <?php endif; ?>
    </div>

    <!-- TAB: Statistik -->
    <div id="tab-stats" class="tab-content">
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-val"><?= $stats['rooms_active'] ?></div><div class="stat-label">Aktive Raeume</div></div>
            <div class="stat-card"><div class="stat-val"><?= $stats['users_online'] ?></div><div class="stat-label">User online</div></div>
            <div class="stat-card"><div class="stat-val"><?= $stats['total_objects'] ?></div><div class="stat-label">Objekte gesamt</div></div>
            <div class="stat-card"><div class="stat-val"><?= $stats['total_size_kb'] ?></div><div class="stat-label">KB Daten</div></div>
            <div class="stat-card"><div class="stat-val"><?= $stats['messages_today'] ?></div><div class="stat-label">Nachrichten heute</div></div>
            <div class="stat-card"><div class="stat-val"><?= $stats['rooms_created_today'] ?></div><div class="stat-label">Erstellt heute</div></div>
            <div class="stat-card"><div class="stat-val"><?= $stats['rooms_locked'] ?></div><div class="stat-label">Gesperrt</div></div>
            <div class="stat-card"><div class="stat-val"><?= $stats['rooms_archived'] ?></div><div class="stat-label">Im Archiv</div></div>
        </div>
    </div>

</div>

<!-- Room detail popup -->
<div id="popup-overlay" class="popup-overlay" onclick="if(event.target===this)closePopup()">
    <div class="popup-box" id="popup-box"></div>
</div>

<div id="toast" class="toast"></div>

<script>
function copyLink(id) {
    const url = location.origin + location.pathname.replace('api/admin.php', '') + '?room=' + id;
    navigator.clipboard.writeText(url);
    showToast('Link kopiert!');
}
function setTtl(e, id) {
    e.preventDefault();
    const f = e.target;
    const d = f.days.value || 0, h = f.hours.value || 0, m = f.minutes.value || 0;
    location.href = '?key=<?= urlencode(ADMIN_KEY) ?>&action=set_ttl&id=' + id + '&days=' + d + '&hours=' + h + '&minutes=' + m;
    return false;
}
function sendMsg(id) {
    const input = document.getElementById('msg-' + id);
    const msg = input.value.trim();
    if (!msg) return;
    location.href = '?key=<?= urlencode(ADMIN_KEY) ?>&action=message&id=' + id + '&msg=' + encodeURIComponent(msg);
}
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}
function toggleSearch() {
    const bar = document.getElementById('search-bar');
    const isOpen = bar.style.display !== 'none';
    bar.style.display = isOpen ? 'none' : 'block';
    document.getElementById('sort-bar').style.display = 'none';
    if (!isOpen) document.getElementById('search-input').focus();
    else { document.getElementById('search-input').value = ''; filterRooms(); }
}
function toggleSort() {
    const bar = document.getElementById('sort-bar');
    bar.style.display = bar.style.display !== 'none' ? 'none' : 'block';
    document.getElementById('search-bar').style.display = 'none';
}
function filterRooms() {
    const q = document.getElementById('search-input').value.toLowerCase().trim();
    document.querySelectorAll('#tab-rooms .room-list .room-card').forEach(card => {
        const name = card.dataset.name || '';
        const id = card.dataset.id || '';
        // Also hide the associated template
        card.style.display = (!q || name.includes(q) || id.includes(q)) ? '' : 'none';
    });
}
function sortRooms() {
    const key = document.getElementById('sort-select').value;
    const list = document.querySelector('#tab-rooms .room-list');
    const cards = Array.from(list.querySelectorAll('.room-card'));
    // Collect card + next template pairs
    const pairs = cards.map(c => ({ card: c, tpl: c.nextElementSibling }));
    pairs.sort((a, b) => {
        const ac = a.card, bc = b.card;
        switch (key) {
            case 'name': return (ac.dataset.name || '').localeCompare(bc.dataset.name || '');
            case 'name-desc': return (bc.dataset.name || '').localeCompare(ac.dataset.name || '');
            case 'created': return (ac.dataset.created || '').localeCompare(bc.dataset.created || '');
            case 'online': return parseInt(bc.dataset.online||0) - parseInt(ac.dataset.online||0);
            case 'expiry': return parseInt(ac.dataset.expiry||999999) - parseInt(bc.dataset.expiry||999999);
            default: return (bc.dataset.updated || '').localeCompare(ac.dataset.updated || '');
        }
    });
    pairs.forEach(p => { list.appendChild(p.card); if (p.tpl && p.tpl.tagName === 'TEMPLATE') list.appendChild(p.tpl); });
}
async function loadHistory(roomId) {
    const el = document.getElementById('history-' + roomId);
    if (el.style.display !== 'none') { el.style.display = 'none'; return; }
    el.innerHTML = '<span style="color:var(--text2);font-size:12px">Laden...</span>';
    el.style.display = 'block';
    try {
        const resp = await fetch('?key=<?= urlencode(ADMIN_KEY) ?>&action=messages&id=' + roomId);
        const data = await resp.json();
        if (!data.messages || !data.messages.length) {
            el.innerHTML = '<span style="color:var(--text2);font-size:12px">Keine Nachrichten.</span>';
            return;
        }
        let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:12px;color:var(--text2)">' + data.messages.length + ' Nachrichten</span><button class="btn btn-delete btn-sm" onclick="clearMsgs(\'' + roomId + '\')">Alle loeschen</button></div>';
        data.messages.forEach(m => {
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--surface2);font-size:12px">'
                + '<div><strong style="color:var(--accent)">' + esc(m.user_name) + '</strong> <span style="color:var(--text2)">' + m.created_at + '</span><br>' + esc(m.message) + '</div>'
                + '<button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0 4px" onclick="deleteMsg(' + m.id + ',\'' + roomId + '\')">&times;</button>'
                + '</div>';
        });
        el.innerHTML = html;
    } catch (e) { el.innerHTML = '<span style="color:var(--red);font-size:12px">Fehler</span>'; }
}
async function deleteMsg(msgId, roomId) {
    await fetch('?key=<?= urlencode(ADMIN_KEY) ?>&action=delete_msg&msgId=' + msgId);
    loadHistory(roomId);
}
async function clearMsgs(roomId) {
    if (!confirm('Alle Nachrichten loeschen?')) return;
    await fetch('?key=<?= urlencode(ADMIN_KEY) ?>&action=clear_msgs&id=' + roomId);
    loadHistory(roomId);
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function renameRoom(id) {
    const input = document.getElementById('rename-' + id);
    const name = input.value.trim();
    if (!name) return;
    location.href = '?key=<?= urlencode(ADMIN_KEY) ?>&action=rename&id=' + id + '&name=' + encodeURIComponent(name);
}
function openRoom(id) {
    const tpl = document.getElementById('detail-' + id);
    if (!tpl) return;
    const box = document.getElementById('popup-box');
    box.innerHTML = tpl.innerHTML + '<button class="popup-close" onclick="closePopup()">Schliessen</button>';
    document.getElementById('popup-overlay').classList.add('open');
}
function closePopup() {
    document.getElementById('popup-overlay').classList.remove('open');
}
function toggleNav() {
    document.getElementById('nav-overlay').classList.toggle('open');
}
function showTab(name, dtabEl) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    // Highlight nav items
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.dtab').forEach(b => b.classList.remove('active'));
    if (dtabEl) {
        dtabEl.classList.add('active');
    } else {
        if (event && event.target) event.target.closest('.nav-item').classList.add('active');
        toggleNav();
    }
    // Sync desktop tabs
    document.querySelectorAll('.dtab').forEach(b => {
        if (b.textContent.toLowerCase().includes(name === 'rooms' ? 'raeume' : name === 'archive' ? 'archiv' : 'statistik')) b.classList.add('active');
    });
}
</script>
</body>
</html>
