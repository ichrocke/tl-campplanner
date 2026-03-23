<?php
// Einmalig ausfuehren: Datenbank-Tabellen erstellen
// Aufruf: php api/setup.php  ODER  im Browser: api/setup.php?key=ADMIN_KEY
require_once __DIR__ . '/db.php';

if (php_sapi_name() !== 'cli') {
    if (($_GET['key'] ?? '') !== ADMIN_KEY) {
        jsonResponse(['error' => 'Unauthorized'], 403);
    }
}

$pdo = getDB();

$pdo->exec("CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(12) PRIMARY KEY,
    name VARCHAR(255) DEFAULT '',
    state_json LONGTEXT NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$pdo->exec("CREATE TABLE IF NOT EXISTS room_users (
    room_id VARCHAR(12) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    user_name VARCHAR(50) NOT NULL,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

echo "Tabellen erfolgreich erstellt.\n";
