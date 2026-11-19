@echo off
rem Runs Resoria locally: its own MySQL (port 3317, data in .localrun\mysql-data)
rem and PHP's built-in server: website at http://localhost:8090/, admin at /admin/, API at /api/
rem Rebuild the admin:   cd source && npm run build          (writes admin\)
rem Rebuild the website: cd source\website && npm run build, then copy source\website\out to site\
cd /d "%~dp0"
start "Resoria MySQL" "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" --datadir="%~dp0.localrun\mysql-data" --port=3317 --mysqlx=OFF --bind-address=127.0.0.1 --console
start "Resoria PHP" .localrun\php\php.exe -S localhost:8090 -t . .localrun\router.php
timeout /t 3 /nobreak >nul
start "" http://localhost:8090/
