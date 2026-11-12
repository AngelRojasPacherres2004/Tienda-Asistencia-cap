@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo INSTALACION - DASHBOARD GENERAL
echo ============================================================
echo.

set "PYTHON_CMD=py -3.12"

rem DuckDB/Thrift tienen ruedas Windows para 3.12. Python 3.14/3.15 obliga
rem a compilarlos localmente y requiere herramientas C++ que no son necesarias.
%PYTHON_CMD% -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>nul
if not errorlevel 1 goto :python_ready

echo Python 3.12 no esta disponible. Intentando instalarlo...
where py >nul 2>nul
if not errorlevel 1 (
    py install 3.12
    py -3.12 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>nul
    if not errorlevel 1 goto :python_ready
)

where winget >nul 2>nul
if not errorlevel 1 (
    echo Instalando Python 3.12 con Windows Package Manager...
    winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements
    py -3.12 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>nul
    if not errorlevel 1 goto :python_ready
)

echo ERROR: no se pudo instalar Python 3.12 automaticamente.
echo Instala Python 3.12 x64 desde https://www.python.org/downloads/release/python-3120/
echo y vuelve a ejecutar este archivo. No uses Python 3.14 ni 3.15 para este paquete.
goto :error

:python_ready
echo Python 3.12 listo.

set "RECREAR_VENV=0"
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>nul
    if errorlevel 1 set "RECREAR_VENV=1"
)

if "!RECREAR_VENV!"=="1" (
    echo Reemplazando el entorno virtual incompatible...
    rmdir /s /q ".venv"
)

if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual local...
    %PYTHON_CMD% -m venv ".venv"
    if errorlevel 1 goto :error
) else (
    echo Entorno virtual existente: .venv
)

for %%D in ("Entrada" "Salida") do (
    if not exist "%%~D" mkdir "%%~D"
)

echo Instalando dependencias...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :error

".venv\Scripts\python.exe" -m pip install --only-binary=:all: -r "piplines\requirements.txt"
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

echo Preparando periodos mensuales de entrada...
".venv\Scripts\python.exe" "piplines\operacion_mensual.py" --inicializar
if errorlevel 1 goto :error

echo.
echo ============================================================
echo INSTALACION COMPLETADA
echo Usa 0_ABRIR_PANEL.bat para elegir un periodo de ENTRADA y procesarlo.
echo Los Parquet listos quedaran en: SALIDA\AAAAMM\
echo ============================================================
if /I not "%~1"=="--sin-pausa" pause
exit /b 0

:error
echo.
echo La instalacion no pudo completarse. Revisa el mensaje anterior.
if /I not "%~1"=="--sin-pausa" pause
exit /b 1
