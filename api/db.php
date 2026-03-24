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

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
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
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}
