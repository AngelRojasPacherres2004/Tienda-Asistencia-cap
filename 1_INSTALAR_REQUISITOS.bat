@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo INSTALACION - DASHBOARD GENERAL
echo ============================================================
echo.

set "PYTHON_CMD="
where py >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=py -3"

if not defined PYTHON_CMD (
    where python >nul 2>nul
    if not errorlevel 1 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
    echo ERROR: No se encontro Python.
    echo Instala Python 3.10 o superior desde https://www.python.org/downloads/
    echo Durante la instalacion marca la opcion "Add Python to PATH".
    goto :error
)

%PYTHON_CMD% -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
    echo ERROR: Se requiere Python 3.10 o superior.
    goto :error
)

if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual local...
    %PYTHON_CMD% -m venv ".venv"
    if errorlevel 1 goto :error
) else (
    echo Entorno virtual existente: .venv
)

for %%D in ("input" "capa1" "capa2" "entrega_asistente_comercial") do (
    if not exist "%%~D" mkdir "%%~D"
)

echo Instalando dependencias...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :error

".venv\Scripts\python.exe" -m pip install -r "piplines\requirements.txt"
if errorlevel 1 goto :error

echo Verificando el entorno...
".venv\Scripts\python.exe" "piplines\diagnosticar_duckdb.py"
if errorlevel 1 goto :error

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: No se encontro Node.js/npm.
    echo Instala Node.js LTS para compilar y ejecutar la interfaz local.
    goto :error
)

if not exist "package-lock.json" (
    echo ERROR: Falta package-lock.json.
    goto :error
)

if exist "node_modules\vite\bin\vite.js" (
    echo Dependencias de la interfaz verificadas: node_modules existente.
    call npm run --silent generate:commercial-icons
    set "NPM_EXIT=!ERRORLEVEL!"
) else (
    echo Instalando dependencias de la interfaz por primera vez...
    echo Si hay un servidor local abierto, cierralo antes de ejecutar esta instalacion.
    call npm ci
    set "NPM_EXIT=!ERRORLEVEL!"
)
if not "!NPM_EXIT!"=="0" goto :error

echo.
echo ============================================================
echo INSTALACION COMPLETADA
echo La actualizacion local procesa solo Ventas, Transferencias, Ingresos y Stock.
echo Los demas indicadores se consultan desde las tablas de la base de datos.
echo Ahora ejecuta: 2_ACTUALIZAR_DATOS.bat
echo Los cuatro Parquet de subida quedaran en: entrega_asistente_comercial\AAAA-MM-DD\
echo ============================================================
if /I not "%~1"=="--sin-pausa" pause
exit /b 0

:error
echo.
echo La instalacion no pudo completarse. Revisa el mensaje anterior.
if /I not "%~1"=="--sin-pausa" pause
exit /b 1
