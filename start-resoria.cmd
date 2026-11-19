@echo off
rem Runs Resoria locally: its own MySQL (port 3327, data in .localrun\mysql-data)
rem and PHP's built-in server: website at http://127.0.0.1:8095/, admin at /admin/, API at /api/
rem Ports 3327/8095 keep clear of other local projects that use 3317/8090.
rem api\config.php must point at the same MySQL:  const DB_HOST = '127.0.0.1;port=3327';
rem Rebuild the admin:   cd source && npm run build          (writes admin\)
rem Rebuild the website: cd source\website && npm run build, then copy source\website\out to site\
cd /d "%~dp0"
start "Resoria MySQL" "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" --datadir="%~dp0.localrun\mysql-data" --port=3327 --mysqlx=OFF --bind-address=127.0.0.1 --console
start "Resoria PHP" .localrun\php\php.exe -S 127.0.0.1:8095 -t . .localrun\router.php
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8095/
