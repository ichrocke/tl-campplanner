<?php
// GET ?room=xxx&since=N – Aktuellen State abrufen
require_once __DIR__ . '/db.php';

$roomId = $_GET['room'] ?? '';
$since = intval($_GET['since'] ?? 0);

if (!$roomId || !preg_match('/^[a-z0-9]{4,12}$/', $roomId)) {
    jsonResponse(['error' => 'Invalid room ID'], 400);
}

$pdo = getDB();
cleanupExpiredRooms();
$stmt = $pdo->prepare('SELECT state_json, version, IFNULL(locked, 0) as locked FROM rooms WHERE id = ?');
$stmt->execute([$roomId]);
$room = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$room) {
    jsonResponse(['error' => 'Room not found'], 404);
}

$locked = intval($room['locked']);

// Wenn Client bereits auf dem neuesten Stand ist
if ($since > 0 && intval($room['version']) <= $since) {
    jsonResponse(['changed' => false, 'version' => intval($room['version']), 'locked' => $locked]);
}

// last_activity aktualisieren
$pdo->prepare('UPDATE rooms SET last_activity = NOW() WHERE id = ?')->execute([$roomId]);

jsonResponse([
    'changed' => true,
    'version' => intval($room['version']),
    'state' => $room['state_json'],
    'locked' => $locked,
]);
