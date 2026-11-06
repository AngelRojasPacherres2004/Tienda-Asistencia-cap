@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "FECHA_CORTE="
set "ANIO_FIN="
set "SIN_PAUSA=0"
set "FORZAR_CAPA1="
set "SOLO_VERIFICAR=0"

:leer_argumentos
if /I "%~1"=="--fecha-stock" (
    if "%~2"=="" goto :error
    set "DASHBOARD_STOCK_CUTOFF=%~2"
    shift
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--fecha-trafico" (
    if "%~2"=="" goto :error
    set "DASHBOARD_TRAFFIC_CUTOFF=%~2"
    shift
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--valorar-stock-cantidad-precio" (
    set "DASHBOARD_STOCK_VALUE_POLICY=quantity-price"
    shift
    goto :leer_argumentos
)
if "%~1"=="" goto :argumentos_listos
if /I "%~1"=="--sin-pausa" (
    set "SIN_PAUSA=1"
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--fecha-corte" (
    if "%~2"=="" (
        echo ERROR: --fecha-corte requiere una fecha AAAA-MM-DD.
        goto :error
    )
    set "FECHA_CORTE=%~2"
    shift
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--anio-fin" (
    if "%~2"=="" (
        echo ERROR: --anio-fin requiere un numero de anio.
        goto :error
    )
    set "ANIO_FIN=%~2"
    shift
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--forzar-capa1" (
    set "FORZAR_CAPA1=--reconstruir-capa1"
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--solo-verificar" (
    set "SOLO_VERIFICAR=1"
    shift
    goto :leer_argumentos
)
echo ERROR: argumento no reconocido: %~1
goto :error

:argumentos_listos
rem Usar año actual si no se paso --anio-fin
if not defined ANIO_FIN (
    for /f "delims=" %%F in ('.venv\Scripts\python.exe -c "from datetime import date; print(date.today().year)"') do set "ANIO_FIN=%%F"
)

set "ARG_FECHA_CORTE="
if defined FECHA_CORTE set "ARG_FECHA_CORTE=--fecha-corte %FECHA_CORTE%"

echo ============================================================
echo ACTUALIZACION OPERATIVA - DASHBOARD GENERAL
echo Anio seleccionado: %ANIO_FIN%
if defined FECHA_CORTE echo Corte manual: %FECHA_CORTE%
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo No existe el entorno virtual. Se ejecutara la instalacion.
    call "%~dp01_INSTALAR_REQUISITOS.bat" --sin-pausa
    if errorlevel 1 goto :error
)

if "%SOLO_VERIFICAR%"=="1" goto :solo_verificar

echo.
echo Procesando solamente: Ventas, Transferencias, Ingresos y Stock.
echo Metas, trafico, personal, merma, guias y catalogos se conservan desde las tablas de la base de datos.
echo.

rem --- Capa 1 ---
".venv\Scripts\python.exe" "piplines\ejecutar_todo.py" ^
    --solo-capa1 --solo-operacion-comercial %FORZAR_CAPA1% --paralelismo 2
if errorlevel 1 goto :error

rem --- Fecha de corte ---
set "CORTE_ACTUAL="
if defined FECHA_CORTE set "CORTE_ACTUAL=%FECHA_CORTE%"
if not defined CORTE_ACTUAL (
    for /f "delims=" %%F in ('".venv\Scripts\python.exe" -c "import json; print(json.load(open(r'dashboard-data/dashboard.json', encoding='utf-8'))['metadata']['selectedCutoff'])"') do set "CORTE_ACTUAL=%%F"
)
if not defined CORTE_ACTUAL (
    echo ERROR: indica --fecha-corte AAAA-MM-DD cuando no exista un corte publicado.
    goto :error
)
echo Fecha de corte seleccionada: %CORTE_ACTUAL%

rem --- Capa 2 ---
".venv\Scripts\python.exe" "piplines\ejecutar_todo.py" ^
    --solo-capa2 --solo-operacion-comercial --paralelismo 2 ^
    --anio-fin "%ANIO_FIN%" --fecha-corte "%CORTE_ACTUAL%"
if errorlevel 1 goto :error

echo Ejecutando validacion final...
".venv\Scripts\python.exe" "piplines\validar_modelo.py" --estricto
if errorlevel 1 goto :error

echo Actualizando datos del dashboard web...
".venv\Scripts\python.exe" "piplines\generar_datos_web.py"
if errorlevel 1 goto :error

where npm >nul 2>nul
if errorlevel 1 (
    echo AVISO: Node.js no instalado; los datos quedaron generados pero no se compilo la web.
) else (
    if not exist "node_modules\vite" (
        call npm ci
        if errorlevel 1 goto :error
    )
    call npm run build
    if errorlevel 1 goto :error
)

echo.
echo ============================================================
echo ACTUALIZACION COMPLETADA
echo Parquet finales : capa2\
echo Anio procesado  : %ANIO_FIN%
echo Corte de ventas : %CORTE_ACTUAL%
echo Dashboard web   : ejecutar 4_EJECUTAR_DASHBOARD_WEB.bat
echo ============================================================
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:solo_verificar
if not exist "dashboard-data\dashboard.json" (
    echo ERROR: no existe dashboard-data\dashboard.json. Ejecuta primero la actualizacion.
    goto :error
)
echo Modelo local disponible. Las fuentes administrativas se verifican desde la base de datos.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:error
echo.
echo La actualizacion no pudo completarse. Los resultados anteriores se
echo conservan mediante el respaldo automatico de la pipeline.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
