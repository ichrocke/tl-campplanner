<?php
// Admin-Seite: Raeume erstellen, auflisten, loeschen
// Aufruf: api/admin.php?key=ADMIN_KEY
require_once __DIR__ . '/db.php';

if (($_GET['key'] ?? '') !== ADMIN_KEY) {
    jsonResponse(['error' => 'Unauthorized'], 403);
}

$pdo = getDB();
$action = $_GET['action'] ?? 'list';

// Ablauf-Hilfsfunktion
function calcExpiry($ttl) {
    if (!$ttl || $ttl === 'forever') return null;
    $hours = intval($ttl);
    if ($hours <= 0) return null;
    return date('Y-m-d H:i:s', time() + $hours * 3600);
}

// Abgelaufene Raeume aufraeumen
cleanupExpiredRooms();

// Raum erstellen
if ($action === 'create') {
    $name = trim($_GET['name'] ?? '');
    if (!$name) $name = 'Raum ' . date('d.m.Y H:i');
    $ttl = $_GET['ttl'] ?? 'forever';
    $expiresAt = calcExpiry($ttl);
    $id = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);
    $emptyState = json_encode([
        'version' => 1,
        'sites' => [],
        'minDistance' => 2,
        'displaySettings' => new stdClass(),
        'showDistances' => false,
        'minimapEnabled' => true,
    ]);
    $stmt = $pdo->prepare('INSERT INTO rooms (id, name, state_json, expires_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$id, $name, $emptyState, $expiresAt]);
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Ablauf aendern
if ($action === 'set_ttl') {
    $id = $_GET['id'] ?? '';
    $ttl = $_GET['ttl'] ?? 'forever';
    if ($id) {
        if ($ttl === 'forever') {
            $pdo->prepare('UPDATE rooms SET expires_at = NULL WHERE id = ?')->execute([$id]);
        } else {
            $expiresAt = calcExpiry($ttl);
            $pdo->prepare('UPDATE rooms SET expires_at = ? WHERE id = ?')->execute([$expiresAt, $id]);
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

// Raum loeschen
if ($action === 'delete') {
    $id = $_GET['id'] ?? '';
    if ($id) {
        $stmt = $pdo->prepare('DELETE FROM rooms WHERE id = ?');
        $stmt->execute([$id]);
    }
    header('Location: admin.php?key=' . urlencode(ADMIN_KEY));
    exit;
}

// Liste aller Raeume
$stmt = $pdo->query('SELECT id, name, version, created_at, updated_at, last_activity, IFNULL(locked, 0) as locked, expires_at,
    LENGTH(state_json) as state_size,
    (SELECT COUNT(*) FROM room_users ru WHERE ru.room_id = rooms.id AND ru.last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)) as online_users
    FROM rooms ORDER BY updated_at DESC');
$rooms = $stmt->fetchAll(PDO::FETCH_ASSOC);

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
.ttl-select {
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface2);
    color: var(--text);
    font-size: 12px;
}
.create-form { flex-wrap: wrap; }

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
        <select name="ttl" style="padding:10px 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);font-size:14px">
            <option value="forever">Unbegrenzt</option>
            <option value="6">6 Stunden</option>
            <option value="12">12 Stunden</option>
            <option value="24" selected>1 Tag</option>
            <option value="72">3 Tage</option>
            <option value="168">7 Tage</option>
            <option value="720">30 Tage</option>
        </select>
        <button type="submit" class="btn btn-create">+ Erstellen</button>
    </form>

    <div class="room-list">
    <?php if (empty($rooms)): ?>
        <div class="empty">Noch keine Raeume erstellt.</div>
    <?php endif; ?>

    <?php foreach ($rooms as $r):
        $isLocked = intval($r['locked']);
        $expiresAt = $r['expires_at'];
        $expiresForever = ($expiresAt === null);
        $expiresSoon = false;
        $expiryText = 'Unbegrenzt';
        if (!$expiresForever) {
            $remaining = strtotime($expiresAt) - time();
            if ($remaining <= 0) { $expiryText = 'Abgelaufen'; }
            elseif ($remaining < 3600) { $expiryText = 'Laeuft ab in ' . ceil($remaining/60) . ' Min.'; $expiresSoon = true; }
            elseif ($remaining < 86400) { $expiryText = 'Laeuft ab in ' . round($remaining/3600, 1) . ' Std.'; $expiresSoon = ($remaining < 7200); }
            else { $expiryText = 'Laeuft ab am ' . date('d.m.Y H:i', strtotime($expiresAt)); }
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
                <select class="ttl-select" onchange="setTtl('<?= $r['id'] ?>', this.value)">
                    <option value="" disabled selected>Ablauf...</option>
                    <option value="forever">Unbegrenzt</option>
                    <option value="6">6 Std.</option>
                    <option value="12">12 Std.</option>
                    <option value="24">1 Tag</option>
                    <option value="72">3 Tage</option>
                    <option value="168">7 Tage</option>
                    <option value="720">30 Tage</option>
                </select>
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
</div>

<div id="toast" class="toast"></div>

<script>
function copyLink(id) {
    const url = location.origin + location.pathname.replace('api/admin.php', '') + '?room=' + id;
    navigator.clipboard.writeText(url);
    showToast('Link kopiert!');
}
function setTtl(id, ttl) {
    location.href = '?key=<?= urlencode(ADMIN_KEY) ?>&action=set_ttl&id=' + id + '&ttl=' + ttl;
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
