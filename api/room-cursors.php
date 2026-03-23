<?php
// POST: Cursor-Position senden + alle Cursor abrufen
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'POST required'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) jsonResponse(['error' => 'Invalid JSON'], 400);

$roomId = $input['roomId'] ?? '';
$userId = $input['userId'] ?? '';
$userName = $input['userName'] ?? '';
$cursorX = floatval($input['x'] ?? 0);
$cursorY = floatval($input['y'] ?? 0);
$color = $input['color'] ?? '#ff0000';

if (!$roomId || !preg_match('/^[a-z0-9]{4,12}$/', $roomId)) {
    jsonResponse(['error' => 'Invalid room ID'], 400);
}

$pdo = getDB();

// Eigenen Cursor updaten
if ($userId) {
    $stmt = $pdo->prepare('REPLACE INTO room_users (room_id, user_id, user_name, cursor_x, cursor_y, color, last_seen) VALUES (?, ?, ?, ?, ?, ?, NOW())');
    $stmt->execute([$roomId, $userId, $userName, $cursorX, $cursorY, $color]);
}

// Alle aktiven Cursor zurueckgeben (ausser eigenen)
$stmt = $pdo->prepare('SELECT user_id, user_name, cursor_x, cursor_y, color FROM room_users WHERE room_id = ? AND last_seen > DATE_SUB(NOW(), INTERVAL 10 SECOND) AND user_id != ?');
$stmt->execute([$roomId, $userId]);
$cursors = $stmt->fetchAll(PDO::FETCH_ASSOC);

jsonResponse(['cursors' => $cursors]);
