<?php
// POST – Neuen State senden mit Versionspruefung
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'POST required'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    jsonResponse(['error' => 'Invalid JSON'], 400);
}

$roomId = $input['roomId'] ?? '';
$state = $input['state'] ?? '';
$expectedVersion = intval($input['expectedVersion'] ?? 0);

if (!$roomId || !preg_match('/^[a-z0-9]{4,12}$/', $roomId)) {
    jsonResponse(['error' => 'Invalid room ID'], 400);
}
if (!$state || strlen($state) > MAX_STATE_SIZE) {
    jsonResponse(['error' => 'State empty or too large'], 400);
}
if ($expectedVersion < 1) {
    jsonResponse(['error' => 'Invalid version'], 400);
}

$pdo = getDB();

// Optimistic Concurrency: nur updaten wenn Version stimmt
$stmt = $pdo->prepare('UPDATE rooms SET state_json = ?, version = version + 1, last_activity = NOW() WHERE id = ? AND version = ?');
$stmt->execute([$state, $roomId, $expectedVersion]);

if ($stmt->rowCount() === 0) {
    // Versionskonflikt – jemand anderes war schneller
    $stmt2 = $pdo->prepare('SELECT state_json, version FROM rooms WHERE id = ?');
    $stmt2->execute([$roomId]);
    $current = $stmt2->fetch(PDO::FETCH_ASSOC);
    if (!$current) {
        jsonResponse(['error' => 'Room not found'], 404);
    }
    jsonResponse([
        'conflict' => true,
        'currentVersion' => intval($current['version']),
        'state' => $current['state_json'],
    ]);
}

// Erfolg – neue Version zurueckgeben
$stmt3 = $pdo->prepare('SELECT version FROM rooms WHERE id = ?');
$stmt3->execute([$roomId]);
$newVersion = intval($stmt3->fetchColumn());

jsonResponse(['ok' => true, 'version' => $newVersion]);
