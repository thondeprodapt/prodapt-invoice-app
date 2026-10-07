<?php
declare(strict_types=1);

const APP_ORIGIN = 'https://invoice.prodaptsolution.co.zw';
const MAX_BODY_BYTES = 8000000;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'");

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && $origin !== APP_ORIGIN) {
    respond(403, ['error' => 'Origin not allowed']);
}
if ($origin === APP_ORIGIN) {
    header('Access-Control-Allow-Origin: ' . APP_ORIGIN);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Max-Age: 600');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'GET' && $method !== 'PUT') {
    header('Allow: GET, PUT, OPTIONS');
    respond(405, ['error' => 'Method not allowed']);
}

$home = dirname(__DIR__, 2);
$configPath = $home . '/prodapt-sync-config.php';
if (!is_file($configPath)) {
    respond(503, ['error' => 'Server sync is not configured']);
}
$config = require $configPath;
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer ([A-Za-z0-9_-]{20,128})$/', $authorization, $matches)
    || !is_array($config)
    || !isset($config['key_hash'])
    || !hash_equals((string) $config['key_hash'], hash('sha256', $matches[1]))) {
    respond(401, ['error' => 'Invalid access key']);
}

$dataDir = $home . '/prodapt-sync-data';
if (!is_dir($dataDir) && !mkdir($dataDir, 0700, true) && !is_dir($dataDir)) {
    respond(500, ['error' => 'Could not initialize private storage']);
}
$lock = fopen($dataDir . '/sync.lock', 'c+');
if ($lock === false || !flock($lock, LOCK_EX)) {
    respond(500, ['error' => 'Could not lock private storage']);
}

$dataPath = $dataDir . '/state.json';
$stored = ['revision' => 0, 'state' => null];
if (is_file($dataPath)) {
    $decoded = json_decode((string) file_get_contents($dataPath), true);
    if (!is_array($decoded) || !isset($decoded['revision']) || !array_key_exists('state', $decoded)) {
        respond(500, ['error' => 'Stored data is invalid']);
    }
    $stored = $decoded;
}

if ($method === 'GET') {
    respond(200, $stored);
}

$body = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
if ($body === false || strlen($body) > MAX_BODY_BYTES) {
    respond(413, ['error' => 'Upload exceeds the size limit']);
}
$request = json_decode($body, true);
if (!is_array($request) || !isset($request['revision'], $request['state'])
    || !is_int($request['revision']) || $request['revision'] < 0
    || !validState($request['state'])) {
    respond(422, ['error' => 'Invalid sync data']);
}
if ($request['revision'] !== $stored['revision']) {
    respond(409, $stored);
}

$next = ['revision' => $stored['revision'] + 1, 'state' => $request['state']];
$encoded = json_encode($next, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
if ($encoded === false) {
    respond(422, ['error' => 'Could not encode sync data']);
}

if (is_file($dataPath)) {
    $backupDir = $dataDir . '/backups';
    if (!is_dir($backupDir) && !mkdir($backupDir, 0700, true) && !is_dir($backupDir)) {
        respond(500, ['error' => 'Could not create backup directory']);
    }
    $previous = file_get_contents($dataPath);
    if ($previous === false) {
        respond(500, ['error' => 'Could not read previous data']);
    }
    $backup = function_exists('gzencode') ? gzencode($previous, 6) : $previous;
    if ($backup === false) {
        respond(500, ['error' => 'Could not encode backup']);
    }
    $extension = function_exists('gzencode') ? '.json.gz' : '.json';
    $backupPath = $backupDir . '/' . gmdate('Ymd-His') . '-r' . $stored['revision'] . '-' . bin2hex(random_bytes(4)) . $extension;
    if (file_put_contents($backupPath, $backup) === false) {
        respond(500, ['error' => 'Could not save backup']);
    }
    chmod($backupPath, 0600);
}

$temporary = tempnam($dataDir, 'state-');
if ($temporary === false || file_put_contents($temporary, $encoded) === false) {
    respond(500, ['error' => 'Could not write sync data']);
}
chmod($temporary, 0600);
if (!rename($temporary, $dataPath)) {
    @unlink($temporary);
    respond(500, ['error' => 'Could not replace sync data']);
}
respond(200, $next);

function validState($state): bool
{
    if (!is_array($state) || !isset($state['settings'], $state['customers'], $state['items'], $state['documents'])
        || !is_array($state['settings'])) {
        return false;
    }
    foreach (['customers' => 50000, 'items' => 50000, 'documents' => 50000] as $name => $limit) {
        if (!is_array($state[$name]) || !array_is_list($state[$name]) || count($state[$name]) > $limit) {
            return false;
        }
        $ids = [];
        foreach ($state[$name] as $record) {
            if (!is_array($record) || !isset($record['id']) || !is_string($record['id'])
                || $record['id'] === '' || strlen($record['id']) > 200 || isset($ids[$record['id']])) {
                return false;
            }
            $ids[$record['id']] = true;
        }
    }
    return true;
}

function respond(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
