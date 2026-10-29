@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "FECHA_CORTE="
set "SIN_PAUSA=0"
set "FORZAR_CAPA1="
set "SOLO_VERIFICAR=0"

:leer_argumentos
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
set "ARG_FECHA_CORTE="
if defined FECHA_CORTE set "ARG_FECHA_CORTE=--fecha-corte %FECHA_CORTE%"

echo ============================================================
echo ACTUALIZACION COMPLETA - DASHBOARD GENERAL
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo No existe el entorno virtual. Se ejecutara la instalacion.
    call "%~dp01_INSTALAR_REQUISITOS.bat" --sin-pausa
    if errorlevel 1 goto :error
)

for /f "delims=" %%F in ('.venv\Scripts\python.exe -c "from datetime import date; print(date.today().year)"') do set "ANIO_FIN=%%F"
if "%SOLO_VERIFICAR%"=="1" goto :solo_verificar

echo.
echo Se revisaran los Excel RMS y luego se elegira el ultimo dia de
echo trafico con cobertura suficiente. Stock conserva su propia fecha.
echo.

".venv\Scripts\python.exe" "piplines\ejecutar_todo.py" ^
    --solo-capa1 %FORZAR_CAPA1% --paralelismo 2
if errorlevel 1 goto :error

set "CORTE_ACTUAL="
if not exist ".etl_work" mkdir ".etl_work"
".venv\Scripts\python.exe" "piplines\corte_comercial_automatico.py" --seleccionar %ARG_FECHA_CORTE% > ".etl_work\fecha-corte-seleccionada.txt"
if errorlevel 1 goto :error
set /p "CORTE_ACTUAL=" < ".etl_work\fecha-corte-seleccionada.txt"
if not defined CORTE_ACTUAL goto :error
echo Fecha de corte seleccionada: %CORTE_ACTUAL%

".venv\Scripts\python.exe" "piplines\ejecutar_todo.py" ^
    --solo-capa2 --paralelismo 2 ^
    --anio-fin "%ANIO_FIN%" --fecha-corte "%CORTE_ACTUAL%"
if errorlevel 1 goto :error

echo Ejecutando validacion estricta final...
".venv\Scripts\python.exe" "piplines\validar_modelo.py" --estricto
if errorlevel 1 goto :error

echo Actualizando datos compactos del dashboard React...
".venv\Scripts\python.exe" "piplines\generar_datos_web.py"
if errorlevel 1 goto :error
".venv\Scripts\python.exe" "piplines\corte_comercial_automatico.py" --validar --fecha-corte "%CORTE_ACTUAL%"
if errorlevel 1 goto :error
where npm >nul 2>nul
if errorlevel 1 (
    echo AVISO: Node.js no esta instalado; los datos quedaron generados.
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
echo Parquet finales: capa2
echo Modelo Power BI: capa2\Modelo_Dashboard.tmdl
echo Dashboard web: ejecutar 4_EJECUTAR_DASHBOARD_WEB.bat
echo ============================================================
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:solo_verificar
set "CORTE_ACTUAL="
if not exist ".etl_work" mkdir ".etl_work"
".venv\Scripts\python.exe" "piplines\corte_comercial_automatico.py" --seleccionar %ARG_FECHA_CORTE% > ".etl_work\fecha-corte-seleccionada.txt"
if errorlevel 1 goto :error
set /p "CORTE_ACTUAL=" < ".etl_work\fecha-corte-seleccionada.txt"
if not defined CORTE_ACTUAL goto :error
".venv\Scripts\python.exe" "piplines\corte_comercial_automatico.py" --validar --fecha-corte "%CORTE_ACTUAL%"
if errorlevel 1 goto :error
echo Modelo local consistente para %CORTE_ACTUAL%.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:error
echo.
echo La actualizacion no pudo completarse. Los resultados anteriores se
echo conservan mediante el respaldo automatico de la pipeline.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
