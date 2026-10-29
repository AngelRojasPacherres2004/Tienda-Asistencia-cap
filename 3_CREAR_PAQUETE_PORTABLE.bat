@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "SIN_PAUSA=0"
if /I "%~1"=="--sin-pausa" set "SIN_PAUSA=1"
if not exist "piplines\VERSION.txt" goto :error
set /p "VERSION=" < "piplines\VERSION.txt"
set "ZIP=DashboardGeneral_Portable_v%VERSION%.zip"
where npm >nul 2>nul
if errorlevel 1 goto :error
where tar.exe >nul 2>nul
if errorlevel 1 goto :error
if not exist "node_modules\vite" (
    call npm ci
    if errorlevel 1 goto :error
)
call npm run build
if errorlevel 1 goto :error
if not exist "dist\index.html" goto :error
if exist "%ZIP%" del /q "%ZIP%"
echo Creando %ZIP% con React, pipeline y datos locales...
tar.exe -a -c -f "%ZIP%" --exclude="**/__pycache__" --exclude="*.pyc" --exclude="**/.env*" --exclude="**/.temp/**" --exclude="**/node_modules/**" "0_ABRIR_PANEL.bat" "1_INSTALAR_REQUISITOS.bat" "2_ACTUALIZAR_DATOS.bat" "3_CREAR_PAQUETE_PORTABLE.bat" "4_EJECUTAR_DASHBOARD_WEB.bat" "5_CREAR_USUARIO_WEB.bat" "6_ACTUALIZAR_DASHBOARD_WEB.bat" "7_ACTUALIZAR_TODO.bat" "README.md" "package.json" "package-lock.json" "index.html" "vite.config.js" "netlify.toml" "src" "public" "shared" "scripts" "netlify" "piplines" "supabase" "dist" "dashboard-data" "input" "capa1" "capa2"
if errorlevel 1 goto :error
echo Paquete creado: %ZIP%
echo En otro equipo se necesita el archivo privado .env y Node.js para ejecutar la web.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:error
echo ERROR: no se pudo crear el paquete portable React.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
