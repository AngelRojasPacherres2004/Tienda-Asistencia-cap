@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if not exist "package.json" (
    echo ERROR: falta el proyecto React.
    goto :error
)
if not exist ".env" (
    echo ERROR: falta la configuracion privada .env de Asiste.
    goto :error
)
where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: instala Node.js para ejecutar Asiste.
    goto :error
)
if not exist "node_modules\vite" (
    echo Instalando dependencias de React...
    call npm ci
    if errorlevel 1 goto :error
)
curl.exe --silent --fail --max-time 2 "http://127.0.0.1:5180/" >nul 2>nul
if not errorlevel 1 (
    echo Asiste ya esta activo en http://127.0.0.1:5180/
    if /I not "%~1"=="--sin-navegador" start "" "http://127.0.0.1:5180/"
    exit /b 0
)
echo Abriendo Asiste React en http://127.0.0.1:5180/
if /I not "%~1"=="--sin-navegador" start "" "http://127.0.0.1:5180/"
call npm run dev
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo No se pudo abrir el dashboard local.
pause
exit /b 1
