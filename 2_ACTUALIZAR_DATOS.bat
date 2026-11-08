@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "FECHA_CORTE="
set "ANIO_FIN="
set "SIN_PAUSA=0"
set "FORZAR_CAPA1="
set "SOLO_VERIFICAR=0"
set "INCREMENTAL=--incremental"

:leer_argumentos
if /I "%~1"=="--fecha-stock" (
    if "%~2"=="" goto :error
    set "DASHBOARD_STOCK_CUTOFF=%~2"
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
if /I "%~1"=="--incremental" (
    set "INCREMENTAL=--incremental"
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
if defined INCREMENTAL echo Modo: diario desde input\ con archivos de nombre fijo
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo No existe el entorno virtual. Se ejecutara la instalacion.
    call "%~dp01_INSTALAR_REQUISITOS.bat" --sin-pausa
    if errorlevel 1 goto :error
)

if "%SOLO_VERIFICAR%"=="1" goto :solo_verificar

if not defined FECHA_CORTE goto :error_corte

echo.
echo Procesando solamente: Ventas, Transferencias, Ingresos y Stock.
echo Metas, trafico, personal, merma, guias y catalogos se conservan desde las tablas de la base de datos.
echo.

rem --- Capa 1 y Capa 2 ---
".venv\Scripts\python.exe" "piplines\ejecutar_todo.py" ^
    --solo-operacion-comercial %FORZAR_CAPA1% %INCREMENTAL% %ARG_FECHA_CORTE% ^
    --anio-fin "%ANIO_FIN%" --paralelismo 2
if "%ERRORLEVEL%"=="3" goto :sin_novedades
if errorlevel 1 goto :error

set "CORTE_ACTUAL=%FECHA_CORTE%"
if not defined CORTE_ACTUAL goto :error_corte
echo Fecha de corte seleccionada: %CORTE_ACTUAL%

echo Ejecutando validacion final...
".venv\Scripts\python.exe" "piplines\validar_modelo.py" --estricto
if errorlevel 1 goto :error

echo Actualizando datos del dashboard web...
".venv\Scripts\python.exe" "piplines\generar_datos_web.py"
if errorlevel 1 goto :error

echo Preparando lote manual para Asistente Comercial...
".venv\Scripts\python.exe" "piplines\preparar_lote_asistente.py" ^
    --fecha-corte "%CORTE_ACTUAL%" --reemplazar
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
echo Lote para portal: entrega_asistente_comercial\%CORTE_ACTUAL%\
echo Anio procesado  : %ANIO_FIN%
echo Corte de ventas : %CORTE_ACTUAL%
echo Dashboard web   : ejecutar 4_EJECUTAR_DASHBOARD_WEB.bat
echo ============================================================
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:sin_novedades
echo.
echo No hay archivos nuevos para procesar. El modelo y el paquete anterior se conservan.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:error_corte
echo ERROR: indica --fecha-corte AAAA-MM-DD.
goto :error

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
