#!/bin/bash
# Runs Resoria locally on macOS (or Linux), like start-resoria.cmd on Windows:
# its own MySQL (port 3317, data in .localrun/mysql-data) and PHP's built-in
# server with .localrun/router.php: website at /, admin at /admin/, API at /api/.
#
# The first run sets everything up: builds the admin and the website, creates
# the database, api/config.php and the admin login (admin@resoria.co with the
# demo password from source/server/install.php). Later runs only start the
# servers. Ctrl+C stops both.
#
#   ./start-resoria.sh             start on port 8090, or the next free one
#   ./start-resoria.sh --build     rebuild the admin and the website first
#   PORT=8095 ./start-resoria.sh   use this port
#   NO_OPEN=1 ./start-resoria.sh   don't open the browser
#
# Needs Node.js, PHP 8.1+ with pdo_mysql, and MySQL 8+.
# Homebrew: brew install node php mysql
set -euo pipefail

cd "$(dirname "$0")"
ROOT=$PWD
RUN=$ROOT/.localrun
DATA=$RUN/mysql-data
DB_PORT=3317
# Unix socket paths are capped at ~104 characters, so keep it short
SOCK=/tmp/resoria-mysql-$DB_PORT.sock
BUILD=0
[ "${1:-}" = "--build" ] && BUILD=1

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }
# --no-defaults: ignore ~/.my.cnf and Homebrew's my.cnf, which belong to your main MySQL
sql() { mysql --no-defaults -h127.0.0.1 -P$DB_PORT -uroot "$@"; }
db_up() { mysqladmin --no-defaults -h127.0.0.1 -P$DB_PORT -uroot ping >/dev/null 2>&1; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
npm_deps() { [ -d node_modules ] || npm ci --no-audit --no-fund; }

for t in node npm php mysqld mysql mysqladmin lsof openssl; do
  command -v $t >/dev/null || fail "$t is not on the PATH (Homebrew: brew install node php mysql)"
done
# No grep -q here: it exits on the first match, php gets SIGPIPE and pipefail trips
php -m | grep -ix pdo_mysql >/dev/null || fail "PHP has no pdo_mysql extension"

# ---- Pick the web port before starting anything
if [ -n "${PORT:-}" ]; then
  port_busy "$PORT" && fail "port $PORT is already in use"
else
  PORT=8090
  while port_busy $PORT; do
    PORT=$((PORT + 1))
    [ $PORT -le 8099 ] || fail "ports 8090-8099 are all in use; set PORT=..."
  done
fi

# ---- Builds: the admin into admin/, the website into site/
if [ $BUILD = 1 ] || [ ! -f admin/index.html ]; then
  say "Building the admin -> admin/"
  (cd source && npm_deps && npm run build)
fi
if [ $BUILD = 1 ] || [ ! -f site/index.html ]; then
  say "Building the website -> site/"
  (cd source/website && npm_deps && npm run build)
  rm -rf site
  cp -R source/website/out site
fi

# ---- MySQL: create the data folder once, then start it unless it's already up
mkdir -p "$DATA"
if [ -z "$(ls -A "$DATA")" ]; then
  say "Creating the local MySQL data folder (.localrun/mysql-data)"
  mysqld --no-defaults --initialize-insecure --datadir="$DATA" --log-error="$RUN/mysql.err" \
    || fail "MySQL could not create its data folder; see .localrun/mysql.err"
fi

STARTED_DB=0
stop() {
  if [ $STARTED_DB = 1 ]; then
    say "Stopping MySQL"
    mysqladmin --no-defaults -h127.0.0.1 -P$DB_PORT -uroot shutdown >/dev/null 2>&1 || true
  fi
}
trap stop EXIT
trap 'exit 130' INT TERM

if db_up; then
  say "MySQL already running on port $DB_PORT"
else
  port_busy $DB_PORT && fail "port $DB_PORT is in use by something that isn't this MySQL"
  say "Starting MySQL on port $DB_PORT"
  mysqld --no-defaults --datadir="$DATA" --port=$DB_PORT --mysqlx=OFF --bind-address=127.0.0.1 \
    --socket="$SOCK" --pid-file="$RUN/mysql.pid" --log-error="$RUN/mysql.err" &
  STARTED_DB=1
  for _ in $(seq 1 60); do db_up && break; sleep 0.5; done
  db_up || fail "MySQL did not start; see .localrun/mysql.err"
fi

# ---- First run: database, app user, api/config.php, tables and the admin login
if [ ! -f api/config.php ]; then
  say "Creating the database, api/config.php and the admin login"
  PW=$(openssl rand -hex 16)
  sql -e "CREATE DATABASE IF NOT EXISTS resoria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS 'resoria_app'@'127.0.0.1' IDENTIFIED BY '$PW';
    ALTER USER 'resoria_app'@'127.0.0.1' IDENTIFIED BY '$PW';
    GRANT ALL ON resoria.* TO 'resoria_app'@'127.0.0.1';"
  sed -e "s|^const DB_HOST = .*|const DB_HOST = '127.0.0.1;port=$DB_PORT';|" \
      -e "s|__SET_DB_PASSWORD__|$PW|" \
      -e "s|^const ENQUIRY_LOG_ONLY = .*|const ENQUIRY_LOG_ONLY = true;|" \
      source/server/config.example.php > api/config.php
  grep -q "$PW" api/config.php || { rm -f api/config.php; fail "could not fill in api/config.php"; }
  cp source/server/install.php api/install.php
  if ! (cd api && php install.php); then
    rm -f api/install.php api/config.php
    fail "the installer failed (see above)"
  fi
  rm -f api/install.php
fi

# ---- Web server (runs until Ctrl+C)
say "Resoria is running
   Website  http://localhost:$PORT/
   Admin    http://localhost:$PORT/admin/
   API      http://localhost:$PORT/api/
   Ctrl+C stops it"
if [ -z "${NO_OPEN:-}" ]; then
  (sleep 1; open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" 2>/dev/null || true) &
fi
php -S localhost:$PORT -t "$ROOT" "$RUN/router.php"
