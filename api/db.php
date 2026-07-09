<?php
require_once __DIR__ . '/config.php';

function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }
    return $pdo;
}

// S6: restrict CORS to our own domain instead of a wildcard. Same-origin
// requests (the actual app) are unaffected; only cross-origin callers are
// blocked. Override the list in config.php via ALLOWED_ORIGINS if needed.
function corsAllowOrigin() {
    $allowed = defined('ALLOWED_ORIGINS') ? ALLOWED_ORIGINS : [
        'https://campplanner.tyra-lorena.de',
        'http://campplanner.tyra-lorena.de',
        'https://www.campplanner.tyra-lorena.de',
        'http://www.campplanner.tyra-lorena.de',
    ];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    return in_array($origin, $allowed, true) ? $origin : $allowed[0];
}

function sendCorsHeaders() {
    header('Access-Control-Allow-Origin: ' . corsAllowOrigin());
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    sendCorsHeaders();
    echo json_encode($data);
    exit;
}

// Abgelaufene Raeume ins Archiv verschieben + alte Archive loeschen
function cleanupExpiredRooms() {
    try {
        $pdo = getDB();
        // Abgelaufene Raeume archivieren
        $pdo->exec("INSERT IGNORE INTO rooms_archive (id, name, state_json, version, created_at, archived_at, archive_reason)
            SELECT id, name, state_json, version, created_at, NOW(), 'expired'
            FROM rooms WHERE expires_at IS NOT NULL AND expires_at < NOW()");
        $pdo->exec("DELETE FROM rooms WHERE expires_at IS NOT NULL AND expires_at < NOW()");
        // Archive aelter als 7 Tage endgueltig loeschen
        $pdo->exec("DELETE FROM rooms_archive WHERE archived_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
    } catch (Exception $e) {}
}

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    sendCorsHeaders();
    exit;
}
