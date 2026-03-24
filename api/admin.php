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
:root {
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #334155;
    --border: #475569;
    --text: #f1f5f9;
    --text2: #94a3b8;
    --accent: #3b82f6;
    --green: #22c55e;
    --red: #ef4444;
    --radius: 12px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 16px;
}
.container { max-width: 640px; margin: 0 auto; }
h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface2);
}
.create-form {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
}
.create-form input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font-size: 15px;
    outline: none;
}
.create-form input:focus {
    border-color: var(--accent);
}
.create-form input::placeholder {
    color: var(--text2);
}
.btn {
    padding: 10px 18px;
    border: none;
    border-radius: var(--radius);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
}
.btn:active { opacity: 0.8; }
.btn-create { background: var(--green); color: #fff; }
.btn-link { background: var(--accent); color: #fff; }
.btn-delete { background: var(--red); color: #fff; }
.btn-lock { background: #f59e0b; color: #fff; }
.btn-unlock { background: var(--green); color: #fff; }
.btn-sm { padding: 6px 12px; font-size: 13px; }
.room-card.locked { border-color: #f59e0b; opacity: 0.8; }
.lock-badge { font-size: 11px; color: #f59e0b; font-weight: 600; }
.expiry-badge { font-size: 11px; color: var(--text2); }
.expiry-badge.soon { color: var(--red); font-weight: 600; }
.ttl-group {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text2);
}
.ttl-group input {
    width: 42px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface2);
    color: var(--text);
    font-size: 12px;
    text-align: center;
}
.ttl-group.create-ttl input {
    width: 48px;
    padding: 8px 6px;
    font-size: 14px;
}
.ttl-group.create-ttl { font-size: 14px; color: var(--text); }
.create-form { flex-wrap: wrap; }
.room-card.archived { opacity: 0.6; border-style: dashed; }
.archive-badge { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--surface2); }
.section-title {
    font-size: 16px; font-weight: 600; margin: 32px 0 12px;
    padding-top: 16px; border-top: 1px solid var(--surface2);
    display: flex; justify-content: space-between; align-items: center;
}

.room-list { display: flex; flex-direction: column; gap: 10px; }

.room-card {
    background: var(--surface);
    border: 1px solid var(--surface2);
    border-radius: var(--radius);
    padding: 14px 16px;
}
.room-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
.room-name {
    font-weight: 600;
    font-size: 15px;
}
.room-id {
    font-family: monospace;
    font-size: 12px;
    color: var(--text2);
    background: var(--surface2);
    padding: 2px 8px;
    border-radius: 6px;
}
.room-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: var(--text2);
    margin-bottom: 10px;
}
.room-meta span { display: flex; align-items: center; gap: 4px; }
.dot-online {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--green);
    display: inline-block;
}
.dot-offline {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--border);
    display: inline-block;
}
.room-actions {
    display: flex;
    gap: 8px;
}
.empty {
    text-align: center;
    color: var(--text2);
    padding: 40px 0;
    font-size: 14px;
}
.toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--green);
    color: #fff;
    padding: 10px 20px;
    border-radius: var(--radius);
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
}
.toast.show { opacity: 1; }
</style>
</head>
<body>
<div class="container">
    <h1>Zeltplatzplaner Collab</h1>

    <form class="create-form">
        <input type="hidden" name="key" value="<?= htmlspecialchars(ADMIN_KEY) ?>">
        <input type="hidden" name="action" value="create">
        <input type="text" name="name" placeholder="Raumname (optional)" style="flex:1">
        <div class="ttl-group create-ttl">
            <input type="number" name="days" value="1" min="0"> T
            <input type="number" name="hours" value="0" min="0" max="23"> Std
            <input type="number" name="minutes" value="0" min="0" max="59"> Min
        </div>
        <button type="submit" class="btn btn-create">+ Erstellen</button>
    </form>
    <p style="font-size:11px;color:var(--text2);margin:-16px 0 20px">Alle Felder 0 = unbegrenzt</p>

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
            elseif ($remaining < 3600) { $expiryText = 'Laeuft ab in ' . ceil($remaining/60) . ' Min.'; $expiresSoon = true; }
            elseif ($remaining < 86400) { $h = floor($remaining/3600); $m = ceil(($remaining%3600)/60); $expiryText = 'Laeuft ab in ' . $h . ' Std. ' . $m . ' Min.'; $expiresSoon = ($remaining < 7200); }
            else { $d = floor($remaining/86400); $h = floor(($remaining%86400)/3600); $expiryText = 'Laeuft ab in ' . $d . ' T ' . $h . ' Std.'; }
        }
    ?>
        <div class="room-card <?= $isLocked ? 'locked' : '' ?>">
            <div class="room-header">
                <span class="room-name"><?= htmlspecialchars($r['name']) ?> <?= $isLocked ? '<span class="lock-badge">GESPERRT</span>' : '' ?></span>
                <span class="room-id"><?= htmlspecialchars($r['id']) ?></span>
            </div>
            <div class="room-meta">
                <span>
                    <span class="<?= $r['online_users'] > 0 ? 'dot-online' : 'dot-offline' ?>"></span>
                    <?= $r['online_users'] ?> online
                </span>
                <span>v<?= $r['version'] ?></span>
                <span><?= round($r['state_size'] / 1024, 1) ?> KB</span>
                <span><?= date('d.m.Y H:i', strtotime($r['last_activity'])) ?></span>
                <span class="expiry-badge <?= $expiresSoon ? 'soon' : '' ?>"><?= $expiryText ?></span>
            </div>
            <div class="room-actions">
                <button class="btn btn-link btn-sm" onclick="copyLink('<?= $r['id'] ?>')">Link kopieren</button>
                <form class="ttl-group" style="margin:0" onsubmit="return setTtl(event, '<?= $r['id'] ?>')">
                    <input type="number" name="days" value="0" min="0" placeholder="T"> T
                    <input type="number" name="hours" value="0" min="0" placeholder="S"> S
                    <input type="number" name="minutes" value="0" min="0" placeholder="M"> M
                    <button type="submit" class="btn btn-link btn-sm" style="padding:4px 8px">Setzen</button>
                </form>
                <?php if ($isLocked): ?>
                    <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=unlock&id=<?= $r['id'] ?>"
                       class="btn btn-unlock btn-sm">Entsperren</a>
                <?php else: ?>
                    <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=lock&id=<?= $r['id'] ?>"
                       class="btn btn-lock btn-sm">Sperren</a>
                <?php endif; ?>
                <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=delete&id=<?= $r['id'] ?>"
                   class="btn btn-delete btn-sm" onclick="return confirm('Raum wirklich loeschen?')">Loeschen</a>
            </div>
        </div>
    <?php endforeach; ?>
    </div>

    <?php if (!empty($archived)): ?>
    <div class="section-title">
        Archiv (<?= count($archived) ?>)
        <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=purge_all"
           class="btn btn-delete btn-sm" onclick="return confirm('Alle archivierten Raeume endgueltig loeschen?')">Alle loeschen</a>
    </div>
    <div class="room-list">
    <?php foreach ($archived as $a):
        $purgeIn = intval($a['purge_in']);
        $daysLeft = ceil($purgeIn / 86400);
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
                <span>Archiviert: <?= date('d.m.Y H:i', strtotime($a['archived_at'])) ?></span>
                <span>Wird geloescht in <?= $daysLeft ?> T</span>
            </div>
            <div class="room-actions">
                <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=restore&id=<?= $a['id'] ?>"
                   class="btn btn-unlock btn-sm">Wiederherstellen</a>
                <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=purge&id=<?= $a['id'] ?>"
                   class="btn btn-delete btn-sm" onclick="return confirm('Endgueltig loeschen?')">Endgueltig loeschen</a>
            </div>
        </div>
    <?php endforeach; ?>
    </div>
    <?php endif; ?>
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
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}
</script>
</body>
</html>
