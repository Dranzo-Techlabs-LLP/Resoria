<?php
// Local run of C:\Resoria the way the .htaccess files route it on the server:
//   .localrun\php\php.exe -S localhost:8090 -t . .localrun\router.php
//   /api/*   -> api/index.php
//   /admin/* -> admin files, otherwise the admin SPA (admin/index.html)
//   /*       -> the website (site/, the static export of source/website)
declare(strict_types=1);

$root = realpath(__DIR__ . '/..');
$site = $root . DIRECTORY_SEPARATOR . 'site';
$uri = rawurldecode((string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'));

function send_file(string $file, int $status = 200): bool {
  static $types = [
    'html' => 'text/html; charset=utf-8', 'css' => 'text/css', 'js' => 'text/javascript',
    'json' => 'application/json', 'txt' => 'text/plain', 'png' => 'image/png', 'jpg' => 'image/jpeg',
    'svg' => 'image/svg+xml', 'ico' => 'image/x-icon', 'woff2' => 'font/woff2',
  ];
  http_response_code($status);
  header('Content-Type: ' . ($types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
  readfile($file);
  return true;
}

// Resolve a URL path inside $base without letting "../" climb out of it.
function inside(string $base, string $uri): ?string {
  $p = realpath($base . str_replace('/', DIRECTORY_SEPARATOR, $uri));
  return ($p !== false && str_starts_with($p, $base)) ? $p : null;
}

if (preg_match('#^/api(/|$)#', $uri)) {
  if (!isset($_SERVER['HTTP_AUTHORIZATION']) && function_exists('getallheaders')) {
    foreach (getallheaders() as $k => $v) {
      if (strtolower($k) === 'authorization') $_SERVER['HTTP_AUTHORIZATION'] = $v;
    }
  }
  chdir($root . '/api');
  require $root . '/api/index.php';
  return true;
}

if ($uri === '/admin') {
  header('Location: /admin/', true, 301);
  return true;
}

if (str_starts_with($uri, '/admin/')) {
  $p = inside($root . DIRECTORY_SEPARATOR . 'admin', substr($uri, 6));
  if ($p !== null && is_file($p)) return send_file($p);
  return send_file($root . '/admin/index.html');
}

// Website: real files, directory index, name.html, otherwise the 404 page
$p = inside($site, $uri);
if ($p !== null && is_file($p)) return send_file($p);
if ($p !== null && is_dir($p) && is_file($p . DIRECTORY_SEPARATOR . 'index.html')) return send_file($p . DIRECTORY_SEPARATOR . 'index.html');
$page = inside($site, rtrim($uri, '/') . '.html');
if ($page !== null && is_file($page)) return send_file($page);
return send_file($site . '/404.html', 404);
