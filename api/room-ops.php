<?php
// POST – Einzelne Operationen senden (Object-Level Sync)
// Operationen: add, update, remove (auf Objekt-Ebene)
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'POST required'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) jsonResponse(['error' => 'Invalid JSON'], 400);

$roomId = $input['roomId'] ?? '';
$ops = $input['ops'] ?? [];

if (!$roomId || !preg_match('/^[a-z0-9]{4,12}$/', $roomId)) {
    jsonResponse(['error' => 'Invalid room ID'], 400);
}
if (empty($ops)) {
    jsonResponse(['error' => 'No operations'], 400);
}

$pdo = getDB();

// Sperre pruefen
$lockStmt = $pdo->prepare('SELECT IFNULL(locked, 0) as locked FROM rooms WHERE id = ?');
$lockStmt->execute([$roomId]);
$lockRow = $lockStmt->fetch(PDO::FETCH_ASSOC);
if ($lockRow && intval($lockRow['locked'])) {
    jsonResponse(['error' => 'locked'], 403);
}

// State laden und locken
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT state_json, version FROM rooms WHERE id = ? FOR UPDATE');
    $stmt->execute([$roomId]);
    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) {
        $pdo->rollBack();
        jsonResponse(['error' => 'Room not found'], 404);
    }

    $state = json_decode($room['state_json'], true);
    if (!$state || !isset($state['sites'])) {
        $pdo->rollBack();
        jsonResponse(['error' => 'Invalid state'], 500);
    }

    // Operationen anwenden
    foreach ($ops as $op) {
        $type = $op['type'] ?? '';
        $siteIdx = intval($op['siteIdx'] ?? 0);
        if (!isset($state['sites'][$siteIdx])) continue;
        $site = &$state['sites'][$siteIdx];
        if (!isset($site['objects'])) $site['objects'] = [];

        switch ($type) {
            case 'add':
                if (isset($op['object'])) {
                    // Kein Duplikat einfuegen
                    $exists = false;
                    foreach ($site['objects'] as $o) {
                        if ($o['id'] === $op['object']['id']) { $exists = true; break; }
                    }
                    if (!$exists) $site['objects'][] = $op['object'];
                }
                break;

            case 'update':
                $objId = $op['objectId'] ?? '';
                $props = $op['props'] ?? [];
                if ($objId && !empty($props)) {
                    foreach ($site['objects'] as &$o) {
                        if ($o['id'] === $objId) {
                            foreach ($props as $k => $v) { $o[$k] = $v; }
                            break;
                        }
                    }
                    unset($o);
                }
                break;

            case 'remove':
                $objId = $op['objectId'] ?? '';
                if ($objId) {
                    $site['objects'] = array_values(array_filter($site['objects'], function($o) use ($objId) {
                        return $o['id'] !== $objId;
                    }));
                }
                break;

            case 'reorder':
                // Reihenfolge aktualisieren (nach vorne/hinten)
                $objId = $op['objectId'] ?? '';
                $pos = $op['position'] ?? ''; // 'front' or 'back'
                if ($objId && $pos) {
                    $idx = -1;
                    foreach ($site['objects'] as $i => $o) {
                        if ($o['id'] === $objId) { $idx = $i; break; }
                    }
                    if ($idx >= 0) {
                        $obj = $site['objects'][$idx];
                        array_splice($site['objects'], $idx, 1);
                        if ($pos === 'front') $site['objects'][] = $obj;
                        else array_unshift($site['objects'], $obj);
                    }
                }
                break;

            case 'site_props':
                // Site-Level Properties (templates, layers, etc.)
                $props = $op['props'] ?? [];
                foreach ($props as $k => $v) {
                    if ($k !== 'objects' && $k !== 'id') { // objects duerfen nicht direkt ueberschrieben werden
                        $site[$k] = $v;
                    }
                }
                break;

            case 'state_props':
                // Top-level state properties (minDistance, displaySettings, etc.)
                $props = $op['props'] ?? [];
                foreach ($props as $k => $v) {
                    if ($k !== 'sites') { $state[$k] = $v; }
                }
                break;
        }
    }

    // State zurueckschreiben
    $newJson = json_encode($state, JSON_UNESCAPED_UNICODE);
    $updateStmt = $pdo->prepare('UPDATE rooms SET state_json = ?, version = version + 1, last_activity = NOW() WHERE id = ?');
    $updateStmt->execute([$newJson, $roomId]);

    $verStmt = $pdo->prepare('SELECT version FROM rooms WHERE id = ?');
    $verStmt->execute([$roomId]);
    $newVersion = intval($verStmt->fetchColumn());

    $pdo->commit();
    jsonResponse(['ok' => true, 'version' => $newVersion]);

} catch (Exception $e) {
    $pdo->rollBack();
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
