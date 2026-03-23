<?php
// GET ?room=xxx&since=N – Server-Sent Events fuer Echtzeit-Updates
require_once __DIR__ . '/config.php';

$roomId = $_GET['room'] ?? '';
$since = intval($_GET['since'] ?? 0);

if (!$roomId || !preg_match('/^[a-z0-9]{4,12}$/', $roomId)) {
    http_response_code(400);
    exit;
}

// SSE-Headers
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('Access-Control-Allow-Origin: *');
header('X-Accel-Buffering: no'); // nginx

// Session freigeben damit andere Requests nicht blockiert werden
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

set_time_limit(SSE_MAX_DURATION + 10);
ignore_user_abort(false);

$startTime = time();
$lastVersion = $since;

while (true) {
    // Zeitlimit pruefen
    if (time() - $startTime > SSE_MAX_DURATION) {
        echo "event: timeout\ndata: reconnect\n\n";
        break;
    }

    // Verbindung noch da?
    if (connection_aborted()) break;

    try {
        // Neue DB-Verbindung pro Check (shared hosting: langlebige Verbindungen problematisch)
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );

        $stmt = $pdo->prepare('SELECT version, state_json FROM rooms WHERE id = ?');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$room) {
            echo "event: error\ndata: room_not_found\n\n";
            break;
        }

        $currentVersion = intval($room['version']);

        if ($currentVersion > $lastVersion) {
            $data = json_encode([
                'version' => $currentVersion,
                'state' => $room['state_json'],
            ]);
            echo "data: $data\n\n";
            $lastVersion = $currentVersion;
        }

        // Online-Status aktualisieren
        $userId = $_GET['uid'] ?? '';
        $userName = $_GET['uname'] ?? '';
        if ($userId) {
            $stmt2 = $pdo->prepare('REPLACE INTO room_users (room_id, user_id, user_name, last_seen) VALUES (?, ?, ?, NOW())');
            $stmt2->execute([$roomId, $userId, $userName]);
        }

        // Aktive User senden
        $stmt3 = $pdo->prepare('SELECT user_id, user_name FROM room_users WHERE room_id = ? AND last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND)');
        $stmt3->execute([$roomId]);
        $users = $stmt3->fetchAll(PDO::FETCH_ASSOC);
        echo "event: users\ndata: " . json_encode($users) . "\n\n";

        $pdo = null; // Verbindung schliessen
    } catch (Exception $e) {
        // DB-Fehler still ignorieren, naechster Versuch
    }

    @ob_flush();
    flush();
    sleep(SSE_POLL_INTERVAL);
}
