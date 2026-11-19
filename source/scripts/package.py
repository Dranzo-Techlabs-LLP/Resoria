"""Builds the cPanel deploy zip: everything that goes inside public_html.

    python -I source/scripts/package.py          (run from C:\\Resoria)

Layout of the zip (= public_html):
    /            the website (site/, the static export of source/website)
    /admin/      the admin app (admin/)
    /api/        the PHP API: index.php, lib.php, .htaccess,
                 config.example.php and install.php (deleted after installing)

Never included: api/config.php (it holds the database password and stays on
the server) and any PHP error_log files.
"""
import datetime
import os
import zipfile

ROOT = os.getcwd()
SKIP = {"config.php", "error_log", ".user.ini", "php.ini"}
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
os.makedirs(os.path.join(ROOT, "release"), exist_ok=True)
out = os.path.join(ROOT, "release", f"resoria-deploy-{stamp}.zip")


def add_tree(z: zipfile.ZipFile, src: str, prefix: str) -> int:
    count = 0
    for folder, dirs, files in os.walk(src):
        # Uploaded ID proofs / purchase bills are server data: never ship local ones
        dirs[:] = [d for d in dirs if not (prefix == "api/" and folder == src and d == "uploads")]
        for name in files:
            if name in SKIP:
                continue
            path = os.path.join(folder, name)
            rel = os.path.relpath(path, src).replace(os.sep, "/")
            z.write(path, f"{prefix}{rel}")
            count += 1
    return count


with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    n = add_tree(z, os.path.join(ROOT, "site"), "")
    n += add_tree(z, os.path.join(ROOT, "admin"), "admin/")
    n += add_tree(z, os.path.join(ROOT, "api"), "api/")
    z.write(os.path.join(ROOT, "source", "server", "config.example.php"), "api/config.example.php")
    z.write(os.path.join(ROOT, "source", "server", "install.php"), "api/install.php")
    n += 2

names = zipfile.ZipFile(out).namelist()
assert "api/config.php" not in names, "config.php must never ship"
assert not any(x.startswith("api/uploads/") for x in names), "uploads must never ship"
assert ".htaccess" in names and "admin/.htaccess" in names and "api/.htaccess" in names
print(f"{out}\n{n} files, {os.path.getsize(out) / 1024:.0f} KB")
