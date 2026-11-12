@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo INSTALACION - DASHBOARD GENERAL
echo ============================================================
echo.

set "PYTHON_CMD="
for %%V in (3.12 3.13 3.11 3.10) do (
    call :usar_python py -%%V
    if not errorlevel 1 goto :python_ready
)
call :usar_python python
if not errorlevel 1 goto :python_ready

echo No hay un Python compatible ^(3.10 a 3.13^). Intentando instalar Python 3.12...
where py >nul 2>nul
if not errorlevel 1 (
    py install 3.12
    call :usar_python py -3.12
    if not errorlevel 1 goto :python_ready
)

where winget >nul 2>nul
if not errorlevel 1 (
    echo Instalando Python 3.12 con Windows Package Manager...
    winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements
    call :usar_python py -3.12
    if not errorlevel 1 goto :python_ready
)

echo ERROR: no se encontro un runtime de Python compatible.
echo Usa el Python 3.10 que ya instalaste o instala Python 3.12 x64 y vuelve a ejecutar este archivo.
echo No uses Python 3.14 ni 3.15 para este paquete.
goto :error

:python_ready
echo Python compatible listo: %PYTHON_CMD%

set "RECREAR_VENV=0"
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -c "import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)" >nul 2>nul
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

call :asegurar_node
if errorlevel 1 goto :error

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

:usar_python
set "VERSION_REAL="
for /f "usebackq delims=" %%P in (`%* -c "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')" 2^>nul`) do set "VERSION_REAL=%%P"
if "%VERSION_REAL%"=="3.10" goto :python_elegido
if "%VERSION_REAL%"=="3.11" goto :python_elegido
if "%VERSION_REAL%"=="3.12" goto :python_elegido
if "%VERSION_REAL%"=="3.13" goto :python_elegido
exit /b 1

:python_elegido
set "PYTHON_CMD=%*"
exit /b 0

:asegurar_node
where node >nul 2>nul
if not errorlevel 1 goto :node_listo

rem Winget puede instalar Node por usuario o para todo el equipo. Ambos
rem directorios se agregan al PATH actual para no obligar a abrir otra consola.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto :node_listo

where winget >nul 2>nul
if errorlevel 1 (
    echo ERROR: falta Node.js LTS y Windows Package Manager no esta disponible.
    echo Instala Node.js LTS desde https://nodejs.org/ y vuelve a ejecutar este archivo.
    exit /b 1
)

echo Node.js LTS no esta instalado. Instalando automaticamente...
winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo ERROR: Windows no pudo instalar Node.js LTS automaticamente.
    echo Instala Node.js LTS desde https://nodejs.org/ y vuelve a ejecutar este archivo.
    exit /b 1
)
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js se instalo pero no se encontro en esta sesion.
    echo Cierra esta ventana, abre 1_INSTALAR_REQUISITOS.bat otra vez y continua.
    exit /b 1
)

:node_listo
where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js esta disponible pero npm no. Reinstala Node.js LTS desde https://nodejs.org/.
    exit /b 1
)
for /f "delims=" %%N in ('node --version') do echo Node.js listo: %%N
exit /b 0
