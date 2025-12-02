<?php
// key-api.php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Rest of your PHP code...
// Simulated database - in production, use MySQL or other database
$database_file = __DIR__ . '/global_keys_database.json';

function loadDatabase() {
    global $database_file;
    
    if (!file_exists($database_file)) {
        // Create initial database
        $initial_data = [
            'version' => '1.0',
            'settings' => [
                'redirect_url' => 'https://your-site.com/purchase',
                'auto_expire' => true,
                'enable_logging' => true,
                'admin_password' => 'admin123'
            ],
            'keys' => [],
            'activity_logs' => [],
            'revenue' => 0,
            'created_at' => date('c')
        ];
        
        file_put_contents($database_file, json_encode($initial_data, JSON_PRETTY_PRINT));
        return $initial_data;
    }
    
    $data = file_get_contents($database_file);
    $db = json_decode($data, true);

    // Normalize admin password location so both legacy and new clients work
    if (!isset($db['settings'])) {
        $db['settings'] = [];
    }
    if (isset($db['admin_password']) && !isset($db['settings']['admin_password'])) {
        $db['settings']['admin_password'] = $db['admin_password'];
    }
    if (!isset($db['admin_password']) && isset($db['settings']['admin_password'])) {
        $db['admin_password'] = $db['settings']['admin_password'];
    }

    return $db;
}

function saveDatabase($data) {
    global $database_file;
    $json = json_encode($data, JSON_PRETTY_PRINT);

    if ($json === false) {
        return false;
    }

    $result = @file_put_contents($database_file, $json, LOCK_EX);
    return $result !== false;
}

function logActivity($db, $message, $type = 'info') {
    $log_entry = [
        'timestamp' => date('c'),
        'message' => $message,
        'type' => $type
    ];
    
    $db['activity_logs'][] = $log_entry;
    
    // Keep only last 100 logs
    if (count($db['activity_logs']) > 100) {
        $db['activity_logs'] = array_slice($db['activity_logs'], -100);
    }
    
    return $db;
}

// Handle the request
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

$db = loadDatabase();

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    switch ($action) {
        case 'validate_key':
            $key = $input['key'] ?? '';
            $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
            $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
            
            // Find the key
            $key_found = null;
            $key_index = null;
            
            foreach ($db['keys'] as $index => $k) {
                if ($k['key'] === $key) {
                    $key_found = $k;
                    $key_index = $index;
                    break;
                }
            }
            
            if (!$key_found) {
                echo json_encode([
                    'valid' => false,
                    'message' => 'Key not found',
                    'status' => 'invalid'
                ]);
                exit;
            }
            
            // Check status
            if ($key_found['status'] !== 'active') {
                echo json_encode([
                    'valid' => false,
                    'message' => 'Key is ' . $key_found['status'],
                    'status' => $key_found['status']
                ]);
                exit;
            }
            
            // Check expiration
            $expires_at = strtotime($key_found['expires_at']);
            $current_time = time();
            
            if ($current_time > $expires_at) {
                $db['keys'][$key_index]['status'] = 'expired';
                saveDatabase($db);
                
                echo json_encode([
                    'valid' => false,
                    'message' => 'Key has expired',
                    'status' => 'expired'
                ]);
                exit;
            }
            
            // Check uses remaining
            if ($key_found['uses_remaining'] <= 0) {
                echo json_encode([
                    'valid' => false,
                    'message' => 'No uses remaining',
                    'status' => 'exhausted'
                ]);
                exit;
            }
            
            // Valid key - decrement uses
            $db['keys'][$key_index]['uses_remaining']--;
            
            // Log usage
            $usage_log = [
                'used_at' => date('c'),
                'ip' => $ip,
                'user_agent' => $user_agent
            ];
            
            if (!isset($db['keys'][$key_index]['usage_logs'])) {
                $db['keys'][$key_index]['usage_logs'] = [];
            }
            $db['keys'][$key_index]['usage_logs'][] = $usage_log;
            
            // Log activity
            $db = logActivity($db, "Key used: {$key} (IP: {$ip})", 'info');
            
            saveDatabase($db);
            
            // Calculate days remaining
            $days_remaining = ceil(($expires_at - $current_time) / (60 * 60 * 24));
            
            echo json_encode([
                'valid' => true,
                'message' => 'Access granted',
                'status' => 'active',
                'key_data' => [
                    'key' => $key_found['key'],
                    'expires_at' => $key_found['expires_at'],
                    'days_remaining' => $days_remaining,
                    'uses_remaining' => $db['keys'][$key_index]['uses_remaining'],
                    'total_uses' => $key_found['total_uses'],
                    'duration_days' => $key_found['duration_days'],
                    'customer_name' => $key_found['customer_name'] ?? '',
                    'customer_email' => $key_found['customer_email'] ?? ''
                ]
            ]);
            break;
            
        case 'check_status':
            $key = $input['key'] ?? '';
            
            $key_found = null;
            foreach ($db['keys'] as $k) {
                if ($k['key'] === $key) {
                    $key_found = $k;
                    break;
                }
            }
            
            if ($key_found) {
                $expires_at = strtotime($key_found['expires_at']);
                $current_time = time();
                $days_remaining = ceil(($expires_at - $current_time) / (60 * 60 * 24));
                
                echo json_encode([
                    'found' => true,
                    'status' => $key_found['status'],
                    'expires_at' => $key_found['expires_at'],
                    'days_remaining' => $days_remaining,
                    'uses_remaining' => $key_found['uses_remaining'],
                    'total_uses' => $key_found['total_uses']
                ]);
            } else {
                echo json_encode(['found' => false]);
            }
            break;

        case 'save_admin_db':
            $incoming_db = $input['db'] ?? null;
            $password = $input['admin_password'] ?? '';

            if (!$incoming_db || !is_array($incoming_db)) {
                echo json_encode(['success' => false, 'message' => 'No database payload received']);
                exit;
            }

            $current_password = $db['settings']['admin_password'] ?? $db['admin_password'] ?? 'admin123';
            if ($current_password && $password !== $current_password) {
                echo json_encode(['success' => false, 'message' => 'Invalid admin password']);
                exit;
            }

            if (!isset($incoming_db['settings'])) {
                $incoming_db['settings'] = [];
            }
            if (!isset($incoming_db['settings']['admin_password']) && isset($incoming_db['admin_password'])) {
                $incoming_db['settings']['admin_password'] = $incoming_db['admin_password'];
            }
            $incoming_db['admin_password'] = $incoming_db['settings']['admin_password'] ?? $current_password;

            $saved = saveDatabase($incoming_db);

            if (!$saved) {
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'message' => 'Failed to save database file. Check file permissions on the server.'
                ]);
                exit;
            }

            echo json_encode(['success' => true, 'message' => 'Database saved']);
            break;
            
        default:
            echo json_encode(['error' => 'Invalid action']);
    }
} elseif ($method === 'GET') {
    switch ($action) {
        case 'get_stats':
            $total_keys = count($db['keys']);
            $active_keys = count(array_filter($db['keys'], function($k) {
                return $k['status'] === 'active';
            }));
            $expired_keys = count(array_filter($db['keys'], function($k) {
                return $k['status'] === 'expired';
            }));
            
            $total_revenue = $db['revenue'] ?? 0;
            $total_uses = array_reduce($db['keys'], function($sum, $k) {
                return $sum + ($k['total_uses'] - $k['uses_remaining']);
            }, 0);
            
            echo json_encode([
                'total_keys' => $total_keys,
                'active_keys' => $active_keys,
                'expired_keys' => $expired_keys,
                'total_revenue' => $total_revenue,
                'total_uses' => $total_uses
            ]);
            break;
            
        case 'get_settings':
            echo json_encode([
                'redirect_url' => $db['settings']['redirect_url'] ?? 'https://your-site.com/purchase',
                'auto_expire' => $db['settings']['auto_expire'] ?? true,
                'enable_logging' => $db['settings']['enable_logging'] ?? true
            ]);
            break;

        case 'get_admin_db':
            echo json_encode($db);
            break;
            
        default:
            echo json_encode(['error' => 'Invalid action']);
    }
}
?>
