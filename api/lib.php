<?php
// ------------------------------------------------------------------
//  Resoria API — shared helpers: DB connection, auth, JSON output and
//  the row -> API shape mappers. Used by index.php and install.php.
//
//  This file ships with every release. config.php does not (it stays
//  on the server and holds only settings), so all code lives here.
//  Namespaced so an older config.php that still defines these
//  functions can't clash with them.
// ------------------------------------------------------------------
declare(strict_types=1);

namespace Weland;

use PDO;

/** Rooms whose capacity can be changed on the Rooms page (editableCapacity in src/lib/config.ts). */
const CAPACITY_ROOMS = [
  'Haven', 'Elysian', 'Solace', 'Sylvane', 'Zephyr', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'Dorm 1', 'Dorm 2', 'Party Hall',
];

// Every right a role can hold (same list as the admin's Roles & Rights checklist, src/lib/permissions.ts)
const ALL_RIGHTS = [
  'view_payments', 'record_payments', 'view_expenses', 'edit_expenses', 'view_accounting', 'view_users', 'manage_users',
  'edit_invoice', 'view_bookings', 'edit_bookings', 'cancel_bookings', 'view_calendar', 'view_dashboard', 'view_reports',
  'view_villas', 'edit_villas', 'view_inventory', 'edit_inventory', 'manage_config', 'view_ratings', 'manage_ratings',
];

// Times are stored in the resort's local time (India)
if (!ini_get('date.timezone') || date_default_timezone_get() === 'UTC') date_default_timezone_set('Asia/Kolkata');

function now_dt(): string {
  return date('Y-m-d H:i:s');
}

function cors(): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
  }
  header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization');
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
  }
}

function db(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
  }
  return $pdo;
}

function json_out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function fail(string $message, int $code = 400): void {
  json_out(['error' => $message], $code);
}

/** The invoice_settings row as the app sees it (the show_* options are false before the migration). */
function public_invoice(array $inv): array {
  return [
    'prefix' => $inv['prefix'], 'next' => (int)$inv['next'], 'padding' => (int)$inv['padding'], 'terms' => $inv['terms'],
    'showPayments' => (int)($inv['show_payments'] ?? 0) === 1,
    'showB2b'      => (int)($inv['show_b2b'] ?? 0) === 1,
  ];
}

/** A room_overrides row as the app sees it (unset values are left out). */
function public_override(array $o): array {
  $entry = [];
  if (($o['base_rate'] ?? null) !== null)  $entry['baseRate'] = (int)$o['base_rate'];
  if (($o['notes'] ?? null) !== null)      $entry['notes'] = $o['notes'];
  if (($o['min_guests'] ?? null) !== null) $entry['minGuests'] = (int)$o['min_guests'];
  if (($o['max_guests'] ?? null) !== null) $entry['maxGuests'] = (int)$o['max_guests'];
  return $entry;
}

function body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === '' || $raw === false) return [];
  $d = json_decode($raw, true);
  return is_array($d) ? $d : [];
}

function bearer_token(): ?string {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if ($h === '' && function_exists('apache_request_headers')) {
    $hdrs = apache_request_headers();
    $h = $hdrs['Authorization'] ?? $hdrs['authorization'] ?? '';
  }
  if (preg_match('/Bearer\s+(.+)/i', (string)$h, $m)) return trim($m[1]);
  return null;
}

function current_user(): ?array {
  $token = bearer_token();
  if (!$token) return null;
  $st = db()->prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? LIMIT 1');
  $st->execute([$token]);
  $u = $st->fetch();
  if (!$u || (int)$u['active'] !== 1) return null;
  return $u;
}

function require_user(): array {
  $u = current_user();
  if (!$u) fail('Not authenticated.', 401);
  return $u;
}

function role_rights(string $role): array {
  $st = db()->prepare('SELECT rights FROM roles WHERE name = ? LIMIT 1');
  $st->execute([$role]);
  $r = $st->fetch();
  if (!$r) return [];
  $rights = json_decode($r['rights'], true);
  return is_array($rights) ? $rights : [];
}

function require_right(array $user, string $right): void {
  if (!in_array($right, role_rights($user['role']), true)) {
    fail('You do not have permission for this action.', 403);
  }
}

function role_exists(string $name): bool {
  $st = db()->prepare('SELECT 1 FROM roles WHERE name = ? LIMIT 1');
  $st->execute([$name]);
  return (bool)$st->fetch();
}

/** True when an active user other than $exceptId can still manage users, so nobody gets locked out. */
function other_user_manager_exists(string $exceptId): bool {
  $st = db()->prepare('SELECT role FROM users WHERE active = 1 AND id <> ?');
  $st->execute([$exceptId]);
  foreach ($st->fetchAll() as $u) {
    if (in_array('manage_users', role_rights($u['role']), true)) return true;
  }
  return false;
}

function gen_id(string $prefix): string {
  return $prefix . bin2hex(random_bytes(6));
}

/** First room of a booking's villa value ("A1, B1" -> "A1"), or "Full Property". */
function primary_room(string $villa): string {
  if ($villa === 'Full Property') return 'Full Property';
  foreach (explode(',', $villa) as $r) {
    $r = trim($r);
    if ($r !== '') return $r;
  }
  return $villa;
}

/** An expenses row as the app sees it. */
function expense_shape(array $e): array {
  return [
    'id' => $e['id'], 'date' => $e['date'], 'category' => $e['category'], 'villa' => $e['villa'],
    'bookingRef' => $e['booking_ref'] ?? null, 'description' => $e['description'], 'amount' => (int)$e['amount'],
    'external' => (int)($e['external'] ?? 0) === 1, // B2B commission collected externally (false before the migration)
    'sourceRef' => $e['source_ref'] ?? null,         // e.g. PUR-00003 (inventory purchase)
  ];
}

/** An expense's category and linked booking as they are stored: "B2B Commission" in any letter case
 *  becomes that exact name, and a ref that matches a booking (in any case) becomes the booking's own
 *  ref, so the booking page finds it. */
function normalize_expense_link(array $row): array {
  if (is_string($row['category']) && strcasecmp(trim($row['category']), 'B2B Commission') === 0) {
    $row['category'] = 'B2B Commission';
  }
  if ($row['bookingRef'] !== null) {
    $ref = trim((string)$row['bookingRef']);
    $st = db()->prepare('SELECT ref FROM bookings WHERE ref = ?');
    $st->execute([$ref]);
    $found = $st->fetch();
    $row['bookingRef'] = $found ? $found['ref'] : ($ref !== '' ? $ref : null);
  }
  return $row;
}

/** The B2B commission field of older admin versions' New / Edit booking form: create, change or
 *  remove (at 0) the booking's B2B expense. A booking can now have several B2B entries (added with
 *  Expense on the booking page); then they're left as they are, so none is overwritten or lost.
 *  $ref must be the booking's own ref. */
function sync_b2b_expense(string $ref, string $villa, int $commission): void {
  $pdo = db();
  $st = $pdo->prepare("SELECT id FROM expenses WHERE booking_ref = ? AND category = 'B2B Commission'");
  $st->execute([$ref]);
  $rows = $st->fetchAll();
  if (count($rows) > 1) return;
  $existing = $rows[0] ?? null;
  if ($commission > 0) {
    $room = primary_room($villa);
    if ($existing) {
      $pdo->prepare("UPDATE expenses SET booking_ref = ?, category = 'B2B Commission', villa = ?, amount = ? WHERE id = ?")
          ->execute([$ref, $room, $commission, $existing['id']]);
    } else {
      $pdo->prepare("INSERT INTO expenses (id, date, category, villa, booking_ref, description, amount)
                     VALUES (?, CURDATE(), 'B2B Commission', ?, ?, ?, ?)")
          ->execute([gen_id('e'), $room, $ref, "B2B commission · $ref", $commission]);
    }
  } elseif ($existing) {
    $pdo->prepare('DELETE FROM expenses WHERE id = ?')->execute([$existing['id']]);
  }
}

/** Create/update/remove the single advance payment of a booking (the one entered while booking). */
function sync_advance(string $ref, int $amount, string $method): void {
  $pdo = db();
  $st = $pdo->prepare('SELECT id FROM payments WHERE booking_ref = ? AND is_advance = 1 ORDER BY date ASC, id ASC LIMIT 1');
  $st->execute([$ref]);
  $existing = $st->fetch();
  if ($amount > 0) {
    if ($existing) {
      $pdo->prepare('UPDATE payments SET amount = ?, method = ? WHERE id = ?')->execute([$amount, $method ?: null, $existing['id']]);
    } else {
      $pdo->prepare("INSERT INTO payments (id, booking_ref, date, amount, kind, method, reference, is_advance)
                     VALUES (?, ?, CURDATE(), ?, 'payment', ?, NULL, 1)")
          ->execute([gen_id('p'), $ref, $amount, $method ?: null]);
    }
  } elseif ($existing) {
    $pdo->prepare('DELETE FROM payments WHERE id = ?')->execute([$existing['id']]);
  }
}

// ------------------------------------------------------------------
//  Row -> API shape mappers
// ------------------------------------------------------------------
function public_user(array $u, bool $withRights = false): array {
  $out = [
    'id'        => $u['id'],
    'name'      => $u['name'],
    'email'     => $u['email'],
    'role'      => $u['role'],
    'villa'     => $u['villa'] ?? '',     // room(s) the user looks after, "" = not assigned
    'active'    => (int)$u['active'] === 1,
    'lastLogin' => $u['last_login'] ?? '',
    'password'  => '',                 // never expose hashes to the client
  ];
  if ($withRights) $out['rights'] = role_rights($u['role']);
  return $out;
}

function get_user(string $id): ?array {
  $st = db()->prepare('SELECT * FROM users WHERE id = ?');
  $st->execute([$id]);
  $u = $st->fetch();
  return $u ? public_user($u) : null;
}

function booking_shape(array $b, array $payments, array $charges = [], array $events = []): array {
  $int = fn($v) => $v === null || $v === '' ? null : (int)$v;
  return [
    'id'        => $b['id'],
    'ref'       => $b['ref'],
    'guest'     => $b['guest'],
    'phone'     => $b['phone'],
    'altPhone'  => $b['alt_phone'] ?? '',
    'email'     => $b['email'] ?? '',
    'villa'     => $b['villa'],
    'checkIn'   => $b['check_in'],
    'checkOut'  => $b['check_out'],
    'guests'    => (int)$b['guests'],
    'adults'    => isset($b['adults']) && $b['adults'] !== null ? (int)$b['adults'] : (int)$b['guests'],
    'kids'      => isset($b['kids']) && $b['kids'] !== null ? (int)$b['kids'] : 0,
    'status'    => $b['status'],
    'total'     => (int)$b['total'],
    'source'    => $b['source'],
    'notes'     => $b['notes'] ?? '',
    'createdAt' => substr((string)$b['created_at'], 0, 10),
    'payments'  => array_map(fn($p) => [
      'id' => $p['id'], 'date' => $p['date'], 'amount' => (int)$p['amount'], 'kind' => $p['kind'], 'method' => $p['method'] ?? '', 'reference' => $p['reference'] ?? '',
      'advance' => (int)($p['is_advance'] ?? 0) === 1,
      'purpose' => ($p['purpose'] ?? 'room') === 'extras' ? 'extras' : 'room',
      'createdAt' => $p['created_at'] ?? '',
      'receiptNo' => $p['receipt_no'] ?? '',
    ], $payments),
    'feedbackToken'      => $b['feedback_token'] ?? '',
    // change-sheet fields (null / '' on older rows)
    'place'              => $b['place'] ?? '',
    'documentName'       => $b['document_name'] ?? '',
    'sourceDetail'       => $b['source_detail'] ?? '',
    'originalTotal'      => $int($b['original_total'] ?? null) ?? (int)$b['total'],
    'commission'         => $int($b['commission'] ?? null) ?? 0,
    'checkedInAt'        => $b['checked_in_at'] ?? '',
    'checkedOutAt'       => $b['checked_out_at'] ?? '',
    'completedAt'        => $b['completed_at'] ?? '',
    'cancelledAt'        => $b['cancelled_at'] ?? '',
    'cancellationCharge' => $int($b['cancellation_charge'] ?? null) ?? 0,
    'charges' => array_map(fn($c) => [
      'id' => $c['id'], 'category' => $c['category'], 'item' => $c['item'], 'qty' => (int)$c['qty'],
      'rate' => (int)$c['rate'], 'total' => (int)$c['total'], 'at' => $c['at'], 'paymentId' => $c['payment_id'] ?? null,
    ], $charges),
    'events' => array_map(fn($e) => ['id' => $e['id'], 'at' => $e['at'], 'text' => $e['text']], $events),
  ];
}

function get_booking(string $ref): ?array {
  $st = db()->prepare('SELECT * FROM bookings WHERE ref = ?');
  $st->execute([$ref]);
  $b = $st->fetch();
  if (!$b) return null;
  $ref = $b['ref'];
  assign_receipts($ref); // payments recorded on any path get their fixed receipt number
  $q = function (string $sql) use ($ref) {
    $st = db()->prepare($sql);
    $st->execute([$ref]);
    return $st->fetchAll();
  };
  return booking_shape(
    $b,
    $q('SELECT * FROM payments WHERE booking_ref = ? ORDER BY date ASC, seq ASC'),
    $q('SELECT * FROM booking_charges WHERE booking_ref = ? ORDER BY at ASC, seq ASC'),
    $q('SELECT * FROM booking_events WHERE booking_ref = ? ORDER BY at ASC, seq ASC'),
  );
}

function bootstrap_payload(): array {
  $pdo = db();

  $bookings = $pdo->query('SELECT * FROM bookings ORDER BY created_at DESC, ref DESC')->fetchAll();
  $group = function (string $sql) use ($pdo): array {
    $out = [];
    foreach ($pdo->query($sql)->fetchAll() as $r) $out[$r['booking_ref']][] = $r;
    return $out;
  };
  $byRef = $group('SELECT * FROM payments ORDER BY date ASC, seq ASC');
  $chargesBy = $group('SELECT * FROM booking_charges ORDER BY at ASC, seq ASC');
  $eventsBy = $group('SELECT * FROM booking_events ORDER BY at ASC, seq ASC');
  $bk = array_map(fn($b) => booking_shape($b, $byRef[$b['ref']] ?? [], $chargesBy[$b['ref']] ?? [], $eventsBy[$b['ref']] ?? []), $bookings);

  $expenses = array_map(fn($e) => expense_shape($e), $pdo->query('SELECT * FROM expenses ORDER BY date DESC, id DESC')->fetchAll());

  $users = array_map(fn($u) => public_user($u), $pdo->query('SELECT * FROM users ORDER BY id ASC')->fetchAll());

  $roles = array_map(fn($r) => [
    'id' => $r['id'], 'name' => $r['name'], 'system' => (int)$r['system'] === 1,
    'rights' => (json_decode($r['rights'], true) ?: []),
  ], $pdo->query('SELECT * FROM roles ORDER BY id ASC')->fetchAll());

  $inv = $pdo->query('SELECT * FROM invoice_settings WHERE id = 1')->fetch();
  $invoice = $inv
    ? public_invoice($inv)
    : ['prefix' => 'KV-', 'next' => 1, 'padding' => 5, 'terms' => '', 'showPayments' => false, 'showB2b' => false];

  $overrides = [];
  foreach ($pdo->query('SELECT * FROM room_overrides')->fetchAll() as $o) {
    $overrides[$o['villa']] = public_override($o);
  }

  return [
    'bookings'      => $bk,
    'expenses'      => $expenses,
    'users'         => $users,
    'roles'         => $roles,
    'invoice'       => $invoice,
    'villaOverrides' => (object)$overrides,   // force {} not [] when empty
    'settings'      => settings_payload(),
    'inventory'     => inventory_payload(),
    'ratings'       => array_map('Weland\\rating_shape', $pdo->query('SELECT * FROM ratings ORDER BY date DESC, created_at DESC')->fetchAll()),
  ];
}

// ==================================================================
//  Change-sheet features: schema updates, stay history, additional
//  expenses, uploads, configuration lists, inventory.
// ==================================================================

/** Bump when ensure_schema() gains steps. */
const SCHEMA_VERSION = 5;

function column_exists(string $table, string $col): bool {
  $st = db()->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
  $st->execute([$table, $col]);
  return (bool)$st->fetch();
}
function add_column(string $table, string $col, string $def): void {
  if (!column_exists($table, $col)) db()->exec("ALTER TABLE `$table` ADD COLUMN `$col` $def");
}

/**
 * Brings the database up to SCHEMA_VERSION. Safe to run any number of times:
 * every step only adds what's missing and keeps existing data. Runs on the
 * first API request after a deploy (one cheap query on every other request),
 * so updates need no manual SQL.
 */
function ensure_schema(bool $force = false): void {
  $pdo = db();
  if (!$force) {
    try {
      $v = $pdo->query("SELECT v FROM app_settings WHERE k = 'schema_version'")->fetchColumn();
      if ((int)$v >= SCHEMA_VERSION) return;
    } catch (\Throwable $e) { /* table missing: run the steps */ }
  }

  $pdo->exec("CREATE TABLE IF NOT EXISTS app_settings (
    k VARCHAR(60) PRIMARY KEY,
    v MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS counters (
    name VARCHAR(20) PRIMARY KEY,
    next INT NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS booking_events (
    seq INT AUTO_INCREMENT PRIMARY KEY,
    id VARCHAR(32) NOT NULL,
    booking_ref VARCHAR(40) NOT NULL,
    at DATETIME NOT NULL,
    text VARCHAR(500) NOT NULL,
    INDEX (booking_ref)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS booking_charges (
    seq INT NOT NULL AUTO_INCREMENT UNIQUE,  -- entry order
    id VARCHAR(32) PRIMARY KEY,
    booking_ref VARCHAR(40) NOT NULL,
    category VARCHAR(30) NOT NULL,
    item VARCHAR(160) NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    rate INT NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    at DATETIME NOT NULL,
    payment_id VARCHAR(32) NULL,
    INDEX (booking_ref)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS inventory_items (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(60) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    min_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
    opening_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS stock_movements (
    seq INT NOT NULL AUTO_INCREMENT UNIQUE,  -- entry order (several movements can share a second)
    id VARCHAR(32) PRIMARY KEY,
    ref VARCHAR(20) NOT NULL,
    item_id VARCHAR(20) NOT NULL,
    type VARCHAR(10) NOT NULL,              -- in / out / adjust
    qty DECIMAL(12,2) NOT NULL,             -- positive for in / out, signed for adjust
    rate DECIMAL(12,2) NULL,
    amount INT NULL,
    date DATE NOT NULL,
    department VARCHAR(60) NULL,
    supplier VARCHAR(120) NULL,
    note VARCHAR(255) NULL,
    prev_balance DECIMAL(12,2) NOT NULL,
    balance DECIMAL(12,2) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX (item_id), INDEX (ref), INDEX (date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS stock_purchases (
    ref VARCHAR(20) PRIMARY KEY,
    date DATE NOT NULL,
    supplier VARCHAR(120) NOT NULL DEFAULT '',
    bill_name VARCHAR(255) NULL,
    bill_path VARCHAR(255) NULL,
    total INT NOT NULL DEFAULT 0,
    paid_amount INT NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid',
    expense_id VARCHAR(32) NULL,
    created_at DATETIME NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

  add_column('stock_movements', 'seq', 'INT NOT NULL AUTO_INCREMENT UNIQUE FIRST');
  add_column('booking_charges', 'seq', 'INT NOT NULL AUTO_INCREMENT UNIQUE FIRST');
  add_column('payments', 'seq', 'INT NOT NULL AUTO_INCREMENT UNIQUE FIRST'); // entry order (several can share a second)
  add_column('bookings', 'place', 'VARCHAR(120) NULL');
  add_column('bookings', 'document_name', 'VARCHAR(255) NULL');
  add_column('bookings', 'document_path', 'VARCHAR(255) NULL');
  add_column('bookings', 'source_detail', 'VARCHAR(120) NULL');
  add_column('bookings', 'original_total', 'INT NULL');
  add_column('bookings', 'commission', 'INT NULL');
  add_column('bookings', 'checked_in_at', 'DATETIME NULL');
  add_column('bookings', 'checked_out_at', 'DATETIME NULL');
  add_column('bookings', 'completed_at', 'DATETIME NULL');
  add_column('bookings', 'cancelled_at', 'DATETIME NULL');
  add_column('bookings', 'cancellation_charge', 'INT NULL');
  $pdo->exec("ALTER TABLE bookings MODIFY source VARCHAR(40) NOT NULL DEFAULT 'Direct'");
  add_column('payments', 'purpose', "VARCHAR(10) NOT NULL DEFAULT 'room'");
  add_column('payments', 'created_at', 'DATETIME NULL');
  add_column('expenses', 'source_ref', 'VARCHAR(40) NULL');
  add_column('expenses', 'external', 'TINYINT(1) NOT NULL DEFAULT 0');

  // Starting lists (only when never saved): departments and the usual OTA platforms
  $seed = $pdo->prepare('INSERT IGNORE INTO app_settings (k, v) VALUES (?, ?)');
  $seed->execute(['departments', json_encode(['Housekeeping', 'Kitchen', 'Front Office', 'Maintenance', 'Pool & Outdoor'])]);
  $seed->execute(['otaPlatforms', json_encode(array_map(
    fn($n) => ['id' => 'ota' . substr(md5($n), 0, 8), 'name' => $n, 'active' => true],
    ['Booking.com', 'Agoda', 'MakeMyTrip', 'Airbnb', 'Goibibo']
  ))]);

  // New rights (inventory, configuration) for the built-in roles that should have them
  $grant = [
    'Administrator' => ['view_inventory', 'edit_inventory', 'manage_config'],
    'Manager'       => ['view_inventory', 'edit_inventory'],
    'Owner'         => ['view_inventory'],
  ];
  $marker = $pdo->query("SELECT v FROM app_settings WHERE k = 'rights_v2'")->fetchColumn();
  if ($marker === false) {
    foreach ($grant as $role => $add) {
      $st = $pdo->prepare('SELECT id, rights FROM roles WHERE name = ?');
      $st->execute([$role]);
      $r = $st->fetch();
      if (!$r) continue;
      $rights = json_decode($r['rights'], true) ?: [];
      $rights = array_values(array_unique(array_merge($rights, $add)));
      $pdo->prepare('UPDATE roles SET rights = ? WHERE id = ?')->execute([json_encode($rights), $r['id']]);
    }
    $pdo->prepare("INSERT INTO app_settings (k, v) VALUES ('rights_v2', '1')")->execute();
  }

  // ---- v5: guest ratings, feedback links, reusable linen, supplier payments, fixed receipt numbers ----
  $pdo->exec("CREATE TABLE IF NOT EXISTS ratings (
    id VARCHAR(32) PRIMARY KEY,
    booking_ref VARCHAR(40) NULL,
    guest VARCHAR(160) NOT NULL,
    overall TINYINT NOT NULL,
    aspects VARCHAR(255) NOT NULL DEFAULT '{}',
    comment TEXT NULL,
    source VARCHAR(40) NOT NULL,
    date DATE NOT NULL,
    created_at DATETIME NOT NULL,
    response TEXT NULL,
    responded_at DATETIME NULL,
    INDEX (booking_ref), INDEX (date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS purchase_payments (
    seq INT NOT NULL AUTO_INCREMENT UNIQUE,
    id VARCHAR(32) PRIMARY KEY,
    ref VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    amount INT NOT NULL,
    method VARCHAR(20) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL,
    INDEX (ref)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  add_column('bookings', 'feedback_token', 'VARCHAR(40) NULL UNIQUE');
  add_column('inventory_items', 'reusable', 'TINYINT(1) NOT NULL DEFAULT 0');
  add_column('payments', 'receipt_no', 'VARCHAR(60) NULL');
  foreach ($pdo->query('SELECT DISTINCT booking_ref FROM payments WHERE receipt_no IS NULL')->fetchAll() as $r) {
    assign_receipts($r['booking_ref']);
  }
  $marker = $pdo->query("SELECT v FROM app_settings WHERE k = 'rights_v3'")->fetchColumn();
  if ($marker === false) {
    $grant = [
      'Administrator' => ['view_ratings', 'manage_ratings'],
      'Manager'       => ['view_ratings', 'manage_ratings'],
      'Front Desk'    => ['view_ratings', 'manage_ratings'],
      'Owner'         => ['view_ratings'],
    ];
    foreach ($grant as $role => $add) {
      $st = $pdo->prepare('SELECT id, rights FROM roles WHERE name = ?');
      $st->execute([$role]);
      $r = $st->fetch();
      if (!$r) continue;
      $rights = array_values(array_unique(array_merge(json_decode($r['rights'], true) ?: [], $add)));
      $pdo->prepare('UPDATE roles SET rights = ? WHERE id = ?')->execute([json_encode($rights), $r['id']]);
    }
    $pdo->prepare("INSERT INTO app_settings (k, v) VALUES ('rights_v3', '1')")->execute();
  }

  $pdo->prepare("INSERT INTO app_settings (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")
      ->execute([(string)SCHEMA_VERSION]);
}

/** Gives every payment of a booking without a receipt number the next one (<ref>-R<n>), in ledger order. */
function assign_receipts(string $ref): void {
  $pdo = db();
  $st = $pdo->prepare('SELECT id, receipt_no FROM payments WHERE booking_ref = ? ORDER BY date ASC, seq ASC');
  $st->execute([$ref]);
  $rows = $st->fetchAll();
  $max = 0;
  foreach ($rows as $r) {
    if ($r['receipt_no'] && preg_match('/-R(\d+)$/', $r['receipt_no'], $m)) $max = max($max, (int)$m[1]);
  }
  $upd = $pdo->prepare('UPDATE payments SET receipt_no = ? WHERE id = ?');
  foreach ($rows as $r) {
    if (!$r['receipt_no']) $upd->execute([$ref . '-R' . (++$max), $r['id']]);
  }
}

// ---------------- Formatting ----------------

/** ₹1,40,000 (Indian digit grouping), as the app shows money. */
function inr(int $n): string {
  $neg = $n < 0;
  $s = (string)abs($n);
  if (strlen($s) > 3) {
    $last3 = substr($s, -3);
    $rest = substr($s, 0, -3);
    $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
    $s = "$rest,$last3";
  }
  return ($neg ? '−' : '') . '₹' . $s;
}

// ---------------- Stay history ----------------

function add_event(string $ref, string $text, ?string $at = null): void {
  db()->prepare('INSERT INTO booking_events (id, booking_ref, at, text) VALUES (?,?,?,?)')
      ->execute([gen_id('h'), $ref, $at ?? now_dt(), mb_substr($text, 0, 500)]);
}

// ---------------- Booking money (server-side mirror of src/lib/booking.ts) ----------------

function booking_row(string $ref): array {
  $st = db()->prepare('SELECT * FROM bookings WHERE ref = ?');
  $st->execute([$ref]);
  $b = $st->fetch();
  if (!$b) fail('Booking not found.', 404);
  return $b;
}
/** Room balance still owed: total − room payments + refunds − B2B commission collected externally. */
function room_balance(array $b): int {
  $st = db()->prepare("SELECT
      COALESCE(SUM(CASE WHEN kind = 'payment' AND purpose <> 'extras' THEN amount ELSE 0 END), 0) AS paid,
      COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0) AS refunded
    FROM payments WHERE booking_ref = ?");
  $st->execute([$b['ref']]);
  $m = $st->fetch();
  $ext = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE booking_ref = ? AND category = 'B2B Commission' AND `external` = 1");
  $ext->execute([$b['ref']]);
  return (int)$b['total'] - (int)$m['paid'] + (int)$m['refunded'] - (int)$ext->fetchColumn();
}
function room_received(string $ref): int {
  $st = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE booking_ref = ? AND kind = 'payment' AND purpose <> 'extras'");
  $st->execute([$ref]);
  return (int)$st->fetchColumn();
}
function charges_due(string $ref): int {
  $st = db()->prepare('SELECT COALESCE(SUM(total), 0) FROM booking_charges WHERE booking_ref = ? AND payment_id IS NULL');
  $st->execute([$ref]);
  return (int)$st->fetchColumn();
}
function is_pre_arrival(string $status): bool {
  return !in_array($status, ['checked in', 'completed', 'cancelled'], true);
}

/** Event text for a new additional expense. */
function charge_event_text(string $category, string $item, int $qty, int $rate, int $total): string {
  if ($category === 'Food') return "Restaurant order: $item × $qty · " . inr($total);
  if ($category === 'Conference Hall') {
    $what = preg_replace('/^Conference Hall\s*·\s*/', '', $item);
    return "Conference Hall booked · $what · " . inr($total);
  }
  return "Service: $item" . ($qty > 1 ? " × $qty" : '') . ' · ' . inr($total);
}

// ---------------- Uploads (ID proof, purchase bills) ----------------

function upload_dir(): string {
  $dir = defined('UPLOAD_DIR') ? (string)UPLOAD_DIR : __DIR__ . '/uploads';
  if (!is_dir($dir)) {
    if (!@mkdir($dir, 0750, true) && !is_dir($dir)) fail('The upload folder could not be created.', 500);
  }
  // Never serve uploads directly (Apache); they go through the API with a session.
  if (!is_file("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\nDeny from all\n");
  return $dir;
}

/** Validates and stores a {name, type, data(base64)} upload. Returns [displayName, storedFileName]. */
/** The file's real type from its first bytes: 'pdf', 'jpg', 'png', 'webp', or null for anything else.
 *  Read from the signature itself rather than with finfo, so uploads work on hosts whose PHP
 *  doesn't load the fileinfo extension (without it, every booking with an ID proof failed). */
function upload_type(string $bytes): ?string {
  if (strncmp($bytes, '%PDF-', 5) === 0) return 'pdf';
  if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) return 'jpg';
  if (strncmp($bytes, "\x89PNG\r\n\x1A\n", 8) === 0) return 'png';
  if (strncmp($bytes, 'RIFF', 4) === 0 && substr($bytes, 8, 4) === 'WEBP') return 'webp';
  return null;
}

function store_upload($file, string $prefix): array {
  if (!is_array($file) || !isset($file['data'], $file['name'])) fail('The attached file is missing.');
  $bytes = base64_decode((string)$file['data'], true);
  if ($bytes === false || $bytes === '') fail('The attached file could not be read.');
  if (strlen($bytes) > 5 * 1024 * 1024) fail('The attached file is larger than 5 MB.');
  $ext = upload_type($bytes);
  if (!$ext) fail('Attach a PDF, JPG, PNG or WEBP file.');
  $name = trim(preg_replace('/[^\w .()\-]+/u', '_', (string)$file['name'])) ?: "document.$ext";
  $stored = $prefix . '-' . bin2hex(random_bytes(12)) . ".$ext";
  if (@file_put_contents(upload_dir() . "/$stored", $bytes) === false) fail('The attached file could not be saved.', 500);
  return [mb_substr($name, 0, 200), $stored];
}

function delete_upload(?string $stored): void {
  if ($stored && preg_match('/^[\w-]+\.(pdf|jpg|png|webp)$/', $stored)) @unlink(upload_dir() . "/$stored");
}

/** Streams a stored upload to the browser and exits. */
function send_upload(?string $stored, ?string $name): void {
  if (!$stored || !preg_match('/^[\w-]+\.(pdf|jpg|png|webp)$/', $stored, $m) || !is_file(upload_dir() . "/$stored")) {
    fail('File not found.', 404);
  }
  $types = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
  $safe = str_replace(['"', "\r", "\n"], '', (string)($name ?: $stored));
  header('Content-Type: ' . $types[$m[1]]);
  header('Content-Length: ' . filesize(upload_dir() . "/$stored"));
  header("Content-Disposition: inline; filename=\"$safe\"; filename*=UTF-8''" . rawurlencode((string)($name ?: $stored)));
  header('X-Content-Type-Options: nosniff');
  header('Cache-Control: private, no-store');
  readfile(upload_dir() . "/$stored");
  exit;
}

// ---------------- Counters (PUR-00001, USE-00001, ADJ-00001, INV-0001) ----------------

/** Next number of a series; call inside a transaction. */
function next_number(string $name): int {
  $pdo = db();
  $pdo->prepare('INSERT IGNORE INTO counters (name, next) VALUES (?, 1)')->execute([$name]);
  $st = $pdo->prepare('SELECT next FROM counters WHERE name = ? FOR UPDATE');
  $st->execute([$name]);
  $n = (int)$st->fetchColumn();
  $pdo->prepare('UPDATE counters SET next = next + 1 WHERE name = ?')->execute([$name]);
  return $n;
}

// ---------------- Configuration lists ----------------

const SETTINGS_KEYS = ['agents', 'otaPlatforms', 'referrers', 'menuItems', 'hallRates', 'departments'];

function settings_payload(): array {
  $out = array_fill_keys(SETTINGS_KEYS, []);
  foreach (db()->query('SELECT k, v FROM app_settings')->fetchAll() as $r) {
    if (in_array($r['k'], SETTINGS_KEYS, true)) $out[$r['k']] = json_decode($r['v'], true) ?: [];
  }
  return $out;
}

/** Validates one configuration list and returns it cleaned. */
function clean_settings(string $key, $value): array {
  if (!is_array($value) || array_keys($value) !== range(0, count($value) - 1) && count($value) > 0) fail('Send the list as an array.');
  $str = fn($v, int $max = 120) => mb_substr(trim((string)$v), 0, $max);
  $num = function ($v, string $what) {
    if (!is_numeric($v) || (float)$v < 0 || (float)$v > 100000000) fail("Enter a valid $what.");
    return round((float)$v, 2);
  };
  $id = fn($v) => preg_match('/^[\w-]{1,40}$/', (string)$v) ? (string)$v : gen_id('c');
  $out = [];
  $seen = [];
  foreach ($value as $row) {
    if ($key === 'departments') {
      $name = $str($row, 60);
      if ($name === '') fail('Department names are required.');
      if (isset($seen[mb_strtolower($name)])) fail("“{$name}” is listed twice.");
      $seen[mb_strtolower($name)] = 1;
      $out[] = $name;
      continue;
    }
    if (!is_array($row)) fail('Invalid list entry.');
    if ($key === 'hallRates') {
      $hours = (int)($row['hours'] ?? 0);
      if ($hours < 1 || $hours > 24) fail('Hall durations must be between 1 and 24 hours.');
      if (isset($seen[$hours])) fail("$hours hour(s) is listed twice.");
      $seen[$hours] = 1;
      $out[] = ['hours' => $hours, 'price' => (int)round($num($row['price'] ?? null, 'price'))];
      continue;
    }
    $name = $str($row['name'] ?? '');
    if ($name === '') fail('Names are required.');
    if (isset($seen[mb_strtolower($name)])) fail("“{$name}” is listed twice.");
    $seen[mb_strtolower($name)] = 1;
    $entry = ['id' => $id($row['id'] ?? ''), 'name' => $name, 'active' => !empty($row['active'])];
    if ($key === 'menuItems') $entry['price'] = (int)round($num($row['price'] ?? null, 'price'));
    if ($key === 'agents') {
      $type = ($row['commissionType'] ?? '') === 'flat' ? 'flat' : 'percent';
      $val = $num($row['commissionValue'] ?? 0, 'commission');
      if ($type === 'percent' && $val > 100) fail('A percent commission can be at most 100.');
      $entry += ['commissionType' => $type, 'commissionValue' => $val, 'phone' => $str($row['phone'] ?? '', 40)];
    }
    $out[] = $entry;
  }
  if ($key === 'hallRates') usort($out, fn($a, $b) => $a['hours'] <=> $b['hours']);
  return $out;
}

// ---------------- Inventory ----------------

function f2($v): float {
  return round((float)$v, 2);
}

function inventory_payload(): array {
  $pdo = db();
  $items = $pdo->query('SELECT * FROM inventory_items ORDER BY name ASC')->fetchAll();
  $payBy = [];
  foreach ($pdo->query('SELECT * FROM purchase_payments ORDER BY date ASC, seq ASC')->fetchAll() as $pp) {
    $payBy[$pp['ref']][] = ['date' => $pp['date'], 'amount' => (int)$pp['amount'], 'method' => $pp['method'], 'createdAt' => $pp['created_at']];
  }
  $moves = $pdo->query('SELECT * FROM stock_movements ORDER BY date DESC, seq DESC')->fetchAll();
  $sum = [];
  $lastRate = [];
  $opening = [];
  foreach ($items as $i) $opening[$i['id']] = f2($i['opening_stock']);
  // Running balances in date order (oldest first), so a back-dated entry reads correctly in the history
  $chrono = array_reverse($moves);
  $inUse = [];
  foreach ($chrono as $k => $m) {
    $q = f2($m['qty']);
    $d = store_delta($m['type'], $q);
    $prev = f2(($opening[$m['item_id']] ?? 0) + ($sum[$m['item_id']] ?? 0));
    $sum[$m['item_id']] = ($sum[$m['item_id']] ?? 0) + $d;
    $inUse[$m['item_id']] = ($inUse[$m['item_id']] ?? 0) + use_delta($m['type'], $q);
    $chrono[$k]['prev_balance'] = $prev;
    $chrono[$k]['balance'] = f2($prev + $d);
    if ($m['type'] === 'in' && $m['rate'] !== null) $lastRate[$m['item_id']] = f2($m['rate']); // the last purchase rate wins
  }
  $moves = array_reverse($chrono);
  return [
    'items' => array_map(fn($i) => [
      'id' => $i['id'], 'name' => $i['name'], 'category' => $i['category'], 'unit' => $i['unit'],
      'minStock' => f2($i['min_stock']), 'openingStock' => f2($i['opening_stock']),
      'available' => f2(f2($i['opening_stock']) + ($sum[$i['id']] ?? 0)),
      'lastRate' => $lastRate[$i['id']] ?? 0, 'active' => (int)$i['active'] === 1, 'createdAt' => $i['created_at'],
      'reusable' => (int)($i['reusable'] ?? 0) === 1, 'inUse' => f2($inUse[$i['id']] ?? 0),
    ], $items),
    'movements' => array_map(fn($m) => [
      'id' => $m['id'], 'ref' => $m['ref'], 'itemId' => $m['item_id'], 'type' => $m['type'], 'qty' => f2($m['qty']),
      'rate' => $m['rate'] === null ? null : f2($m['rate']), 'amount' => $m['amount'] === null ? null : (int)$m['amount'],
      'date' => $m['date'], 'department' => $m['department'] ?? '', 'supplier' => $m['supplier'] ?? '', 'note' => $m['note'] ?? '',
      'prevBalance' => f2($m['prev_balance']), 'balance' => f2($m['balance']), 'createdAt' => $m['created_at'],
    ], $moves),
    'purchases' => array_map(fn($p) => [
      'ref' => $p['ref'], 'date' => $p['date'], 'supplier' => $p['supplier'], 'billName' => $p['bill_name'] ?? '',
      'total' => (int)$p['total'], 'paidAmount' => (int)$p['paid_amount'], 'paymentStatus' => $p['payment_status'],
      'expenseId' => $p['expense_id'] ?? null,
      'payments' => $payBy[$p['ref']] ?? [],
    ], $pdo->query('SELECT * FROM stock_purchases ORDER BY date DESC, ref DESC')->fetchAll()),
  ];
}

/** Locks an item row and returns it with its current available quantity. Call inside a transaction. */
function lock_item(string $id): array {
  $st = db()->prepare('SELECT * FROM inventory_items WHERE id = ? FOR UPDATE');
  $st->execute([$id]);
  $i = $st->fetch();
  if (!$i) fail('Inventory item not found.', 404);
  $m = db()->prepare("SELECT
      COALESCE(SUM(CASE type WHEN 'out' THEN -qty WHEN 'issue' THEN -qty WHEN 'writeoff' THEN 0 ELSE qty END), 0) AS store,
      COALESCE(SUM(CASE type WHEN 'issue' THEN qty WHEN 'return' THEN -qty WHEN 'writeoff' THEN -qty ELSE 0 END), 0) AS in_use
    FROM stock_movements WHERE item_id = ?");
  $m->execute([$id]);
  $t = $m->fetch();
  $i['available'] = f2(f2($i['opening_stock']) + f2($t['store']));
  $i['in_use'] = f2($t['in_use']);
  return $i;
}

/** Change in store quantity for a movement. */
function store_delta(string $type, float $q): float {
  return match ($type) { 'out', 'issue' => -$q, 'writeoff' => 0.0, default => $q };
}
/** Change in "in use" (issued reusable items) for a movement. */
function use_delta(string $type, float $q): float {
  return match ($type) { 'issue' => $q, 'return', 'writeoff' => -$q, default => 0.0 };
}

function add_movement(array $item, string $ref, string $type, float $qty, array $extra = []): float {
  $prev = $item['available'];
  $bal = f2($prev + store_delta($type, $qty));
  db()->prepare('INSERT INTO stock_movements (id, ref, item_id, type, qty, rate, amount, date, department, supplier, note, prev_balance, balance, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      ->execute([gen_id('m'), $ref, $item['id'], $type, $qty, $extra['rate'] ?? null, $extra['amount'] ?? null, $extra['date'],
                 $extra['department'] ?? null, $extra['supplier'] ?? null, $extra['note'] ?? null, $prev, $bal, now_dt()]);
  return $bal;
}

function valid_date($d): string {
  $d = (string)$d;
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4))) {
    fail('Enter a valid date.');
  }
  return $d;
}
function pos_qty($v, string $what = 'quantity'): float {
  if (!is_numeric($v) || (float)$v <= 0 || (float)$v > 1000000) fail("Enter a $what greater than 0.");
  return f2($v);
}

// ---------------- Room availability ----------------

/** Rooms of a booking's villa value ("Haven", "S2, S3", or "Full Property" = every room). */
function villa_rooms(string $villa): array {
  if ($villa === 'Full Property') return CAPACITY_ROOMS;
  return array_values(array_filter(array_map('trim', explode(',', $villa)), fn($r) => $r !== ''));
}

/** Fails unless every room in the value is one of the current rooms (or the value is "Full Property"). */
function assert_room_names(string $villa): void {
  if ($villa === 'Full Property') return;
  $rooms = villa_rooms($villa);
  if (!$rooms) fail('Choose at least one room.');
  foreach ($rooms as $r) {
    if (!in_array($r, CAPACITY_ROOMS, true)) fail("“{$r}” is not one of the rooms.");
  }
  if (count($rooms) !== count(array_unique($rooms))) fail('A room is listed twice.');
}

/** What can still be refunded on a booking: money received (room and extras) less any
 *  cancellation charge and the refunds already paid. $exceptPaymentId leaves one ledger
 *  line out, for when that line itself is being edited. */
function refundable(array $booking, ?string $exceptPaymentId = null): int {
  $st = db()->prepare("SELECT
      COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END), 0) AS received,
      COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0) AS refunded
    FROM payments WHERE booking_ref = ? AND id <> ?");
  $st->execute([$booking['ref'], $exceptPaymentId ?? '']);
  $m = $st->fetch();
  return (int)$m['received'] - (int)($booking['cancellation_charge'] ?? 0) - (int)$m['refunded'];
}

/** Fails when any of the rooms is already held by another booking on a night of [in, out). */
function assert_rooms_free(string $villa, string $in, string $out, ?string $exceptRef = null): void {
  $want = villa_rooms($villa);
  $st = db()->prepare("SELECT ref, guest, villa, check_in, check_out FROM bookings
                       WHERE status <> 'cancelled' AND check_in < ? AND check_out > ? AND ref <> ?");
  $st->execute([$out, $in, $exceptRef ?? '']);
  foreach ($st->fetchAll() as $o) {
    $clash = array_values(array_intersect($want, villa_rooms($o['villa'])));
    if ($clash) fail("{$clash[0]} is already booked by {$o['guest']} ({$o['ref']}) from {$o['check_in']} to {$o['check_out']}.", 409);
  }
}

// ---------------- Guest ratings ----------------

const RATING_ASPECT_KEYS = ['rooms', 'cleanliness', 'food', 'service', 'value'];

function rating_shape(array $r): array {
  return [
    'id' => $r['id'], 'bookingRef' => $r['booking_ref'] ?? null, 'guest' => $r['guest'], 'overall' => (int)$r['overall'],
    'aspects' => (object)(json_decode($r['aspects'] ?: '{}', true) ?: []), 'comment' => $r['comment'] ?? '',
    'source' => $r['source'], 'date' => $r['date'], 'createdAt' => $r['created_at'],
    'response' => $r['response'] ?? '', 'respondedAt' => $r['responded_at'] ?? '',
  ];
}

function stars($v, string $what = 'rating'): int {
  if (!is_numeric($v) || (int)$v != $v || (int)$v < 1 || (int)$v > 5) fail("Give the $what from 1 to 5 stars.");
  return (int)$v;
}

/** {rooms: 4, …} with only known aspects rated 1–5. */
function clean_aspects($a): array {
  $out = [];
  if (!is_array($a)) return $out;
  foreach (RATING_ASPECT_KEYS as $k) {
    if (isset($a[$k]) && $a[$k] !== null && $a[$k] !== '' && $a[$k] !== 0) $out[$k] = stars($a[$k], $k);
  }
  return $out;
}

function get_rating(string $id): array {
  $st = db()->prepare('SELECT * FROM ratings WHERE id = ?');
  $st->execute([$id]);
  return rating_shape($st->fetch() ?: fail('Rating not found.', 404));
}

// ---------------- Room renames (old room list → current rooms) ----------------

/** Replaces one room in a comma list ("K1, S2" → "S1, S2"), keeping order and dropping duplicates. */
function swap_room(string $list, string $from, string $to): string {
  $rooms = array_map('trim', explode(',', $list));
  $out = [];
  foreach ($rooms as $r) {
    $r = $r === $from ? $to : $r;
    if ($r !== '' && !in_array($r, $out, true)) $out[] = $r;
  }
  return implode(', ', $out);
}
