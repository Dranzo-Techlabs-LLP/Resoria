#!/bin/bash
# Deploys the newest resoria-deploy-*.zip into /home/resoriaevora/public_html.
# Run as root in the WHM terminal:  bash /root/deploy-resoria.sh
#
# First run:  database + user, api/config.php, tables and the admin login.
# Later runs: the files only; config.php and the data are left as they are.
# Every run backs up public_html first. Safe to run again after a failure.
set -euo pipefail

U=resoriaevora
H=/home/$U
WEB=$H/public_html
say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

[ -f /var/cpanel/userdata/$U/main ] || fail "no cPanel account called $U on this server"
DOMAIN=${DOMAIN:-$(awk '/^main_domain:/{print $2}' /var/cpanel/userdata/$U/main)}
IP=$(awk '/^ip:/{print $2}' /var/cpanel/userdata/$U/main)
PHP=$(command -v php) || fail "php is not on the PATH"
uapi_ok() {
  local out
  out=$(uapi --user=$U "$@") || true
  grep -q 'status: 1' <<<"$out" || { echo "$out"; fail "uapi $1 $2 did not succeed"; }
}

# ---- The package: in Home, or in public_html (moved out: it would be downloadable there)
ZIP=$(ls -t $H/resoria-deploy-*.zip $WEB/resoria-deploy-*.zip 2>/dev/null | head -1 || true)
[ -n "$ZIP" ] || fail "no resoria-deploy-*.zip in $H or $WEB. Upload it first."
if [ "$(dirname "$ZIP")" = "$WEB" ]; then
  mv "$ZIP" "$H/"
  ZIP=$H/$(basename "$ZIP")
fi
say "Domain $DOMAIN  (server IP $IP)"
echo "Package $ZIP"

# ---- Requirements
command -v unzip >/dev/null || fail "unzip is missing. Install it:  dnf -y install unzip  (or yum / apt-get)"
[ "$($PHP -r 'echo PHP_VERSION_ID;')" -ge 80100 ] || fail "PHP CLI is $($PHP -r 'echo PHP_VERSION;'); Resoria needs 8.1+ (WHM > MultiPHP Manager)"
grep -qi '^pdo_mysql$' <<<"$($PHP -m)" || fail "PHP is missing pdo_mysql (WHM > EasyApache 4)"
echo "PHP $($PHP -r 'echo PHP_VERSION;') with pdo_mysql"

# ---- Backup
BACKUP=$H/public_html-backup-$(date +%Y%m%d-%H%M%S).tar.gz
tar -czf "$BACKUP" -C $H public_html
say "Backed up public_html to $BACKUP"

FIRST=0
[ -f $WEB/api/config.php ] || FIRST=1

# ---- Database (first run only)
if [ $FIRST = 1 ]; then
  DBNAME=${U}_resoria
  DBUSER=${U}_app
  DBPASS=$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 28)
  if grep -q "database: $DBNAME\$" <<<"$(uapi --user=$U Mysql list_databases)"; then
    echo "Database $DBNAME already exists (kept as it is)"
  else
    uapi_ok Mysql create_database name=$DBNAME
    echo "Created database $DBNAME"
  fi
  if grep -q "user: $DBUSER\$" <<<"$(uapi --user=$U Mysql list_users)"; then
    uapi_ok Mysql set_password user=$DBUSER password="$DBPASS"
    echo "Database user $DBUSER existed: gave it a new password"
  else
    uapi_ok Mysql create_user name=$DBUSER password="$DBPASS"
    echo "Created database user $DBUSER"
  fi
  uapi_ok Mysql set_privileges_on_database user=$DBUSER database=$DBNAME privileges=ALL%20PRIVILEGES
fi

# ---- Files
cd $WEB
if [ $FIRST = 1 ]; then
  unzip -oq "$ZIP"
else
  unzip -oq "$ZIP" -x 'api/install.php'
fi
say "Unpacked the package into $WEB"

if [ $FIRST = 1 ]; then
  cat > $WEB/api/config.php <<EOF
<?php
// Resoria API settings. Server-side only, never part of a release.
declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NAME = '$DBNAME';
const DB_USER = '$DBUSER';
const DB_PASS = '$DBPASS';
const DB_CHARSET = 'utf8mb4';

// Left unset on purpose: the browser installer stays locked (install from the terminal).
const INSTALL_KEY = '__SET_INSTALL_KEY__';

// Website enquiry form: where enquiries are emailed ('' = only written to api/error_log).
const ENQUIRY_TO_EMAIL = '';
const ENQUIRY_FROM_EMAIL = 'enquiry@$DOMAIN';
const ENQUIRY_LOG_ONLY = false;

const ALLOWED_ORIGINS = [
  'https://$DOMAIN',
  'https://www.$DOMAIN',
];
EOF
  echo "Wrote api/config.php"
fi

# ---- Ownership and permissions (unzipped as root; public_html itself stays $U:nobody)
find $WEB -mindepth 1 -exec chown $U:$U {} +
find $WEB -mindepth 1 -type d -exec chmod 755 {} +
find $WEB -mindepth 1 -type f -not -path "$WEB/api/config.php" -exec chmod 644 {} +
chmod 600 $WEB/api/config.php
say "Files belong to $U"

# ---- Tables and the admin login (first run only)
ADMIN_PASS=""
if [ $FIRST = 1 ]; then
  ADMIN_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 14)
  say "Creating the tables"
  # If it fails, config.php goes too, so running this script again starts the install over.
  (cd $WEB/api && runuser -u $U -- env RESORIA_ADMIN_PASSWORD="$ADMIN_PASS" $PHP install.php) \
    || { rm -f $WEB/api/config.php; fail "the installer failed (message above). Fix that, then run this script again."; }
fi
rm -f $WEB/api/install.php

# ---- HTTPS
say "HTTPS certificate (AutoSSL)"
/usr/local/cpanel/bin/autossl_check --user=$U >/dev/null 2>&1 || echo "AutoSSL check didn't finish; it also runs by itself overnight"
grep -q 'status: 1' <<<"$(uapi --user=$U SSL toggle_ssl_redirect_for_domains domains=$DOMAIN state=1 2>/dev/null || true)" \
  && echo "http:// now redirects to https://" \
  || echo "Couldn't turn on the https redirect yet (certificate not issued?). Re-run later:  uapi --user=$U SSL toggle_ssl_redirect_for_domains domains=$DOMAIN state=1"

# ---- Check it, on this server (whatever the DNS says)
say "Checking"
R=(--resolve "$DOMAIN:443:$IP" --resolve "$DOMAIN:80:$IP" -sk -o /dev/null -w '%{http_code}')
echo "website  $(curl "${R[@]}" https://$DOMAIN/)"
echo "admin    $(curl "${R[@]}" https://$DOMAIN/admin/)"
echo "api      $(curl --resolve "$DOMAIN:443:$IP" -sk -X POST https://$DOMAIN/api/login -H 'Content-Type: application/json' -d '{}')"
echo "(expected: 200, 200, and {\"error\":\"Incorrect email or password.\"})"

if [ -n "$ADMIN_PASS" ]; then
  printf '\n==================================================\n'
  printf ' ADMIN LOGIN  https://%s/admin\n' "$DOMAIN"
  printf ' Email:     admin@resoria.co\n'
  printf ' Password:  %s\n' "$ADMIN_PASS"
  printf ' Write it down now: it is not stored anywhere else.\n'
  printf '==================================================\n'
fi
say "Done. To undo:  see 'Roll back' in DEPLOY.md (backup: $BACKUP)"
