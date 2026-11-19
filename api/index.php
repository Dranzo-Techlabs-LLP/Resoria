<?php
// ------------------------------------------------------------------
//  Resoria API — front controller / router
//  All /api/* requests land here (see .htaccess).
// ------------------------------------------------------------------
declare(strict_types=1);

namespace Weland;

use Throwable;

require __DIR__ . '/config.php';   // settings — stays on the server
require __DIR__ . '/lib.php';      // helpers — ships with every release
cors();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Path after ".../api/" -> e.g. "bookings/KV-00001/payments"
$uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$uri  = preg_replace('#^.*?/api/?#', '', $uri);
$path = trim((string)$uri, '/');
$seg  = $path === '' ? [] : explode('/', $path);

try {
  ensure_schema();

  // ---------- Public: login ----------
  if ($method === 'POST' && $path === 'login') {
    $b = body();
    $email = strtolower(trim($b['email'] ?? ''));
    $password = (string)($b['password'] ?? '');
    $st = db()->prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1');
    $st->execute([$email]);
    $u = $st->fetch();
    if (!$u || !password_verify($password, $u['password_hash'])) fail('Incorrect email or password.', 401);
    if ((int)$u['active'] !== 1) fail('This account is inactive.', 403);
    $token = bin2hex(random_bytes(32));
    db()->prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, NOW())')->execute([$token, $u['id']]);
    db()->prepare('UPDATE users SET last_login = CURDATE() WHERE id = ?')->execute([$u['id']]);
    json_out(['token' => $token, 'user' => public_user($u, true)]);
  }

  // ---------- Public: enquiry form on the website ----------
  //  The marketing site at "/" sends enquiries on WhatsApp and posts a copy
  //  here; no session needed. Mails the resort at ENQUIRY_TO_EMAIL (config.php),
  //  or logs it. The site doesn't show guests this reply.
  if ($method === 'POST' && $path === 'enquiry') {
    $b = body();

    // Honeypot: hidden from people, filled in by bots. Pretend it worked.
    if (trim((string)($b['website'] ?? '')) !== '') json_out(['ok' => true]);

    // One-line fields: strip CR/LF so nothing can leak into mail headers.
    $line = fn(string $k): string => trim(preg_replace('/[\r\n]+/', ' ', (string)($b[$k] ?? '')));
    $e = [
      'name'     => $line('name'),
      'phone'    => $line('phone'),
      'email'    => $line('email'),
      'stay'     => $line('stay'),
      'checkIn'  => $line('checkIn'),
      'checkOut' => $line('checkOut'),
      'guests'   => (int)($b['guests'] ?? 0),
      'notes'    => trim((string)($b['notes'] ?? '')),
    ];
    $isDate = fn(string $d): bool => (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)
      && checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4));

    if (strlen($e['name']) < 2 || strlen($e['name']) > 200) fail('Enter your name.');
    if (strlen(preg_replace('/\D/', '', $e['phone'])) < 10 || strlen($e['phone']) > 40) fail('Enter a phone number with at least 10 digits.');
    if (!filter_var($e['email'], FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
    if ($e['stay'] === '' || strlen($e['stay']) > 100) fail('Choose a stay.');
    if (!$isDate($e['checkIn']) || !$isDate($e['checkOut'])) fail('Choose your dates.');
    if ($e['checkOut'] <= $e['checkIn']) fail('Check-out must be after check-in.');
    if ($e['guests'] < 1 || $e['guests'] > 100) fail('Choose the number of guests.');
    if (strlen($e['notes']) > 6000) fail('Keep the note under a few paragraphs.');

    $text = implode("\n", [
      'New enquiry from the website',
      '',
      "Name:      {$e['name']}",
      "Phone:     {$e['phone']}",
      "Email:     {$e['email']}",
      "Stay:      {$e['stay']}",
      "Check-in:  {$e['checkIn']}",
      "Check-out: {$e['checkOut']}",
      "Guests:    {$e['guests']}",
      '',
      $e['notes'] !== '' ? "Notes:\n{$e['notes']}" : 'Notes: none',
    ]);

    // Local development: log instead of mailing (see config.example.php).
    if (defined('ENQUIRY_LOG_ONLY') && ENQUIRY_LOG_ONLY === true) {
      error_log("[resoria enquiry] (log only)\n$text");
      json_out(['ok' => true, 'delivered' => false]);
    }

    // Constants are read with defined() so an older config.php keeps working.
    $to = defined('ENQUIRY_TO_EMAIL') ? trim((string)ENQUIRY_TO_EMAIL) : '';
    if ($to === '') {
      error_log("[resoria enquiry] ENQUIRY_TO_EMAIL is not set; enquiry NOT mailed\n$text");
      fail('The enquiry could not be sent. Please call or WhatsApp us.', 503);
    }
    $host = preg_replace('/[^a-z0-9.-]/i', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $from = defined('ENQUIRY_FROM_EMAIL') && ENQUIRY_FROM_EMAIL !== '' ? ENQUIRY_FROM_EMAIL : "no-reply@$host";

    $subject = "Website enquiry: {$e['stay']}, {$e['checkIn']} to {$e['checkOut']} ({$e['name']})";
    $sent = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, [
      'From'         => "Resoria Evora website <$from>",
      'Reply-To'     => $e['email'],
      'Content-Type' => 'text/plain; charset=UTF-8',
    ]);
    if (!$sent) {
      error_log("[resoria enquiry] mail() failed; enquiry NOT mailed\n$text");
      fail('The enquiry could not be sent. Please call or WhatsApp us.', 500);
    }
    json_out(['ok' => true, 'delivered' => true]);
  }

  // ---------- Everything below requires a valid session ----------
  $me = require_user();

  if ($method === 'GET' && $path === 'me') {
    json_out(['user' => public_user($me, true)]);
  }

  if ($method === 'POST' && $path === 'logout') {
    $t = bearer_token();
    if ($t) db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([$t]);
    json_out(['ok' => true]);
  }

  if ($method === 'GET' && $path === 'bootstrap') {
    json_out(bootstrap_payload());
  }

  // ---------- Bookings ----------
  // Fields shared by create and edit. $cur = the stored row on edit (missing keys keep its value).
  $bookingFields = function (array $b, ?array $cur = null): array {
    $pick = fn(string $k, string $col, $def = '') => array_key_exists($k, $b) ? $b[$k] : ($cur[$col] ?? $def);
    $guest = trim((string)$pick('guest', 'guest'));
    $phone = trim((string)$pick('phone', 'phone'));
    $villa = trim((string)$pick('villa', 'villa'));
    $in = (string)$pick('checkIn', 'check_in', '');
    $out = (string)$pick('checkOut', 'check_out', '');
    if ($guest === '') fail('Guest name is required.');
    if ($villa === '') fail('Choose at least one room.');
    valid_date($in);
    valid_date($out);
    if ($out <= $in) fail('Check-out must be after check-in.');
    $adults = (int)$pick('adults', 'adults', 1);
    $kids = (int)$pick('kids', 'kids', 0);
    if ($adults < 0 || $kids < 0) fail('Guests cannot be negative.');
    $total = (int)round((float)$pick('total', 'total', 0));
    if ($total < 0) fail('The total amount cannot be negative.');
    $orig = array_key_exists('originalTotal', $b) ? (int)round((float)$b['originalTotal']) : ($cur ? ($cur['original_total'] ?? $cur['total']) : $total);
    $source = trim((string)$pick('source', 'source', 'Direct')) ?: 'Direct';
    $detail = trim((string)$pick('sourceDetail', 'source_detail', ''));
    if (in_array($source, ['B2B', 'OTA', 'Management Referral'], true) && $detail === '') {
      fail($source === 'B2B' ? 'Choose the agent.' : ($source === 'OTA' ? 'Choose the OTA platform.' : 'Choose who referred the booking.'));
    }
    $commission = $source === 'B2B' ? max(0, (int)round((float)$pick('commission', 'commission', 0))) : 0;
    return [
      'guest' => mb_substr($guest, 0, 160), 'phone' => mb_substr($phone, 0, 40),
      'alt_phone' => (trim((string)$pick('altPhone', 'alt_phone')) ?: null), 'email' => (trim((string)$pick('email', 'email')) ?: null),
      'place' => (trim((string)$pick('place', 'place')) ?: null),
      'villa' => mb_substr($villa, 0, 255), 'check_in' => $in, 'check_out' => $out,
      'guests' => max(1, $adults + $kids), 'adults' => $adults, 'kids' => $kids,
      'total' => $total, 'original_total' => (int)$orig, 'source' => mb_substr($source, 0, 40),
      'source_detail' => ($detail !== '' ? mb_substr($detail, 0, 120) : null), 'commission' => $commission,
      'notes' => (trim((string)$pick('notes', 'notes')) ?: null),
    ];
  };
  $methodOf = fn($m) => mb_substr(trim((string)($m ?? '')), 0, 20);

  if ($method === 'POST' && $path === 'bookings') {
    require_right($me, 'edit_bookings');
    $b = body();
    $f = $bookingFields($b);
    $status = in_array($b['status'] ?? 'confirmed', ['enquiry', 'hold', 'confirmed'], true) ? ($b['status'] ?? 'confirmed') : 'confirmed';
    $advance = (int)round((float)($b['advance'] ?? 0));
    if ($advance < 0) fail('The advance cannot be negative.');
    if ($advance > 0 && $methodOf($b['advanceMethod'] ?? '') === '') fail('Choose the payment mode for the advance.');
    $pdo = db();
    $pdo->beginTransaction();
    $inv = $pdo->query('SELECT * FROM invoice_settings WHERE id = 1 FOR UPDATE')->fetch(); // also serialises concurrent bookings
    if ($status !== 'enquiry') assert_rooms_free($f['villa'], $f['check_in'], $f['check_out']);
    $doc = !empty($b['document']) ? store_upload($b['document'], 'doc') : [null, null];
    $ref = $inv['prefix'] . str_pad((string)$inv['next'], (int)$inv['padding'], '0', STR_PAD_LEFT);
    $pdo->prepare('UPDATE invoice_settings SET next = next + 1 WHERE id = 1')->execute();
    $cols = array_merge(['id' => gen_id('b'), 'ref' => $ref, 'status' => $status, 'created_at' => date('Y-m-d'),
                         'document_name' => $doc[0], 'document_path' => $doc[1]], $f);
    $pdo->prepare('INSERT INTO bookings (' . implode(',', array_keys($cols)) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')')
        ->execute(array_values($cols));
    add_event($ref, 'Booking created');
    if ($advance > 0) {
      $m = $methodOf($b['advanceMethod']);
      $pdo->prepare("INSERT INTO payments (id, booking_ref, date, amount, kind, method, reference, is_advance, purpose, created_at)
                     VALUES (?, ?, ?, ?, 'payment', ?, NULL, 1, 'room', ?)")
          ->execute([gen_id('p'), $ref, date('Y-m-d'), $advance, $m, now_dt()]);
      add_event($ref, 'Advance payment ' . inr($advance) . " received ($m)");
    }
    if ($f['source'] === 'B2B' && $f['commission'] > 0) {
      add_event($ref, 'B2B commission ' . inr($f['commission']) . " for {$f['source_detail']} recorded as pending");
    }
    // Older admin versions send a commission amount to book as an expense right away
    if (array_key_exists('b2bCommission', $b)) sync_b2b_expense($ref, $f['villa'], (int)round((float)$b['b2bCommission']));
    $pdo->commit();
    json_out(['ref' => $ref, 'booking' => get_booking($ref)], 201);
  }

  // Older admin versions change the status directly
  if ($method === 'PATCH' && count($seg) === 2 && $seg[0] === 'bookings') {
    $cur = booking_row($seg[1]);
    $b = body();
    if (isset($b['status']) && $b['status'] !== $cur['status']) {
      $allowed = ['enquiry', 'hold', 'confirmed', 'checked in', 'completed', 'cancelled'];
      if (!in_array($b['status'], $allowed, true)) fail('Unknown status.');
      require_right($me, $b['status'] === 'cancelled' ? 'cancel_bookings' : 'edit_bookings');
      $stamp = ['checked in' => 'checked_in_at', 'completed' => 'completed_at', 'cancelled' => 'cancelled_at'][$b['status']] ?? null;
      db()->prepare('UPDATE bookings SET status = ?' . ($stamp ? ", $stamp = COALESCE($stamp, ?)" : '') . ' WHERE ref = ?')
          ->execute($stamp ? [$b['status'], now_dt(), $cur['ref']] : [$b['status'], $cur['ref']]);
      add_event($cur['ref'], 'Status changed to ' . ($b['status'] === 'checked in' ? 'in-house' : $b['status']));
    }
    json_out(['booking' => get_booking($cur['ref'])]);
  }

  // Edit a booking's details (fields left out keep their value)
  if ($method === 'PUT' && count($seg) === 2 && $seg[0] === 'bookings') {
    require_right($me, 'edit_bookings');
    $cur = booking_row($seg[1]);
    $ref = $cur['ref']; // the booking's own ref (the URL may differ in letter case)
    if (in_array($cur['status'], ['completed', 'cancelled'], true)) fail('Completed and cancelled bookings are read-only.');
    $b = body();
    $f = $bookingFields($b, $cur);
    if ($cur['status'] === 'checked in' && $f['check_in'] !== $cur['check_in']) fail("The guest has checked in, so the check-in date can't change.");
    $status = $cur['status'];
    if (isset($b['status']) && is_pre_arrival($cur['status']) && in_array($b['status'], ['enquiry', 'hold', 'confirmed'], true)) $status = $b['status'];
    $pdo = db();
    $pdo->beginTransaction();
    $labels = ['guest' => 'guest name', 'phone' => 'phone', 'alt_phone' => 'alternate phone', 'email' => 'email', 'place' => 'place',
               'villa' => 'rooms', 'check_in' => 'check-in date', 'check_out' => 'check-out date', 'adults' => 'adults', 'kids' => 'kids',
               'total' => 'booking amount', 'source' => 'booking source', 'source_detail' => 'source details', 'notes' => 'guest notes'];
    $changed = [];
    foreach ($labels as $col => $label) {
      if ((string)($cur[$col] ?? '') !== (string)($f[$col] ?? '')) $changed[] = $label;
    }
    if (array_key_exists('document', $b)) {
      if ($b['document'] === null) {
        delete_upload($cur['document_path'] ?? null);
        $f['document_name'] = null;
        $f['document_path'] = null;
        $changed[] = 'ID document removed';
      } else {
        [$f['document_name'], $f['document_path']] = store_upload($b['document'], 'doc');
        delete_upload($cur['document_path'] ?? null);
        $changed[] = 'ID document';
      }
    }
    $f['status'] = $status;
    // Re-check rooms only when the rooms or dates change (older overlapping bookings stay editable)
    if ($status !== 'enquiry' && ($f['villa'] !== $cur['villa'] || $f['check_in'] !== $cur['check_in'] || $f['check_out'] !== $cur['check_out'])) {
      $pdo->query('SELECT id FROM invoice_settings WHERE id = 1 FOR UPDATE');
      assert_rooms_free($f['villa'], $f['check_in'], $f['check_out'], $ref);
    }
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($f)));
    $pdo->prepare("UPDATE bookings SET $sets WHERE ref = ?")->execute([...array_values($f), $ref]);
    // B2B commission entries are booked under the booking's first room, so they follow a room change
    $pdo->prepare("UPDATE expenses SET villa = ? WHERE booking_ref = ? AND category = 'B2B Commission'")->execute([primary_room($f['villa']), $ref]);
    // The advance entered while booking: create / update / remove that one payment (not after check-in)
    if (array_key_exists('advance', $b) && is_pre_arrival($cur['status'])) {
      $st = $pdo->prepare('SELECT amount, method FROM payments WHERE booking_ref = ? AND is_advance = 1 LIMIT 1');
      $st->execute([$ref]);
      $old = $st->fetch() ?: ['amount' => 0, 'method' => ''];
      $amt = max(0, (int)round((float)($b['advance'] ?? 0)));
      $m = $methodOf($b['advanceMethod'] ?? '') ?: 'Cash';
      if ($amt !== (int)$old['amount'] || ($amt > 0 && $m !== (string)$old['method'])) {
        sync_advance($ref, $amt, $m);
        $pdo->prepare("UPDATE payments SET created_at = COALESCE(created_at, ?) WHERE booking_ref = ? AND is_advance = 1")->execute([now_dt(), $ref]);
        $changed[] = $amt > 0 ? 'advance ' . inr($amt) . " ($m)" : 'advance removed';
      }
    }
    if (array_key_exists('b2bCommission', $b)) sync_b2b_expense($ref, $f['villa'], (int)round((float)$b['b2bCommission']));
    if ($changed) add_event($ref, 'Booking edited: ' . implode(', ', array_unique($changed)) . ' updated');
    $pdo->commit();
    json_out(['booking' => get_booking($ref)]);
  }

  // Permanently delete a booking (with its payments, charges, history, ID proof and B2B commission entries)
  if ($method === 'DELETE' && count($seg) === 2 && $seg[0] === 'bookings') {
    require_right($me, 'cancel_bookings');
    $cur = booking_row($seg[1]);
    $ref = $cur['ref'];
    $pdo = db();
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM payments WHERE booking_ref = ?')->execute([$ref]);
    $pdo->prepare('DELETE FROM booking_charges WHERE booking_ref = ?')->execute([$ref]);
    $pdo->prepare('DELETE FROM booking_events WHERE booking_ref = ?')->execute([$ref]);
    $pdo->prepare("DELETE FROM expenses WHERE booking_ref = ? AND category = 'B2B Commission'")->execute([$ref]);
    $pdo->prepare('DELETE FROM bookings WHERE ref = ?')->execute([$ref]);
    $pdo->commit();
    delete_upload($cur['document_path'] ?? null);
    json_out(['ok' => true]);
  }

  // ID proof
  if ($method === 'GET' && count($seg) === 3 && $seg[0] === 'bookings' && $seg[2] === 'document') {
    require_right($me, 'view_bookings');
    $cur = booking_row($seg[1]);
    send_upload($cur['document_path'] ?? null, $cur['document_name'] ?? null);
  }

  // ---------- Booking lifecycle ----------
  if ($method === 'POST' && count($seg) === 3 && $seg[0] === 'bookings' && $seg[2] === 'check-in') {
    require_right($me, 'edit_bookings');
    $cur = booking_row($seg[1]);
    if (!is_pre_arrival($cur['status'])) fail('Only a confirmed booking can be checked in.');
    $due = room_balance($cur);
    if ($due > 0) fail('Collect the remaining ' . inr($due) . ' before check-in.');
    db()->prepare("UPDATE bookings SET status = 'checked in', checked_in_at = ? WHERE ref = ?")->execute([now_dt(), $cur['ref']]);
    add_event($cur['ref'], 'Checked in');
    json_out(['booking' => get_booking($cur['ref'])]);
  }

  if ($method === 'POST' && count($seg) === 3 && $seg[0] === 'bookings' && $seg[2] === 'check-out') {
    require_right($me, 'edit_bookings');
    $cur = booking_row($seg[1]);
    if ($cur['status'] !== 'checked in') fail('Only an in-house booking can be checked out.');
    $due = room_balance($cur);
    if ($due > 0) fail('Collect the remaining room balance of ' . inr($due) . ' before check-out.');
    $extra = charges_due($cur['ref']);
    if ($extra > 0) fail('Collect the ' . inr($extra) . ' additional expenses before check-out.');
    $t = now_dt();
    db()->prepare("UPDATE bookings SET status = 'completed', checked_out_at = ?, completed_at = ? WHERE ref = ?")->execute([$t, $t, $cur['ref']]);
    add_event($cur['ref'], 'Checked out', $t);
    add_event($cur['ref'], 'Booking completed', $t);
    json_out(['booking' => get_booking($cur['ref'])]);
  }

  if ($method === 'POST' && count($seg) === 3 && $seg[0] === 'bookings' && $seg[2] === 'cancel') {
    require_right($me, 'cancel_bookings');
    $cur = booking_row($seg[1]);
    if (!is_pre_arrival($cur['status'])) fail($cur['status'] === 'cancelled' ? 'This booking is already cancelled.' : "A booking can't be cancelled after check-in.");
    $b = body();
    $charge = (int)round((float)($b['cancellationCharge'] ?? 0));
    $received = room_received($cur['ref']);
    if ($charge < 0) fail('Cancellation charges cannot be negative.');
    if ($charge > $received) fail('Cancellation charges cannot be more than the ' . inr($received) . ' received.');
    $t = now_dt();
    db()->prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancellation_charge = ? WHERE ref = ?")->execute([$t, $charge, $cur['ref']]);
    add_event($cur['ref'], 'Booking cancelled', $t);
    if ($charge > 0) add_event($cur['ref'], 'Cancellation charges ' . inr($charge) . ' applied', $t);
    $st = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE booking_ref = ? AND kind = 'refund'");
    $st->execute([$cur['ref']]);
    $refund = $received - $charge - (int)$st->fetchColumn();
    if ($refund > 0) add_event($cur['ref'], 'Refund of ' . inr($refund) . ' marked pending', $t);
    json_out(['booking' => get_booking($cur['ref'])]);
  }

  // ---------- Payments ----------
  if ($method === 'POST' && count($seg) === 3 && $seg[0] === 'bookings' && $seg[2] === 'payments') {
    require_right($me, 'record_payments');
    $cur = booking_row($seg[1]);
    $b = body();
    $kind = ($b['kind'] ?? 'payment') === 'refund' ? 'refund' : 'payment';
    $amount = (int)round((float)($b['amount'] ?? 0));
    if ($amount <= 0) fail('Enter an amount greater than ₹0.');
    $date = valid_date($b['date'] ?? date('Y-m-d'));
    $m = $methodOf($b['method'] ?? '');
    $purpose = ($b['purpose'] ?? 'room') === 'extras' ? 'extras' : 'room';
    $advance = !empty($b['advance']) && $kind === 'payment' && $purpose === 'room';
    if ($kind === 'refund') {
      $st = db()->prepare("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE booking_ref = ? AND kind = 'refund'");
      $st->execute([$cur['ref']]);
      $max = room_received($cur['ref']) - (int)($cur['cancellation_charge'] ?? 0) - (int)$st->fetchColumn();
      if ($cur['status'] === 'cancelled' && $amount > $max) fail('The refund cannot be more than the ' . inr(max(0, $max)) . ' still refundable.');
    }
    db()->prepare('INSERT INTO payments (id, booking_ref, date, amount, kind, method, reference, is_advance, purpose, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([gen_id('p'), $cur['ref'], $date, $amount, $kind, $m ?: null, (trim((string)($b['reference'] ?? '')) ?: null), $advance ? 1 : 0, $purpose, now_dt()]);
    $how = $m ? " ($m)" : '';
    add_event($cur['ref'], $kind === 'refund'
      ? 'Refund of ' . inr($amount) . " paid$how"
      : ($advance ? 'Advance payment ' : ($purpose === 'extras' ? 'Additional expenses payment ' : 'Remaining payment ')) . inr($amount) . " received$how");
    json_out(['booking' => get_booking($cur['ref'])], 201);
  }

  // Edit / delete a single ledger line
  if (($method === 'PUT' || $method === 'DELETE') && count($seg) === 2 && $seg[0] === 'payments') {
    require_right($me, 'record_payments');
    $st = db()->prepare('SELECT * FROM payments WHERE id = ?');
    $st->execute([$seg[1]]);
    $row = $st->fetch();
    if (!$row) fail('Payment not found.', 404);
    if (($row['purpose'] ?? 'room') === 'extras') fail('This payment settles additional expenses; it can’t be changed.');
    if ($method === 'DELETE') {
      db()->prepare('DELETE FROM payments WHERE id = ?')->execute([$seg[1]]);
      add_event($row['booking_ref'], 'Payment entry of ' . inr((int)$row['amount']) . ' removed');
    } else {
      $b = body();
      $kind = ($b['kind'] ?? 'payment') === 'refund' ? 'refund' : 'payment';
      $amount = (int)round((float)($b['amount'] ?? 0));
      if ($amount <= 0) fail('Enter an amount greater than ₹0.');
      db()->prepare('UPDATE payments SET date = ?, amount = ?, kind = ?, method = ?, reference = ?, is_advance = ? WHERE id = ?')
          ->execute([valid_date($b['date'] ?? date('Y-m-d')), $amount, $kind,
                     ($b['method'] ?? '') ?: null, ($b['reference'] ?? '') ?: null,
                     (!empty($b['advance']) && $kind === 'payment') ? 1 : 0, $seg[1]]);
      add_event($row['booking_ref'], 'Payment entry edited: ' . inr($amount));
    }
    json_out(['booking' => get_booking($row['booking_ref'])]);
  }

  // ---------- Additional expenses (In-house) ----------
  $chargeInput = function (array $b): array {
    $cat = (string)($b['category'] ?? '');
    if (!in_array($cat, ['Food', 'Conference Hall', 'Other Services'], true)) fail('Choose Food, Conference Hall or Other Services.');
    $item = mb_substr(trim((string)($b['item'] ?? '')), 0, 160);
    if ($item === '') fail($cat === 'Other Services' ? 'Describe the service.' : 'Choose the item.');
    $qty = (int)($b['qty'] ?? 1);
    if ($qty < 1 || $qty > 1000) fail('Enter a quantity of at least 1.');
    $rate = (int)round((float)($b['rate'] ?? 0));
    if ($rate < 0 || $rate > 10000000) fail('Enter a valid rate.');
    return ['category' => $cat, 'item' => $item, 'qty' => $qty, 'rate' => $rate, 'total' => $qty * $rate];
  };

  if ($method === 'POST' && count($seg) === 3 && $seg[0] === 'bookings' && $seg[2] === 'charges') {
    require_right($me, 'edit_bookings');
    $cur = booking_row($seg[1]);
    if ($cur['status'] !== 'checked in') fail('Additional expenses can be added after guest check-in.');
    $c = $chargeInput(body());
    $t = now_dt();
    db()->prepare('INSERT INTO booking_charges (id, booking_ref, category, item, qty, rate, total, at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([gen_id('c'), $cur['ref'], $c['category'], $c['item'], $c['qty'], $c['rate'], $c['total'], $t]);
    add_event($cur['ref'], charge_event_text($c['category'], $c['item'], $c['qty'], $c['rate'], $c['total']), $t);
    json_out(['booking' => get_booking($cur['ref'])], 201);
  }

  if (($method === 'PUT' || $method === 'DELETE') && count($seg) === 2 && $seg[0] === 'charges') {
    require_right($me, 'edit_bookings');
    $st = db()->prepare('SELECT * FROM booking_charges WHERE id = ?');
    $st->execute([$seg[1]]);
    $row = $st->fetch();
    if (!$row) fail('Expense not found.', 404);
    if ($row['payment_id']) fail('This expense is already paid and can’t be changed.');
    $cur = booking_row($row['booking_ref']);
    if ($cur['status'] !== 'checked in') fail('Additional expenses can only be changed while the guest is in-house.');
    $old = "{$row['item']} × {$row['qty']} · " . inr((int)$row['total']);
    if ($method === 'DELETE') {
      db()->prepare('DELETE FROM booking_charges WHERE id = ?')->execute([$row['id']]);
      add_event($cur['ref'], "Expense removed: $old");
    } else {
      $c = $chargeInput(body());
      db()->prepare('UPDATE booking_charges SET category = ?, item = ?, qty = ?, rate = ?, total = ? WHERE id = ?')
          ->execute([$c['category'], $c['item'], $c['qty'], $c['rate'], $c['total'], $row['id']]);
      add_event($cur['ref'], "Expense edited: $old → {$c['item']} × {$c['qty']} · " . inr($c['total']));
    }
    json_out(['booking' => get_booking($cur['ref'])]);
  }

  if ($method === 'POST' && count($seg) === 4 && $seg[0] === 'bookings' && $seg[2] === 'charges' && $seg[3] === 'collect') {
    require_right($me, 'record_payments');
    $cur = booking_row($seg[1]);
    $b = body();
    $m = $methodOf($b['method'] ?? '');
    if ($m === '') fail('Choose the payment method.');
    $date = valid_date($b['date'] ?? date('Y-m-d'));
    $pdo = db();
    $pdo->beginTransaction();
    $st = $pdo->prepare('SELECT id, total FROM booking_charges WHERE booking_ref = ? AND payment_id IS NULL FOR UPDATE');
    $st->execute([$cur['ref']]);
    $rows = $st->fetchAll();
    $sum = array_sum(array_map(fn($r) => (int)$r['total'], $rows));
    if ($sum <= 0) { $pdo->rollBack(); fail('There are no additional expenses to collect.'); }
    $pid = gen_id('p');
    $t = now_dt();
    $pdo->prepare("INSERT INTO payments (id, booking_ref, date, amount, kind, method, reference, is_advance, purpose, created_at)
                   VALUES (?,?,?,?, 'payment', ?, ?, 0, 'extras', ?)")
        ->execute([$pid, $cur['ref'], $date, $sum, $m, (trim((string)($b['reference'] ?? '')) ?: null), $t]);
    $upd = $pdo->prepare('UPDATE booking_charges SET payment_id = ? WHERE id = ?');
    foreach ($rows as $r) $upd->execute([$pid, $r['id']]);
    add_event($cur['ref'], 'Additional expenses ' . inr($sum) . " collected ($m) · bill generated", $t);
    $pdo->commit();
    json_out(['booking' => get_booking($cur['ref'])], 201);
  }

  // ---------- Configuration lists ----------
  if ($method === 'PUT' && count($seg) === 2 && $seg[0] === 'settings') {
    require_right($me, 'manage_config');
    $key = $seg[1];
    if (!in_array($key, SETTINGS_KEYS, true)) fail('Unknown setting.', 404);
    $clean = clean_settings($key, body()['value'] ?? null);
    db()->prepare('INSERT INTO app_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)')
        ->execute([$key, json_encode($clean, JSON_UNESCAPED_UNICODE)]);
    json_out(['settings' => settings_payload()]);
  }

  // ---------- Inventory ----------
  $itemInput = function (array $b, ?array $cur = null): array {
    $pick = fn(string $k, string $col, $def = '') => array_key_exists($k, $b) ? $b[$k] : ($cur[$col] ?? $def);
    $name = mb_substr(trim((string)$pick('name', 'name')), 0, 120);
    $cat = mb_substr(trim((string)$pick('category', 'category')), 0, 60);
    $unit = mb_substr(trim((string)$pick('unit', 'unit')), 0, 20);
    if ($name === '') fail('Item name is required.');
    if ($cat === '') fail('Choose a category.');
    if ($unit === '') fail('Choose a unit.');
    $min = $pick('minStock', 'min_stock', 0);
    if (!is_numeric($min) || (float)$min < 0) fail('Enter a minimum stock level of 0 or more.');
    $dup = db()->prepare('SELECT id FROM inventory_items WHERE LOWER(TRIM(name)) = LOWER(?) AND LOWER(unit) = LOWER(?) AND id <> ?');
    $dup->execute([$name, $unit, $cur['id'] ?? '']);
    if ($dup->fetch()) fail("“$name” ($unit) already exists.");
    return ['name' => $name, 'category' => $cat, 'unit' => $unit, 'min_stock' => f2($min),
            'active' => array_key_exists('active', $b) ? (int)!!$b['active'] : (int)($cur['active'] ?? 1)];
  };

  if ($method === 'POST' && $path === 'inventory/items') {
    require_right($me, 'manage_config');
    $b = body();
    $f = $itemInput($b);
    $open = $b['openingStock'] ?? 0;
    if (!is_numeric($open) || (float)$open < 0) fail('Enter an opening stock of 0 or more.');
    $pdo = db();
    $pdo->beginTransaction();
    $id = 'INV-' . str_pad((string)next_number('INV'), 4, '0', STR_PAD_LEFT);
    $pdo->prepare('INSERT INTO inventory_items (id, name, category, unit, min_stock, opening_stock, active, created_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$id, $f['name'], $f['category'], $f['unit'], $f['min_stock'], f2($open), $f['active'], now_dt()]);
    $pdo->commit();
    $inv = inventory_payload();
    $item = current(array_filter($inv['items'], fn($i) => $i['id'] === $id));
    json_out(['inventory' => $inv, 'item' => $item], 201);
  }

  if ($method === 'PUT' && count($seg) === 3 && $seg[0] === 'inventory' && $seg[1] === 'items') {
    require_right($me, 'manage_config');
    $st = db()->prepare('SELECT * FROM inventory_items WHERE id = ?');
    $st->execute([$seg[2]]);
    $cur = $st->fetch();
    if (!$cur) fail('Inventory item not found.', 404);
    $f = $itemInput(body(), $cur);
    db()->prepare('UPDATE inventory_items SET name = ?, category = ?, unit = ?, min_stock = ?, active = ? WHERE id = ?')
        ->execute([$f['name'], $f['category'], $f['unit'], $f['min_stock'], $f['active'], $cur['id']]);
    json_out(['inventory' => inventory_payload()]);
  }

  if ($method === 'POST' && $path === 'inventory/purchases') {
    require_right($me, 'edit_inventory');
    $b = body();
    $date = valid_date($b['date'] ?? '');
    $supplier = mb_substr(trim((string)($b['supplier'] ?? '')), 0, 120);
    $lines = is_array($b['lines'] ?? null) ? $b['lines'] : [];
    if (!$lines) fail('Add at least one item.');
    $status = in_array($b['paymentStatus'] ?? '', ['Paid', 'Unpaid', 'Partially Paid'], true) ? $b['paymentStatus'] : fail('Choose the payment status.');
    $bill = !empty($b['bill']) ? store_upload($b['bill'], 'bill') : [null, null];
    $pdo = db();
    $pdo->beginTransaction();
    $ref = 'PUR-' . str_pad((string)next_number('PUR'), 5, '0', STR_PAD_LEFT);
    $total = 0;
    $names = [];
    foreach ($lines as $l) {
      $item = lock_item((string)($l['itemId'] ?? ''));
      if ((int)$item['active'] !== 1) fail("“{$item['name']}” is inactive.");
      $qty = pos_qty($l['qty'] ?? null, 'purchase quantity');
      $rate = $l['rate'] ?? null;
      if (!is_numeric($rate) || (float)$rate < 0) fail("Enter the rate for “{$item['name']}”.");
      $amount = (int)round($qty * (float)$rate);
      $total += $amount;
      $names[] = $item['name'];
      add_movement($item, $ref, 'in', $qty, ['rate' => f2($rate), 'amount' => $amount, 'date' => $date, 'supplier' => $supplier ?: null]);
    }
    $paid = (int)round((float)($b['paidAmount'] ?? 0));
    if ($paid < 0 || $paid > $total) fail('The paid amount must be between ₹0 and the purchase total.');
    if ($status === 'Paid' && $paid !== $total) fail('“Paid” means the full ' . inr($total) . ' was paid.');
    if ($status === 'Unpaid' && $paid !== 0) fail('“Unpaid” means nothing was paid yet.');
    if ($status === 'Partially Paid' && ($paid <= 0 || $paid >= $total)) fail('“Partially paid” needs a paid amount between ₹0 and ' . inr($total) . '.');
    $expId = gen_id('e');
    $desc = mb_substr("Stock purchase · $ref" . ($supplier ? " · $supplier" : '') . ' · ' . implode(', ', $names) . ($status !== 'Paid' ? " ($status)" : ''), 0, 255);
    $pdo->prepare("INSERT INTO expenses (id, date, category, villa, booking_ref, description, amount, source_ref) VALUES (?, ?, 'Inventory Purchase', '', NULL, ?, ?, ?)")
        ->execute([$expId, $date, $desc, $total, $ref]);
    $pdo->prepare('INSERT INTO stock_purchases (ref, date, supplier, bill_name, bill_path, total, paid_amount, payment_status, expense_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([$ref, $date, $supplier, $bill[0], $bill[1], $total, $paid, $status, $expId, now_dt()]);
    $pdo->commit();
    $e = $pdo->prepare('SELECT * FROM expenses WHERE id = ?');
    $e->execute([$expId]);
    json_out(['inventory' => inventory_payload(), 'ref' => $ref, 'expense' => expense_shape($e->fetch())], 201);
  }

  if ($method === 'GET' && count($seg) === 4 && $seg[0] === 'inventory' && $seg[1] === 'purchases' && $seg[3] === 'bill') {
    require_right($me, 'view_inventory');
    $st = db()->prepare('SELECT bill_name, bill_path FROM stock_purchases WHERE ref = ?');
    $st->execute([$seg[2]]);
    $p = $st->fetch() ?: fail('Purchase not found.', 404);
    send_upload($p['bill_path'] ?? null, $p['bill_name'] ?? null);
  }

  if ($method === 'POST' && $path === 'inventory/usage') {
    require_right($me, 'edit_inventory');
    $b = body();
    $date = valid_date($b['date'] ?? '');
    $dept = mb_substr(trim((string)($b['department'] ?? '')), 0, 60);
    if ($dept === '') fail('Choose the department.');
    $lines = is_array($b['lines'] ?? null) ? $b['lines'] : [];
    if (!$lines) fail('Add at least one item.');
    $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 255) ?: null;
    $pdo = db();
    $pdo->beginTransaction();
    $ref = 'USE-' . str_pad((string)next_number('USE'), 5, '0', STR_PAD_LEFT);
    foreach ($lines as $l) {
      $item = lock_item((string)($l['itemId'] ?? ''));
      if ((int)$item['active'] !== 1) fail("“{$item['name']}” is inactive.");
      $qty = pos_qty($l['qty'] ?? null);
      if ($qty > $item['available']) fail("Only {$item['available']} {$item['unit']} of “{$item['name']}” is available.");
      add_movement($item, $ref, 'out', $qty, ['date' => $date, 'department' => $dept, 'note' => $note]);
    }
    $pdo->commit();
    json_out(['inventory' => inventory_payload(), 'ref' => $ref], 201);
  }

  if ($method === 'POST' && $path === 'inventory/adjustments') {
    require_right($me, 'edit_inventory');
    $b = body();
    $date = valid_date($b['date'] ?? '');
    $qty = $b['qty'] ?? null;
    if (!is_numeric($qty) || (float)$qty == 0.0 || abs((float)$qty) > 1000000) fail('Enter the quantity to add (+) or remove (−).');
    $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 255);
    if ($note === '') fail('Give a reason for the adjustment.');
    $pdo = db();
    $pdo->beginTransaction();
    $item = lock_item((string)($b['itemId'] ?? ''));
    if ($item['available'] + f2($qty) < 0) fail("Only {$item['available']} {$item['unit']} is available.");
    $ref = 'ADJ-' . str_pad((string)next_number('ADJ'), 5, '0', STR_PAD_LEFT);
    add_movement($item, $ref, 'adjust', f2($qty), ['date' => $date, 'note' => $note]);
    $pdo->commit();
    json_out(['inventory' => inventory_payload(), 'ref' => $ref], 201);
  }

  // ---------- Expenses ----------
  if ($method === 'POST' && $path === 'expenses') {
    require_right($me, 'edit_expenses');
    $b = body();
    $id = gen_id('e');
    $row = [
      'id' => $id, 'date' => $b['date'] ?? date('Y-m-d'), 'category' => $b['category'] ?? 'Misc',
      'villa' => $b['villa'] ?? '', 'bookingRef' => ($b['bookingRef'] ?? '') ?: null,
      'description' => $b['description'] ?? '', 'amount' => (int)round((float)($b['amount'] ?? 0)),
    ];
    $row = normalize_expense_link($row);
    // "Collected externally" only applies to a B2B commission; the column is only touched when it is sent,
    // so ordinary expenses keep saving before the migration has been run.
    if (array_key_exists('external', $b) && !is_bool($b['external'])) fail('Invalid option.');
    $row['external'] = $row['category'] === 'B2B Commission' && !empty($b['external']);
    if (array_key_exists('external', $b)) {
      db()->prepare('INSERT INTO expenses (id, date, category, villa, booking_ref, description, amount, `external`) VALUES (?,?,?,?,?,?,?,?)')
          ->execute([$row['id'], $row['date'], $row['category'], $row['villa'], $row['bookingRef'], $row['description'], $row['amount'], (int)$row['external']]);
    } else {
      db()->prepare('INSERT INTO expenses (id, date, category, villa, booking_ref, description, amount) VALUES (?,?,?,?,?,?,?)')
          ->execute([$row['id'], $row['date'], $row['category'], $row['villa'], $row['bookingRef'], $row['description'], $row['amount']]);
    }
    // A B2B commission paid out against a booking shows in its stay history
    if ($row['category'] === 'B2B Commission' && $row['bookingRef'] !== null) {
      $chk = db()->prepare('SELECT ref FROM bookings WHERE ref = ?');
      $chk->execute([$row['bookingRef']]);
      if ($chk->fetch()) add_event($row['bookingRef'], 'B2B commission ' . inr($row['amount']) . ($row['external'] ? ' collected externally by the agent' : ' paid to the agent'));
    }
    $row['sourceRef'] = null;
    json_out(['expense' => $row], 201);
  }

  // Edit an expense in place (fields left out keep their current value)
  if ($method === 'PUT' && count($seg) === 2 && $seg[0] === 'expenses') {
    require_right($me, 'edit_expenses');
    $st = db()->prepare('SELECT * FROM expenses WHERE id = ?');
    $st->execute([$seg[1]]);
    $cur = $st->fetch();
    if (!$cur) fail('Expense not found.', 404);
    $b = body();
    $row = [
      'id'          => $cur['id'],
      'date'        => $b['date'] ?? $cur['date'],
      'category'    => $b['category'] ?? $cur['category'],
      'villa'       => $b['villa'] ?? $cur['villa'],
      'bookingRef'  => array_key_exists('bookingRef', $b) ? (($b['bookingRef'] ?? '') ?: null) : $cur['booking_ref'],
      'description' => $b['description'] ?? $cur['description'],
      'amount'      => array_key_exists('amount', $b) ? (int)round((float)$b['amount']) : (int)$cur['amount'],
    ];
    $row = normalize_expense_link($row);
    if (array_key_exists('external', $b) && !is_bool($b['external'])) fail('Invalid option.');
    $wasExternal = (int)($cur['external'] ?? 0) === 1;
    $row['external'] = $row['category'] === 'B2B Commission'
      && (array_key_exists('external', $b) ? (bool)$b['external'] : $wasExternal);
    // touch the column only when it is sent, or when it has to be cleared (the entry stops being a B2B commission)
    if (array_key_exists('external', $b) || ($wasExternal && !$row['external'])) {
      db()->prepare('UPDATE expenses SET date = ?, category = ?, villa = ?, booking_ref = ?, description = ?, amount = ?, `external` = ? WHERE id = ?')
          ->execute([$row['date'], $row['category'], $row['villa'], $row['bookingRef'], $row['description'], $row['amount'], (int)$row['external'], $row['id']]);
    } else {
      db()->prepare('UPDATE expenses SET date = ?, category = ?, villa = ?, booking_ref = ?, description = ?, amount = ? WHERE id = ?')
          ->execute([$row['date'], $row['category'], $row['villa'], $row['bookingRef'], $row['description'], $row['amount'], $row['id']]);
    }
    json_out(['expense' => $row]);
  }

  if ($method === 'DELETE' && count($seg) === 2 && $seg[0] === 'expenses') {
    require_right($me, 'edit_expenses');
    db()->prepare('DELETE FROM expenses WHERE id = ?')->execute([$seg[1]]);
    json_out(['ok' => true]);
  }

  // ---------- Users ----------
  if ($method === 'POST' && $path === 'users') {
    require_right($me, 'manage_users');
    $b = body();
    $name  = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $role  = (string)($b['role'] ?? '');
    $pw    = (string)($b['password'] ?? '');
    if ($name === '') fail('Full name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
    if (!role_exists($role)) fail('Choose a role.');
    if (strlen($pw) < 6) fail('Password must be at least 6 characters.');
    $exists = db()->prepare('SELECT id FROM users WHERE LOWER(email) = ?');
    $exists->execute([$email]);
    if ($exists->fetch()) fail('A user with that email already exists.');
    $id = gen_id('u');
    db()->prepare('INSERT INTO users (id, name, email, password_hash, role, villa, active, last_login) VALUES (?,?,?,?,?,?,?,NULL)')
        ->execute([$id, $name, $email, password_hash($pw, PASSWORD_DEFAULT), $role, trim((string)($b['villa'] ?? '')) ?: null,
                   array_key_exists('active', $b) ? (int)!!$b['active'] : 1]);
    json_out(['user' => get_user($id)], 201);
  }

  // Edit a user: name, email, role, room, active, and optionally a new password
  if ($method === 'PATCH' && count($seg) === 2 && $seg[0] === 'users') {
    require_right($me, 'manage_users');
    $id = $seg[1];
    $st = db()->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([$id]);
    $cur = $st->fetch();
    if (!$cur) fail('User not found.', 404);
    $b = body();
    $name   = array_key_exists('name', $b)   ? trim((string)$b['name']) : $cur['name'];
    $email  = array_key_exists('email', $b)  ? strtolower(trim((string)$b['email'])) : $cur['email'];
    $role   = array_key_exists('role', $b)   ? (string)$b['role'] : $cur['role'];
    $villa  = array_key_exists('villa', $b)  ? (trim((string)$b['villa']) ?: null) : ($cur['villa'] ?? null);
    $active = array_key_exists('active', $b) ? (int)!!$b['active'] : (int)$cur['active'];
    $pw     = (string)($b['password'] ?? '');

    if ($name === '') fail('Full name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
    if (!role_exists($role)) fail('Choose a role.');
    if ($pw !== '' && strlen($pw) < 6) fail('Password must be at least 6 characters.');
    $dup = db()->prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?');
    $dup->execute([$email, $id]);
    if ($dup->fetch()) fail('A user with that email already exists.');

    // Never lock everyone out: you can't disable yourself, and an active user
    // who can manage users must remain.
    if ($id === $me['id'] && !$active) fail("You can't disable your own account.");
    $wasManager = (int)$cur['active'] === 1 && in_array('manage_users', role_rights($cur['role']), true);
    $isManager  = $active === 1 && in_array('manage_users', role_rights($role), true);
    if ($wasManager && !$isManager && !other_user_manager_exists($id)) {
      fail('Keep at least one active user who can manage users, such as an Administrator.');
    }

    db()->prepare('UPDATE users SET name = ?, email = ?, role = ?, villa = ?, active = ? WHERE id = ?')
        ->execute([$name, $email, $role, $villa, $active, $id]);
    if ($pw !== '') {
      db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $id]);
    }
    if (!$active) db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);   // sign a disabled user out
    json_out(['user' => get_user($id)]);
  }

  // ---------- Roles ----------
  if ($method === 'POST' && $path === 'roles') {
    require_right($me, 'manage_users');
    $b = body();
    $id = gen_id('r');
    $name = trim($b['name'] ?? '') ?: 'New role';
    db()->prepare('INSERT INTO roles (id, name, `system`, rights) VALUES (?,?,0,?)')->execute([$id, $name, json_encode([])]);
    json_out(['role' => ['id' => $id, 'name' => $name, 'system' => false, 'rights' => []]], 201);
  }

  if ($method === 'PATCH' && count($seg) === 2 && $seg[0] === 'roles') {
    require_right($me, 'manage_users');
    $b = body();
    $rights = is_array($b['rights'] ?? null) ? array_values($b['rights']) : [];
    db()->prepare('UPDATE roles SET rights = ? WHERE id = ?')->execute([json_encode($rights), $seg[1]]);
    json_out(['ok' => true]);
  }

  // ---------- Invoice settings ----------
  if ($method === 'PUT' && $path === 'invoice') {
    require_right($me, 'edit_invoice');
    $b = body();
    $cur = db()->query('SELECT * FROM invoice_settings WHERE id = 1')->fetch();
    $prefix  = $b['prefix']  ?? $cur['prefix'];
    $next    = isset($b['next'])    ? (int)$b['next']    : (int)$cur['next'];
    $padding = isset($b['padding']) ? (int)$b['padding'] : (int)$cur['padding'];
    $terms   = $b['terms']   ?? $cur['terms'];
    // "Show on invoice" options: only touched when sent, so the other settings save without them
    $withShow = array_key_exists('showPayments', $b) || array_key_exists('showB2b', $b);
    $show = [];
    foreach (['showPayments' => 'show_payments', 'showB2b' => 'show_b2b'] as $key => $col) {
      if (array_key_exists($key, $b) && !is_bool($b[$key])) fail('Invalid invoice option.');
      $show[$col] = array_key_exists($key, $b) ? (int)$b[$key] : (int)($cur[$col] ?? 0);
    }
    if ($withShow) {
      db()->prepare('UPDATE invoice_settings SET prefix=?, next=?, padding=?, terms=?, show_payments=?, show_b2b=? WHERE id=1')
          ->execute([$prefix, $next, $padding, $terms, $show['show_payments'], $show['show_b2b']]);
    } else {
      db()->prepare('UPDATE invoice_settings SET prefix=?, next=?, padding=?, terms=? WHERE id=1')
          ->execute([$prefix, $next, $padding, $terms]);
    }
    json_out(['invoice' => public_invoice(db()->query('SELECT * FROM invoice_settings WHERE id = 1')->fetch())]);
  }

  // ---------- Room overrides (base rate / notes / capacity) ----------
  //  Only the fields sent are changed; the others keep their saved value.
  //  Capacity is only for rooms that allow it (CAPACITY_ROOMS) and only touches
  //  its columns when sent, so base rate / notes saves never depend on them.
  //  Replies with the saved override, so the app shows what was really stored.
  if ($method === 'PUT' && count($seg) === 3 && $seg[0] === 'rooms' && $seg[2] === 'override') {
    require_right($me, 'edit_villas');
    $name = urldecode($seg[1]);
    $b = body();
    // An unreadable body comes back empty; don't treat that as "keep everything".
    if (!array_intersect(['baseRate', 'notes', 'minGuests', 'maxGuests'], array_keys($b))) fail('Nothing to save.');
    $load = function () use ($name) {
      $st = db()->prepare('SELECT * FROM room_overrides WHERE villa = ?');
      $st->execute([$name]);
      return $st->fetch() ?: [];
    };
    $cur = $load();
    // A whole number from the body, or the saved value when the field isn't sent.
    $num = function (string $key, string $col) use ($b, $cur) {
      if (!array_key_exists($key, $b)) return isset($cur[$col]) ? (int)$cur[$col] : null;
      $v = $b[$key];
      if ($v === null || $v === '') return null;
      if (is_int($v)) return $v;
      if (is_string($v) && preg_match('/^-?\d{1,9}$/', $v)) return (int)$v;
      if (is_float($v) && is_finite($v) && floor($v) === $v && abs($v) < 1e9) return (int)$v;
      fail('Enter whole numbers only.');
    };
    $rate  = $num('baseRate', 'base_rate');
    $notes = array_key_exists('notes', $b) ? $b['notes'] : ($cur['notes'] ?? null);
    if ($notes !== null && !is_string($notes)) fail('Notes must be text.');
    if ($rate !== null && ($rate < 0 || $rate > 10000000)) fail('Enter a base rate between ₹0 and ₹1,00,00,000.');

    $withCapacity = array_key_exists('minGuests', $b) || array_key_exists('maxGuests', $b);
    if (!$withCapacity) {
      db()->prepare('INSERT INTO room_overrides (villa, base_rate, notes) VALUES (?,?,?)
                     ON DUPLICATE KEY UPDATE base_rate = VALUES(base_rate), notes = VALUES(notes)')
          ->execute([$name, $rate, $notes]);
      json_out(['ok' => true, 'override' => public_override($load())]);
    }
    if (!in_array($name, CAPACITY_ROOMS, true)) fail("This room's capacity can't be changed.");
    $min = $num('minGuests', 'min_guests');
    $max = $num('maxGuests', 'max_guests');
    if (($min === null) !== ($max === null)) fail('Enter both the minimum and maximum guests.');
    if ($min !== null && ($min < 1 || $min > 10000 || $max < 1 || $max > 10000)) {
      fail('Capacity must be between 1 and 10,000 guests.');
    }
    if ($min !== null && $min > $max) fail('Minimum guests can\'t be more than maximum guests.');
    db()->prepare('INSERT INTO room_overrides (villa, base_rate, notes, min_guests, max_guests) VALUES (?,?,?,?,?)
                   ON DUPLICATE KEY UPDATE base_rate = VALUES(base_rate), notes = VALUES(notes),
                                           min_guests = VALUES(min_guests), max_guests = VALUES(max_guests)')
        ->execute([$name, $rate, $notes, $min, $max]);
    json_out(['ok' => true, 'override' => public_override($load())]);
  }

  fail("Not found: $method /$path", 404);
} catch (Throwable $e) {
  fail('Server error: ' . $e->getMessage(), 500);
}
