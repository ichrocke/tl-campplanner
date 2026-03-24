<?php
// Datenbank-Konfiguration
// Kopiere diese Datei als config.php und trage die echten Werte ein.
define('DB_HOST', 'localhost');
define('DB_NAME', 'campplanner_collab');
define('DB_USER', 'db_user');
define('DB_PASS', 'db_password');

// Admin-Schluessel fuer Raumerstellung (in URL: ?key=...)
// Einen langen zufaelligen String generieren, z.B. mit: openssl rand -hex 16
define('ADMIN_KEY', 'change_me_to_a_random_string');

// Limits
define('MAX_STATE_SIZE', 10 * 1024 * 1024); // 10 MB
define('SSE_POLL_INTERVAL', 2); // Sekunden zwischen DB-Checks
define('SSE_MAX_DURATION', 90); // Max Laufzeit SSE in Sekunden
