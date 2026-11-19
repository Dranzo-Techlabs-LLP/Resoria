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

  // ---------- Public: guest feedback link (the website's /feedback page) ----------
  if (count($seg) === 2 && $seg[0] === 'feedback' && in_array($method, ['GET', 'POST'], true)) {
    $token = $seg[1];
    if (!preg_match('/^[a-f0-9]{24,40}$/', $token)) fail('This feedback link is not valid.', 404);
    $st = db()->prepare("SELECT * FROM bookings WHERE feedback_token = ? AND status <> 'cancelled'");
    $st->execute([$token]);
    $bk = $st->fetch();
    if (!$bk) fail('This feedback link is not valid.', 404);
    $done = db()->prepare("SELECT 1 FROM ratings WHERE booking_ref = ? AND source = 'Guest feedback link'");
    $done->execute([$bk['ref']]);
    $submitted = (bool)$done->fetch();
    if ($method === 'GET') {
      json_out(['guest' => preg_split('/\s+/', trim($bk['guest']))[0], 'rooms' => $bk['villa'],
                'checkIn' => $bk['check_in'], 'checkOut' => $bk['check_out'], 'submitted' => $submitted]);
    }
    if ($submitted) fail('Thank you, we already have your feedback for this stay.', 409);
    $b = body();
    if (trim((string)($b['website'] ?? '')) !== '') json_out(['ok' => true]); // bots
    $overall = stars($b['overall'] ?? null, 'overall rating');
    $comment = mb_substr(trim((string)($b['comment'] ?? '')), 0, 3000);
    $t = now_dt();
    db()->prepare('INSERT INTO ratings (id, booking_ref, guest, overall, aspects, comment, source, date, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([gen_id('g'), $bk['ref'], $bk['guest'], $overall, json_encode(clean_aspects($b['aspects'] ?? [])), $comment ?: null,
                   'Guest feedback link', date('Y-m-d'), $t]);
    add_event($bk['ref'], "Guest rated the stay {$overall}★ (feedback link)", $t);
    json_out(['ok' => true], 201);
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
    assert_room_names($f['villa']);
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
    // Bookings made before a room-list change keep their old room name until it is changed here
    if ($f['villa'] !== $cur['villa']) assert_room_names($f['villa']);
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
    // In-house and completed stays are kept for the record (and their bills); only bookings
    // that haven't started, or were cancelled, can be removed.
    if ($cur['status'] === 'checked in') fail("An in-house booking can't be removed. Check the guest out first.");
    if ($cur['status'] === 'completed') fail("Completed bookings are kept for the record and can't be removed.");
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
    if (date('Y-m-d') < $cur['check_in']) {
      fail('This stay starts on ' . date('j M Y', strtotime($cur['check_in'])) . '. If the guest has arrived early, change the check-in date first.');
    }
    // An enquiry never held its rooms, so make sure nobody else has them before the guest moves in
    if ($cur['status'] === 'enquiry') assert_rooms_free($cur['villa'], $cur['check_in'], $cur['check_out'], $cur['ref']);
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
      $max = refundable($cur);
      if ($amount > $max) fail('The refund cannot be more than the ' . inr(max(0, $max)) . ' still refundable.');
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
      if ($row['kind'] === 'payment' && refundable(booking_row($row['booking_ref']), $row['id']) < 0) {
        fail('Refunds already paid on this booking come to more than the payments left without this one. Remove the refund first.');
      }
      db()->prepare('DELETE FROM payments WHERE id = ?')->execute([$seg[1]]);
      add_event($row['booking_ref'], 'Payment entry of ' . inr((int)$row['amount']) . ' removed');
    } else {
      $b = body();
      $kind = ($b['kind'] ?? 'payment') === 'refund' ? 'refund' : 'payment';
      $amount = (int)round((float)($b['amount'] ?? 0));
      if ($amount <= 0) fail('Enter an amount greater than ₹0.');
      $left = refundable(booking_row($row['booking_ref']), $row['id']); // with this line left out
      if ($kind === 'refund' && $amount > $left) fail('The refund cannot be more than the ' . inr(max(0, $left)) . ' still refundable.');
      if ($kind === 'payment' && $left + $amount < 0) fail('Refunds already paid come to more than this; the payment must be at least ' . inr(-$left) . '.');
      db()->prepare('UPDATE payments SET date = ?, amount = ?, kind = ?, method = ?, reference = ?, is_advance = ? WHERE id = ?')
          ->execute([valid_date($b['date'] ?? date('Y-m-d')), $amount, $kind,
                     $methodOf($b['method'] ?? '') ?: null, mb_substr(trim((string)($b['reference'] ?? '')), 0, 120) ?: null,
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
    if ($dup->fetch()) fail("“{$name}” ({$unit}) already exists.");
    return ['name' => $name, 'category' => $cat, 'unit' => $unit, 'min_stock' => f2($min),
            'active' => array_key_exists('active', $b) ? (int)!!$b['active'] : (int)($cur['active'] ?? 1),
            'reusable' => array_key_exists('reusable', $b) ? (int)!!$b['reusable'] : (int)($cur['reusable'] ?? 0)];
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
    $pdo->prepare('INSERT INTO inventory_items (id, name, category, unit, min_stock, opening_stock, active, reusable, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $f['name'], $f['category'], $f['unit'], $f['min_stock'], f2($open), $f['active'], $f['reusable'], now_dt()]);
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
    if (!$f['reusable'] && (int)($cur['reusable'] ?? 0) === 1 && lock_item($cur['id'])['in_use'] > 0) {
      fail('Some of this item is still issued. Return it before marking the item as not reusable.');
    }
    db()->prepare('UPDATE inventory_items SET name = ?, category = ?, unit = ?, min_stock = ?, active = ?, reusable = ? WHERE id = ?')
        ->execute([$f['name'], $f['category'], $f['unit'], $f['min_stock'], $f['active'], $f['reusable'], $cur['id']]);
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
      // Reusable items (linen) are issued, and come back with a return
      add_movement($item, $ref, (int)($item['reusable'] ?? 0) === 1 ? 'issue' : 'out', $qty, ['date' => $date, 'department' => $dept, 'note' => $note]);
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
  // Date, category and amount are checked here so a bad entry is a clear message, not a database error
  $expenseCheck = function (array $row): array {
    $row['date'] = valid_date($row['date']);
    $row['category'] = mb_substr(trim((string)$row['category']), 0, 60);
    if ($row['category'] === '') fail('Choose a category.');
    $row['villa'] = mb_substr(trim((string)$row['villa']), 0, 255);
    $row['description'] = mb_substr(trim((string)$row['description']), 0, 255);
    if ($row['amount'] <= 0 || $row['amount'] > 100000000) fail('Enter an amount greater than ₹0.');
    return $row;
  };
  // Expenses booked by a stock purchase follow that purchase (its payments update them)
  $expenseRow = function (string $id): array {
    $st = db()->prepare('SELECT * FROM expenses WHERE id = ?');
    $st->execute([$id]);
    $cur = $st->fetch() ?: fail('Expense not found.', 404);
    if (!empty($cur['source_ref'])) fail("This expense was created by inventory purchase {$cur['source_ref']}, so it can't be changed or removed here.");
    return $cur;
  };

  if ($method === 'POST' && $path === 'expenses') {
    require_right($me, 'edit_expenses');
    $b = body();
    $id = gen_id('e');
    $row = [
      'id' => $id, 'date' => $b['date'] ?? date('Y-m-d'), 'category' => $b['category'] ?? 'Misc',
      'villa' => $b['villa'] ?? '', 'bookingRef' => ($b['bookingRef'] ?? '') ?: null,
      'description' => $b['description'] ?? '', 'amount' => (int)round((float)($b['amount'] ?? 0)),
    ];
    $row = normalize_expense_link($expenseCheck($row));
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
    $cur = $expenseRow($seg[1]);
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
    $row = normalize_expense_link($expenseCheck($row));
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
    $cur = $expenseRow($seg[1]);
    db()->prepare('DELETE FROM expenses WHERE id = ?')->execute([$cur['id']]);
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
    $name = mb_substr(trim((string)($b['name'] ?? '')), 0, 60) ?: 'New role';
    if (role_exists($name)) fail("A role called “{$name}” already exists.");
    db()->prepare('INSERT INTO roles (id, name, `system`, rights) VALUES (?,?,0,?)')->execute([$id, $name, json_encode([])]);
    json_out(['role' => ['id' => $id, 'name' => $name, 'system' => false, 'rights' => []]], 201);
  }

  if ($method === 'PATCH' && count($seg) === 2 && $seg[0] === 'roles') {
    require_right($me, 'manage_users');
    $st = db()->prepare('SELECT * FROM roles WHERE id = ?');
    $st->execute([$seg[1]]);
    $role = $st->fetch() ?: fail('Role not found.', 404);
    $b = body();
    if (!is_array($b['rights'] ?? null)) fail('Send the rights as a list.');
    $rights = array_values(array_unique(array_map('strval', $b['rights'])));
    $unknown = array_diff($rights, ALL_RIGHTS);
    if ($unknown) fail('Unknown right: ' . implode(', ', $unknown) . '.');
    // Never lock everyone out: some active user must still be able to manage users afterwards
    if (!in_array('manage_users', $rights, true)) {
      $others = db()->prepare('SELECT role FROM users WHERE active = 1 AND role <> ?');
      $others->execute([$role['name']]);
      $still = false;
      foreach ($others->fetchAll() as $u) {
        if (in_array('manage_users', role_rights($u['role']), true)) { $still = true; break; }
      }
      if (!$still) fail("Without “Add / edit users & rights” on {$role['name']}, no active user could manage users. Give that right to another active user's role first.");
    }
    db()->prepare('UPDATE roles SET rights = ? WHERE id = ?')->execute([json_encode($rights), $role['id']]);
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
    if (!is_string($prefix) || !preg_match('/^[A-Za-z0-9\/-]{0,12}$/', $prefix)) fail('Use up to 12 letters, digits, - or / for the prefix.');
    if ($padding < 1 || $padding > 10) fail('Digits must be between 1 and 10.');
    if ($next < 1 || $next > 999999999) fail('Enter a next number of 1 or more.');
    if (!is_string($terms) || mb_strlen($terms) > 20000) fail('The terms are too long.');
    // The series must never hand out a number a booking already has
    $used = db()->prepare('SELECT ref FROM bookings WHERE ref LIKE ?');
    $used->execute([str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $prefix) . '%']);
    $max = 0;
    foreach ($used->fetchAll() as $r) {
      $rest = substr($r['ref'], strlen($prefix));
      if ($rest !== '' && ctype_digit($rest)) $max = max($max, (int)$rest);
    }
    if ($next <= $max) fail('Booking numbers up to ' . $prefix . str_pad((string)$max, $padding, '0', STR_PAD_LEFT) . ' are already used. Set the next number to ' . ($max + 1) . ' or more.');
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

  // Return issued reusable items: good ones back to store, damaged / lost written off
  if ($method === 'POST' && $path === 'inventory/returns') {
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
    $ref = 'RET-' . str_pad((string)next_number('RET'), 5, '0', STR_PAD_LEFT);
    foreach ($lines as $l) {
      $item = lock_item((string)($l['itemId'] ?? ''));
      if ((int)($item['reusable'] ?? 0) !== 1) fail("“{$item['name']}” is not a reusable item.");
      $ret = $l['returned'] ?? 0;
      $dmg = $l['damaged'] ?? 0;
      if (!is_numeric($ret) || !is_numeric($dmg) || (float)$ret < 0 || (float)$dmg < 0) fail('Quantities cannot be negative.');
      $ret = f2($ret);
      $dmg = f2($dmg);
      if ($ret + $dmg <= 0) fail("Enter what came back for “{$item['name']}”.");
      if ($ret + $dmg > $item['in_use']) fail("Only {$item['in_use']} {$item['unit']} of “{$item['name']}” is issued.");
      if ($ret > 0) {
        add_movement($item, $ref, 'return', $ret, ['date' => $date, 'department' => $dept, 'note' => $note]);
        $item = lock_item($item['id']);
      }
      if ($dmg > 0) add_movement($item, $ref, 'writeoff', $dmg, ['date' => $date, 'department' => $dept, 'note' => $note ?? 'Damaged / lost']);
    }
    $pdo->commit();
    json_out(['inventory' => inventory_payload(), 'ref' => $ref], 201);
  }

  // Pay a supplier later for an unpaid / partially paid purchase
  if ($method === 'POST' && count($seg) === 4 && $seg[0] === 'inventory' && $seg[1] === 'purchases' && $seg[3] === 'payments') {
    require_right($me, 'edit_inventory');
    $b = body();
    $amount = (int)round((float)($b['amount'] ?? 0));
    $date = valid_date($b['date'] ?? date('Y-m-d'));
    $m = $methodOf($b['method'] ?? '');
    if ($m === '') fail('Choose the payment method.');
    $pdo = db();
    $pdo->beginTransaction();
    $st = $pdo->prepare('SELECT * FROM stock_purchases WHERE ref = ? FOR UPDATE');
    $st->execute([$seg[2]]);
    $p = $st->fetch() ?: fail('Purchase not found.', 404);
    $due = (int)$p['total'] - (int)$p['paid_amount'];
    if ($due <= 0) fail('This purchase is already fully paid.');
    if ($date < $p['date']) fail('The payment date can’t be before the purchase date.');
    if ($amount <= 0 || $amount > $due) fail('Enter an amount between ₹1 and the ' . inr($due) . ' due.');
    $paid = (int)$p['paid_amount'] + $amount;
    $status = $paid >= (int)$p['total'] ? 'Paid' : 'Partially Paid';
    $pdo->prepare('UPDATE stock_purchases SET paid_amount = ?, payment_status = ? WHERE ref = ?')->execute([$paid, $status, $p['ref']]);
    $pdo->prepare('INSERT INTO purchase_payments (id, ref, date, amount, method, created_at) VALUES (?,?,?,?,?,?)')
        ->execute([gen_id('q'), $p['ref'], $date, $amount, $m, now_dt()]);
    if ($p['expense_id']) {
      // keep the linked expense's note in step with the payment status
      $pdo->prepare("UPDATE expenses SET description = REPLACE(REPLACE(description, ' (Unpaid)', ?), ' (Partially Paid)', ?) WHERE id = ?")
          ->execute([$status === 'Paid' ? '' : ' (Partially Paid)', $status === 'Paid' ? '' : ' (Partially Paid)', $p['expense_id']]);
    }
    $pdo->commit();
    json_out(['inventory' => inventory_payload()], 201);
  }

  // ---------- Guest ratings ----------
  $ratingInput = function (array $b, ?array $cur = null): array {
    $pick = fn(string $k, string $col, $def = null) => array_key_exists($k, $b) ? $b[$k] : ($cur[$col] ?? $def);
    $guest = mb_substr(trim((string)$pick('guest', 'guest', '')), 0, 160);
    if ($guest === '') fail('Guest name is required.');
    $source = mb_substr(trim((string)$pick('source', 'source', '')), 0, 40);
    if ($source === '') fail('Choose where the rating came from.');
    $ref = trim((string)$pick('bookingRef', 'booking_ref', '')) ?: null;
    if ($ref !== null) $ref = booking_row($ref)['ref'];
    return [
      'booking_ref' => $ref, 'guest' => $guest, 'overall' => stars($pick('overall', 'overall'), 'overall rating'),
      'aspects' => json_encode(array_key_exists('aspects', $b) ? clean_aspects($b['aspects']) : (json_decode($cur['aspects'] ?? '{}', true) ?: [])),
      'comment' => (mb_substr(trim((string)$pick('comment', 'comment', '')), 0, 3000) ?: null),
      'source' => $source, 'date' => valid_date($pick('date', 'date', date('Y-m-d'))),
    ];
  };

  if ($method === 'POST' && $path === 'ratings') {
    require_right($me, 'manage_ratings');
    $b = body();
    $f = $ratingInput($b);
    $id = gen_id('g');
    $resp = mb_substr(trim((string)($b['response'] ?? '')), 0, 3000) ?: null;
    db()->prepare('INSERT INTO ratings (id, booking_ref, guest, overall, aspects, comment, source, date, created_at, response, responded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $f['booking_ref'], $f['guest'], $f['overall'], $f['aspects'], $f['comment'], $f['source'], $f['date'], now_dt(), $resp, $resp ? now_dt() : null]);
    if ($f['booking_ref']) add_event($f['booking_ref'], "Guest rating {$f['overall']}★ recorded ({$f['source']})");
    json_out(['rating' => get_rating($id)], 201);
  }

  if (($method === 'PUT' || $method === 'DELETE') && count($seg) === 2 && $seg[0] === 'ratings') {
    require_right($me, 'manage_ratings');
    $st = db()->prepare('SELECT * FROM ratings WHERE id = ?');
    $st->execute([$seg[1]]);
    $cur = $st->fetch() ?: fail('Rating not found.', 404);
    if ($method === 'DELETE') {
      db()->prepare('DELETE FROM ratings WHERE id = ?')->execute([$cur['id']]);
      json_out(['ok' => true]);
    }
    $b = body();
    // A guest's own feedback can be replied to, but its scores and words stay as the guest gave them
    $f = $cur['source'] === 'Guest feedback link' ? null : $ratingInput($b, $cur);
    if ($f) {
      db()->prepare('UPDATE ratings SET booking_ref = ?, guest = ?, overall = ?, aspects = ?, comment = ?, source = ?, date = ? WHERE id = ?')
          ->execute([$f['booking_ref'], $f['guest'], $f['overall'], $f['aspects'], $f['comment'], $f['source'], $f['date'], $cur['id']]);
    }
    if (array_key_exists('response', $b)) {
      $resp = mb_substr(trim((string)$b['response']), 0, 3000) ?: null;
      db()->prepare('UPDATE ratings SET response = ?, responded_at = ? WHERE id = ?')->execute([$resp, $resp ? now_dt() : null, $cur['id']]);
    }
    json_out(['rating' => get_rating($cur['id'])]);
  }

  if ($method === 'POST' && count($seg) === 3 && $seg[0] === 'bookings' && $seg[2] === 'feedback-link') {
    require_right($me, 'manage_ratings');
    $cur = booking_row($seg[1]);
    if (!in_array($cur['status'], ['checked in', 'completed'], true)) fail('Feedback links are for in-house and completed stays.');
    $token = $cur['feedback_token'] ?? '';
    if (!$token) {
      $token = bin2hex(random_bytes(12));
      db()->prepare('UPDATE bookings SET feedback_token = ? WHERE ref = ?')->execute([$token, $cur['ref']]);
      add_event($cur['ref'], 'Guest feedback link created');
    }
    json_out(['token' => $token, 'booking' => get_booking($cur['ref'])]);
  }

  // ---------- Rooms from the older room list ----------
  if ($method === 'POST' && $path === 'rooms/rename') {
    if (!in_array('manage_config', role_rights($me['role']), true)) require_right($me, 'edit_villas');
    $b = body();
    $from = trim((string)($b['from'] ?? ''));
    $to = trim((string)($b['to'] ?? ''));
    if ($from === '' || in_array($from, CAPACITY_ROOMS, true) || $from === 'Full Property') fail('Choose a room from the older room list.');
    if (!in_array($to, CAPACITY_ROOMS, true)) fail('Choose one of the current rooms.');
    $pdo = db();
    $pdo->beginTransaction();
    $n = 0;
    $st = $pdo->query('SELECT ref, villa, status, check_in, check_out FROM bookings ORDER BY check_in ASC');
    $upd = $pdo->prepare('UPDATE bookings SET villa = ? WHERE ref = ?');
    $clash = $pdo->prepare("SELECT ref, guest, villa FROM bookings WHERE status <> 'cancelled' AND check_in < ? AND check_out > ? AND ref <> ?");
    foreach ($st->fetchAll() as $bk) {
      if (!in_array($from, array_map('trim', explode(',', $bk['villa'])), true)) continue;
      if ($bk['status'] !== 'cancelled') {
        // Never create a double booking: the new room must be free for this stay
        $clash->execute([$bk['check_out'], $bk['check_in'], $bk['ref']]);
        foreach ($clash->fetchAll() as $o) {
          if (in_array($to, villa_rooms($o['villa']), true)) {
            fail("Can't move $from to $to: {$bk['ref']} ({$bk['check_in']} to {$bk['check_out']}) would clash with {$o['ref']} ({$o['guest']}) in $to. Give one of them another room first, or pick a different room.", 409);
          }
        }
      }
      $upd->execute([swap_room($bk['villa'], $from, $to), $bk['ref']]);
      add_event($bk['ref'], "Room $from moved to $to (room list update)");
      $n++;
    }
    foreach (['expenses' => 'id', 'users' => 'id'] as $table => $key) {
      $rows = $pdo->query("SELECT $key, villa FROM $table WHERE villa IS NOT NULL AND villa <> ''")->fetchAll();
      $u = $pdo->prepare("UPDATE $table SET villa = ? WHERE $key = ?");
      foreach ($rows as $r) {
        if (in_array($from, array_map('trim', explode(',', $r['villa'])), true)) $u->execute([swap_room($r['villa'], $from, $to), $r[$key]]);
      }
    }
    $has = $pdo->prepare('SELECT 1 FROM room_overrides WHERE villa = ?');
    $has->execute([$to]);
    if ($has->fetch()) $pdo->prepare('DELETE FROM room_overrides WHERE villa = ?')->execute([$from]);
    else $pdo->prepare('UPDATE room_overrides SET villa = ? WHERE villa = ?')->execute([$to, $from]);
    $pdo->commit();
    json_out(['ok' => true, 'bookings' => $n]);
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
