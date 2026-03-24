<?php
// GET ?room=xxx&since=N – Nachrichten abrufen (seit ID N)
// POST – Nachricht senden
require_once __DIR__ . '/db.php';

$pdo = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $roomId = $_GET['room'] ?? '';
    $since = intval($_GET['since'] ?? 0);
    if (!$roomId || !preg_match('/^[a-z0-9]{4,12}$/', $roomId)) {
        jsonResponse(['error' => 'Invalid room ID'], 400);
    }
    $stmt = $pdo->prepare('SELECT id, user_name, message, created_at FROM room_messages WHERE room_id = ? AND id > ? ORDER BY id ASC');
    $stmt->execute([$roomId, $since]);
    $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
    jsonResponse(['messages' => $messages]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) jsonResponse(['error' => 'Invalid JSON'], 400);

    $roomId = $input['roomId'] ?? '';
    $userName = trim($input['userName'] ?? '');
    $message = trim($input['message'] ?? '');

    if (!$roomId || !preg_match('/^[a-z0-9]{4,12}$/', $roomId)) {
        jsonResponse(['error' => 'Invalid room ID'], 400);
    }
    if (!$message || mb_strlen($message) > 500) {
        jsonResponse(['error' => 'Message empty or too long (max 500)'], 400);
    }
    if (!$userName) $userName = 'Anonym';

    $stmt = $pdo->prepare('INSERT INTO room_messages (room_id, user_name, message) VALUES (?, ?, ?)');
    $stmt->execute([$roomId, $userName, $message]);

    jsonResponse(['ok' => true, 'id' => intval($pdo->lastInsertId())]);
}

jsonResponse(['error' => 'Method not allowed'], 405);
