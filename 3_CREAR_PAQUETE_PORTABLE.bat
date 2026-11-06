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
if errorlevel 1 (
    echo AVISO: Node.js no instalado; el ZIP se crea sin build.
    goto :solo_pipelines
)

where tar.exe >nul 2>nul
if errorlevel 1 goto :error

if not exist "node_modules\vite" (
    call npm ci
    if errorlevel 1 goto :error
)
call npm run build
if errorlevel 1 goto :error
if not exist "dist\index.html" goto :error

:solo_pipelines
if exist "%ZIP%" del /q "%ZIP%"
echo Creando %ZIP% con React, pipeline y datos locales...
echo El paquete procesa por archivo solo Ventas, Transferencias, Ingresos y Stock.
echo Las demas fuentes se conservan desde las tablas de la base de datos.

rem Copiar .env al ZIP si existen (sin exponer en la raiz)
set "ENV_ARGS="
if exist ".env" set "ENV_ARGS=%ENV_ARGS% .env"
if exist ".env.supabase.local" set "ENV_ARGS=%ENV_ARGS% .env.supabase.local"

tar.exe -a -c -f "%ZIP%" --exclude="**/__pycache__" --exclude="*.pyc" --exclude="**/.temp/**" --exclude="**/node_modules/**" "0_ABRIR_PANEL.bat" "1_INSTALAR_REQUISITOS.bat" "2_ACTUALIZAR_DATOS.bat" "3_CREAR_PAQUETE_PORTABLE.bat" "4_EJECUTAR_DASHBOARD_WEB.bat" "5_CREAR_USUARIO_WEB.bat" "6_ACTUALIZAR_DASHBOARD_WEB.bat" "7_ACTUALIZAR_TODO.bat" ".env.example" ".env.supabase.local.example" "piplines" "shared" "netlify" "supabase" %ENV_ARGS%

rem Agregar carpetas opcionales si existen
if exist "dist" tar.exe -a -r -f "%ZIP%" "dist" 2>nul
if exist "src" tar.exe -a -r -f "%ZIP%" "src" 2>nul
if exist "public" tar.exe -a -r -f "%ZIP%" "public" 2>nul
if exist "scripts" tar.exe -a -r -f "%ZIP%" "scripts" 2>nul
if exist "input" tar.exe -a -r -f "%ZIP%" "input" 2>nul
if exist "capa1" tar.exe -a -r -f "%ZIP%" "capa1" 2>nul
if exist "capa2" tar.exe -a -r -f "%ZIP%" "capa2" 2>nul
if exist "dashboard-data" tar.exe -a -r -f "%ZIP%" "dashboard-data" 2>nul
if exist "package.json" tar.exe -a -r -f "%ZIP%" "package.json" "package-lock.json" 2>nul
if exist "index.html" tar.exe -a -r -f "%ZIP%" "index.html" "vite.config.js" "netlify.toml" 2>nul

if errorlevel 1 goto :error
echo Paquete creado: %ZIP%
if defined ENV_ARGS echo Los archivos .env fueron incluidos en el ZIP.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:error
echo ERROR: no se pudo crear el paquete portable.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
