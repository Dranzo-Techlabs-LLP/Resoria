# Deploying Resoria to cPanel (WHM terminal)

Account: **resoriaevora** — web root `/home/resoriaevora/public_html`.

One zip holds everything that goes inside `public_html`:

| Path | What |
|------|------|
| `/` | The public website |
| `/admin/` | The admin app (staff sign in here) |
| `/api/` | The PHP API, plus `config.example.php` and `install.php` (removed after installing) |

`api/config.php` (the database password) is never in the zip. You create it
once on the server (step 5), and later deploys leave it alone.

Build a fresh zip on this PC (from `C:\Resoria`) with
`python -I source/scripts/package.py`. It lands in `release\`.

**Quickest way:** upload the zip (step 1), then run
[`deploy/deploy-resoria.sh`](deploy/deploy-resoria.sh) as root in the WHM
terminal. It does steps 2–9 below, checks the result, and prints the admin
login. Run it again for every later update: it then only replaces the files,
and leaves `config.php` and the data alone. The steps below are the same
thing done by hand.

---

## 1. Upload the zip

cPanel → **File Manager** → **Home** (`/home/resoriaevora`, *not* public_html)
→ **Upload** → choose `release\resoria-deploy-….zip` → wait for 100%.

## 2. Open the WHM terminal and set the names

WHM → **Server Configuration → Terminal** (you're root). Paste:

```bash
U=resoriaevora
H=/home/$U
WEB=$H/public_html
DOMAIN=$(awk '/^main_domain:/{print $2}' /var/cpanel/userdata/$U/main)
ZIP=$(ls -t $H/resoria-deploy-*.zip | head -1)
echo "domain: $DOMAIN   zip: $ZIP"
```

Both should print. If the domain isn't the one the site should answer on, set it by hand: `DOMAIN=resoriaevora.com`.

## 3. Check PHP

```bash
php -v | head -1
php -m | grep -i -E '^(pdo_mysql|mbstring|json)$'
whmapi1 php_get_vhost_versions | grep -B2 -A6 "vhost: $DOMAIN" | grep -E 'version|vhost'
```

You need PHP **8.1 or newer** for the domain, with `pdo_mysql`. If it's older, change it in WHM → **MultiPHP Manager**.

## 4. Back up public_html, then create the database

```bash
tar -czf $H/public_html-backup-$(date +%Y%m%d-%H%M).tar.gz -C $H public_html

DBNAME=${U}_resoria
DBUSER=${U}_app
DBPASS=$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9' | head -c 28)
uapi --user=$U Mysql create_database name=$DBNAME
uapi --user=$U Mysql create_user name=$DBUSER password="$DBPASS"
uapi --user=$U Mysql set_privileges_on_database user=$DBUSER database=$DBNAME privileges=ALL%20PRIVILEGES
```

Each `uapi` call should end with `status: 1`. The password is random and only goes into `config.php` in the next step, so you never type it.

## 5. Unpack the site and write config.php

```bash
cd $WEB && unzip -o "$ZIP"

cat > $WEB/api/config.php <<EOF
<?php
// Resoria API settings. Server-side only, never part of a release.
declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NAME = '$DBNAME';
const DB_USER = '$DBUSER';
const DB_PASS = '$DBPASS';
const DB_CHARSET = 'utf8mb4';

// Left unset on purpose: the browser installer stays locked (we install from this terminal).
const INSTALL_KEY = '__SET_INSTALL_KEY__';

// Website enquiry form: where enquiries are emailed ('' = only logged).
const ENQUIRY_TO_EMAIL = '';
const ENQUIRY_FROM_EMAIL = 'enquiry@$DOMAIN';
const ENQUIRY_LOG_ONLY = false;

const ALLOWED_ORIGINS = [
  'https://$DOMAIN',
  'https://www.$DOMAIN',
];
EOF
```

## 6. Ownership and permissions

You unzipped as root, so hand the files to the account:

```bash
find $WEB -mindepth 1 -exec chown $U:$U {} +
find $WEB -mindepth 1 -type d -exec chmod 755 {} +
find $WEB -mindepth 1 -type f -exec chmod 644 {} +
chmod 600 $WEB/api/config.php
```

(`public_html` itself stays `resoriaevora:nobody`; don't change it.)

## 7. Create the tables and the admin login

```bash
ADMIN_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 14)
cd $WEB/api && sudo -u $U env RESORIA_ADMIN_PASSWORD="$ADMIN_PASS" php install.php
rm -f $WEB/api/install.php
echo; echo "ADMIN LOGIN  ->  admin@resoria.co  /  $ADMIN_PASS"; echo
```

**Write the admin password down now.** It's shown only this once. Then clear the variables:

```bash
unset DBPASS ADMIN_PASS
```

## 8. HTTPS

```bash
/usr/local/cpanel/bin/autossl_check --user=$U
uapi --user=$U SSL toggle_ssl_redirect_for_domains domains=$DOMAIN state=1
```

The first command gets or renews the free certificate; the second sends `http://` to `https://`. The second only works once the certificate is in place. If it fails, run it again a few minutes later.

**Cloudflare:** resoriaevora.com is proxied by Cloudflare (it resolves to
188.114.96.x / 97.x, not the server's own IP). So leave cPanel's
"Force HTTPS Redirect" off. Instead, in Cloudflare set **SSL/TLS →
Full (strict)** (the server has a valid AutoSSL certificate) and turn on
**Always Use HTTPS**. After a later deploy, purge Cloudflare's cache if old
files still show.

## 9. Check it

```bash
curl -s -o /dev/null -w "site  %{http_code}\n" https://$DOMAIN/
curl -s -o /dev/null -w "admin %{http_code}\n" https://$DOMAIN/admin/
curl -s -X POST https://$DOMAIN/api/login -H 'Content-Type: application/json' -d '{}'; echo
```

Expected: `site 200`, `admin 200`, and `{"error":"Incorrect email or password."}` (the API and database answering).

Then in a browser: open `https://<domain>/admin` and sign in with the admin login from step 7. On the **Users** page, add your staff accounts.

---

## Later updates

Upload the new zip to Home as in step 1, then:

```bash
U=resoriaevora; H=/home/$U; WEB=$H/public_html
ZIP=$(ls -t $H/resoria-deploy-*.zip | head -1)
tar -czf $H/public_html-backup-$(date +%Y%m%d-%H%M).tar.gz -C $H public_html
cd $WEB && unzip -o "$ZIP" -x 'api/install.php'
find $WEB -mindepth 1 -not -name config.php -exec chown $U:$U {} +
find $WEB -mindepth 1 -type d -exec chmod 755 {} +
find $WEB -mindepth 1 -type f -not -name config.php -exec chmod 644 {} +
```

`config.php` and the data are left as they are. Database changes that come with an
update (new tables and columns) apply themselves on the first API request after it,
so there's no SQL to run by hand; they only add, never remove.

Uploaded guest ID proofs and purchase bills are kept in `public_html/api/uploads/`
(blocked from direct download; the app fetches them with a signed-in session).
The update above doesn't touch that folder, and the backup includes it.

## Roll back

```bash
U=resoriaevora; H=/home/$U
ls -t $H/public_html-backup-*.tar.gz | head -3        # pick one
rm -rf $H/public_html.old && mv $H/public_html $H/public_html.old
tar -xzf $H/public_html-backup-YYYYMMDD-HHMM.tar.gz -C $H
chown $U:nobody $H/public_html && chmod 750 $H/public_html
```

## If something's wrong

| Symptom | Fix |
|---------|-----|
| Site or API shows **500** | `tail -30 /home/resoriaevora/logs/resoriaevora_com.php.error.log` and `tail -30 /usr/local/apache/logs/error_log`. If it says config.php can't be read, PHP runs as `nobody` on this server: `chmod 644 $WEB/api/config.php`. |
| API says it can't connect to the database | Check the names in `config.php` match `uapi --user=$U Mysql list_databases` and `list_users`. |
| `/admin/bookings` (any page reloaded) gives 404 | The `.htaccess` files are missing: `ls -la $WEB/.htaccess $WEB/admin/.htaccess $WEB/api/.htaccess`. Re-run the unzip. |
| Enquiries aren't emailed | Set `ENQUIRY_TO_EMAIL` in `$WEB/api/config.php` to the bookings inbox. Until then, they're written to the PHP log: on this server (PHP-FPM) that's `/home/resoriaevora/logs/resoriaevora_com.php.error.log`. |
