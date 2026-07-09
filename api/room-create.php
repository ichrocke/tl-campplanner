<?php
// POST – Raum erstellen (fuer User, 8h Limit)
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'POST required'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) jsonResponse(['error' => 'Invalid JSON'], 400);

$name = trim($input['name'] ?? '');
if (!$name) $name = 'Raum ' . date('d.m.Y H:i');

// S2: cryptographically-strong room IDs. 10 chars from a 36-char alphabet
// (~51 bits). Existing shorter IDs keep working (they still match the
// ^[a-z0-9]{4,12}$ validation everywhere) – nothing is migrated.
function genRoomId($len = 10) {
    $a = 'abcdefghijklmnopqrstuvwxyz0123456789';
    $max = strlen($a) - 1;
    $id = '';
    for ($i = 0; $i < $len; $i++) $id .= $a[random_int(0, $max)];
    return $id;
}

$emptyState = json_encode([
    'version' => 1,
    'sites' => [],
    'minDistance' => 2,
    'displaySettings' => new stdClass(),
    'showDistances' => false,
    'minimapEnabled' => true,
]);

$pdo = getDB();

// S12: opportunistic cleanup of expired rooms on creation too (not only on
// room-state), so the DB doesn't grow unbounded between reads. A real cron job
// is still recommended for rooms that never get read.
cleanupExpiredRooms();

// Insert with a few retries in case of an (astronomically unlikely) ID collision
$stmt = $pdo->prepare('INSERT INTO rooms (id, name, state_json, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))');
$id = null;
for ($attempt = 0; $attempt < 5; $attempt++) {
    $candidate = genRoomId();
    try {
        $stmt->execute([$candidate, $name, $emptyState]);
        $id = $candidate;
        break;
    } catch (PDOException $e) {
        if ($e->getCode() === '23000' && $attempt < 4) continue; // duplicate key -> retry
        error_log('room-create error: ' . $e->getMessage());
        jsonResponse(['error' => 'Could not create room'], 500);
    }
}

jsonResponse(['ok' => true, 'roomId' => $id, 'name' => $name]);
