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

// Raum-ID generieren
$id = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);

$emptyState = json_encode([
    'version' => 1,
    'sites' => [],
    'minDistance' => 2,
    'displaySettings' => new stdClass(),
    'showDistances' => false,
    'minimapEnabled' => true,
]);

$pdo = getDB();

// 8 Stunden Gueltigkeit
$stmt = $pdo->prepare('INSERT INTO rooms (id, name, state_json, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))');
$stmt->execute([$id, $name, $emptyState]);

jsonResponse(['ok' => true, 'roomId' => $id, 'name' => $name]);
