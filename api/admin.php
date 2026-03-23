<?php
// Admin-Seite: Raeume erstellen, auflisten, loeschen
// Aufruf: api/admin.php?key=ADMIN_KEY
require_once __DIR__ . '/db.php';

if (($_GET['key'] ?? '') !== ADMIN_KEY) {
    jsonResponse(['error' => 'Unauthorized'], 403);
}

$pdo = getDB();
$action = $_GET['action'] ?? 'list';

// Raum erstellen
if ($action === 'create') {
    $name = $_GET['name'] ?? 'Neuer Raum';
    $id = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);
    $emptyState = json_encode([
        'version' => 1,
        'sites' => [],
        'minDistance' => 2,
        'displaySettings' => new stdClass(),
        'showDistances' => false,
        'minimapEnabled' => true,
    ]);
    $stmt = $pdo->prepare('INSERT INTO rooms (id, name, state_json) VALUES (?, ?, ?)');
    $stmt->execute([$id, $name, $emptyState]);
    jsonResponse(['ok' => true, 'roomId' => $id, 'name' => $name]);
}

// Raum loeschen
if ($action === 'delete') {
    $id = $_GET['id'] ?? '';
    if (!$id) jsonResponse(['error' => 'Missing id'], 400);
    $stmt = $pdo->prepare('DELETE FROM rooms WHERE id = ?');
    $stmt->execute([$id]);
    jsonResponse(['ok' => true]);
}

// Liste aller Raeume
$stmt = $pdo->query('SELECT id, name, version, created_at, updated_at, last_activity,
    LENGTH(state_json) as state_size,
    (SELECT COUNT(*) FROM room_users ru WHERE ru.room_id = rooms.id AND ru.last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)) as online_users
    FROM rooms ORDER BY updated_at DESC');
$rooms = $stmt->fetchAll(PDO::FETCH_ASSOC);

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html>
<head><title>Collab Admin</title>
<style>
body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: left; font-size: 14px; }
th { background: #f5f5f5; }
a { color: #2563eb; }
.btn { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
.btn-create { background: #22c55e; color: #fff; }
.btn-delete { background: #ef4444; color: #fff; font-size: 12px; }
.btn-copy { background: #3b82f6; color: #fff; font-size: 12px; }
input[type=text] { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; }
</style>
</head>
<body>
<h2>Zeltplatzplaner – Collab Admin</h2>

<form style="margin: 20px 0; display:flex; gap:8px; align-items:center;">
    <input type="hidden" name="key" value="<?= htmlspecialchars(ADMIN_KEY) ?>">
    <input type="hidden" name="action" value="create">
    <input type="text" name="name" placeholder="Raumname" value="Neuer Raum" style="width:200px">
    <button type="submit" class="btn btn-create">Raum erstellen</button>
</form>

<table>
<tr>
    <th>ID</th><th>Name</th><th>Version</th><th>Online</th>
    <th>Erstellt</th><th>Letzte Aktivitaet</th><th>Groesse</th><th>Aktionen</th>
</tr>
<?php foreach ($rooms as $r): ?>
<tr>
    <td><code><?= htmlspecialchars($r['id']) ?></code></td>
    <td><?= htmlspecialchars($r['name']) ?></td>
    <td><?= $r['version'] ?></td>
    <td><?= $r['online_users'] ?></td>
    <td><?= $r['created_at'] ?></td>
    <td><?= $r['last_activity'] ?></td>
    <td><?= round($r['state_size'] / 1024, 1) ?> KB</td>
    <td>
        <button class="btn btn-copy" onclick="copyLink('<?= $r['id'] ?>')">Link</button>
        <a href="?key=<?= urlencode(ADMIN_KEY) ?>&action=delete&id=<?= $r['id'] ?>"
           class="btn btn-delete" onclick="return confirm('Raum wirklich loeschen?')">X</a>
    </td>
</tr>
<?php endforeach; ?>
</table>

<?php if (empty($rooms)): ?>
<p style="color:#888">Keine Raeume vorhanden.</p>
<?php endif; ?>

<script>
function copyLink(id) {
    const url = location.origin + location.pathname.replace('api/admin.php', '') + '?room=' + id;
    navigator.clipboard.writeText(url);
    alert('Link kopiert: ' + url);
}
</script>
</body>
</html>
