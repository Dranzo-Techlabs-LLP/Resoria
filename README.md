# Resoria Evora

Website and property admin for **Resoria Evora**, live at
[resoriaevora.com](https://resoriaevora.com). Everything sits on one domain:

| URL | What | Source | Built with |
| --- | --- | --- | --- |
| `/` | Public website | `source/website/` | Next.js, exported as static HTML |
| `/admin` | Property admin (bookings, payments, expenses, reports) | `source/src/`, `source/public/` | React, Vite, Tailwind |
| `/api` | Backend for both | `api/` | PHP 8.1+ and MySQL |

On the server all three live in `public_html`, routed by `.htaccess` files.
No Node process runs in production.

## Folders

| Path | What |
| --- | --- |
| `api/` | The PHP API (`index.php`, `lib.php`). `config.php` is per-machine and never committed |
| `source/` | Admin app source; `npm run build` writes it to `admin/` |
| `source/website/` | Website source; `npm run build` writes it to `source/website/out/` |
| `source/server/` | `install.php` (creates tables and the admin login), `config.example.php`, `migrate.sql` |
| `source/scripts/package.py` | Builds the cPanel deploy zip into `release/` |
| `brand/` | Logo, photos, and `make_flow_map.py` (the waterfall animation's flow map) |
| `deploy/deploy-resoria.sh` | One-shot deploy/update script for the WHM terminal |
| `DEPLOY.md` | Step-by-step cPanel deployment, updates, rollback and troubleshooting |

## Run locally (Windows)

Needs Node.js, MySQL Server 8.0 and a PHP 8.1+ build with `pdo_mysql`.

```bash
cd source && npm install && npm run build                 # admin  -> admin/
cd source/website && npm install && npm run build         # website -> source/website/out/
```

Copy `source/website/out/` to `site/`. Then create `api/config.php` from
`source/server/config.example.php` (pointing at your local MySQL:
`const DB_HOST = '127.0.0.1;port=3327';`), and run the installer once from
`api/`: `php install.php`.

`start-resoria.cmd` starts a local MySQL (port 3327, data in `.localrun/mysql-data`)
and PHP's built-in server with `.localrun/router.php`. These ports keep clear of
other local projects that use 3317/8090:

- Website: http://127.0.0.1:8095/
- Admin: http://127.0.0.1:8095/admin/

## Run locally (macOS / Linux)

Needs Node.js, PHP 8.1+ with `pdo_mysql`, and MySQL 8+
(Homebrew: `brew install node php mysql`). Then, from the repo root:

```bash
./start-resoria.sh
```

The first run builds the admin and the website, creates a local MySQL
(port 3317, data in `.localrun/mysql-data`, separate from any MySQL you
already run), writes `api/config.php` and runs the installer. Later runs only
start the servers. It serves on http://localhost:8090/ (or the next free port)
and Ctrl+C stops it. `./start-resoria.sh --build` rebuilds both apps first;
`PORT=8095 ./start-resoria.sh` picks the port.

Local login: `admin@resoria.co` with the demo password from
`source/server/install.php`.

## Dev servers

For quick admin work, `cd source && npm run dev` serves the admin at
http://localhost:5173/admin/, and `cd source/website && npm run dev` serves
the website at http://localhost:3050.

## Deploy

```bash
python -I source/scripts/package.py      # from the repo root, after both builds
```

Upload the zip from `release/` to the cPanel account's home folder and follow
[DEPLOY.md](DEPLOY.md). The quickest way is `deploy/deploy-resoria.sh` in the
WHM terminal.

## Content to fill in

- Contact details for the website and invoices: `source/website/src/lib/content.ts`
  and `source/src/lib/config.ts` (items marked `PLACEHOLDER` or `TODO`).
- Invoice terms: in the admin under **Configuration → Invoice**.
- Enquiry email: `ENQUIRY_TO_EMAIL` in the server's `api/config.php`.

## Before going live: Configuration

Set these up once in the admin under **Configuration** (each tab saves on its own):

| Tab | Why |
| --- | --- |
| Rooms | Nightly base rate per room: New booking works the total out from it. If older bookings still name rooms from the previous room list (K1, Cave Room…), a "Rooms from the older room list" card appears here; move each to a current room. |
| B2B agents | Agents and their commission (percent or flat). B2B bookings need an agent; the commission is saved as pending and paid from **Expenses → B2B Payment**. |
| OTA platforms | Booking.com, Agoda… (starts with the usual ones). |
| Management referrals | Who may refer (and discount or comp) a booking. |
| Restaurant menu | Items and prices for **Add expense → Food** on in-house bookings. |
| Conference Hall | Price per duration for **Add expense → Conference Hall**. |
| Inventory master | Stock items; tick **Reusable** for linen, which is issued and returned instead of used up. |
| Departments | Who stock is issued to (Housekeeping, Kitchen…). |

Guest ratings: from a completed stay, **Share → Feedback request on WhatsApp** sends the guest a
link to `/feedback` on the website; their rating lands under **Rating**, where staff can also add
reviews from Google or OTAs and record replies.
