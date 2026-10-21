@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "SIN_PAUSA=0"
set "FECHA_CORTE="
set "APP_ROOT=%~dp0Tienda-Asistencia-cap"
set "TRAFICO_EXCEL="
set "TRAFICO_DESDE="
set "SOLO_VERIFICAR=0"

:leer_argumentos
if "%~1"=="" goto :argumentos_listos
if /I "%~1"=="--sin-pausa" (
    set "SIN_PAUSA=1"
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--solo-verificar" (
    set "SOLO_VERIFICAR=1"
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--fecha-corte" (
    if "%~2"=="" goto :uso
    set "FECHA_CORTE=%~2"
    shift
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--app-root" (
    if "%~2"=="" goto :uso
    set "APP_ROOT=%~2"
    shift
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--trafico-excel" (
    if "%~2"=="" goto :uso
    set "TRAFICO_EXCEL=%~2"
    shift
    shift
    goto :leer_argumentos
)
if /I "%~1"=="--trafico-desde" (
    if "%~2"=="" goto :uso
    set "TRAFICO_DESDE=%~2"
    shift
    shift
    goto :leer_argumentos
)
goto :uso

:argumentos_listos
echo ============================================================
echo ACTUALIZACION DE PUNTA A PUNTA
echo ============================================================
echo 1. Revisar RMS y trafico estandarizado.
echo 2. Elegir corte, reconstruir y validar modelo.
echo 3. Publicar dashboard y reportes privados en bd-app.
echo.

if defined TRAFICO_EXCEL (
    if not defined FECHA_CORTE (
        echo ERROR: --trafico-excel requiere --fecha-corte para evitar importar dias no confirmados.
        goto :error
    )
    if not defined TRAFICO_DESDE set "TRAFICO_DESDE=%FECHA_CORTE:~0,7%-01"
    for %%I in ("!TRAFICO_EXCEL!") do set "TRAFICO_EXCEL=%%~fI"
    if not exist "!TRAFICO_EXCEL!" (
        echo ERROR: no se encontro el Excel de trafico.
        goto :error
    )
    if not exist "%APP_ROOT%\.env" (
        echo ERROR: falta la configuracion privada de Asiste.
        goto :error
    )
    if not exist ".venv\Scripts\python.exe" (
        call "%~dp01_INSTALAR_REQUISITOS.bat" --sin-pausa
        if errorlevel 1 goto :error
    )
    where node >nul 2>nul
    if errorlevel 1 (
        echo ERROR: Node.js no esta instalado.
        goto :error
    )
    if not exist "%APP_ROOT%\node_modules\exceljs" (
        echo Instalando dependencias del proyecto Asiste...
        pushd "%APP_ROOT%"
        call npm ci
        if errorlevel 1 (
            popd
            goto :error
        )
        popd
    )
    pushd "%APP_ROOT%"
    echo Validando trafico en Excel local y en bd-app...
    node "scripts\update-traffic-layer1.mjs" "!TRAFICO_EXCEL!" --layer1="%~dp0capa1\TRAFICO_CLIENTES.xlsx" --python="%~dp0.venv\Scripts\python.exe" --from=!TRAFICO_DESDE! --to=%FECHA_CORTE%
    if errorlevel 1 (
        popd
        goto :error
    )
    node --env-file=.env "scripts\sync-traffic-daily-workbook.mjs" "!TRAFICO_EXCEL!" --from=!TRAFICO_DESDE! --to=%FECHA_CORTE%
    if errorlevel 1 (
        popd
        goto :error
    )
    if "%SOLO_VERIFICAR%"=="1" (
        popd
        goto :verificar_modelo
    )
    echo Actualizando trafico horario y Capa 1 con respaldo...
    node --env-file=.env "scripts\sync-traffic-daily-workbook.mjs" "!TRAFICO_EXCEL!" --from=!TRAFICO_DESDE! --to=%FECHA_CORTE% --apply
    if errorlevel 1 (
        popd
        goto :error
    )
    node "scripts\update-traffic-layer1.mjs" "!TRAFICO_EXCEL!" --layer1="%~dp0capa1\TRAFICO_CLIENTES.xlsx" --python="%~dp0.venv\Scripts\python.exe" --from=!TRAFICO_DESDE! --to=%FECHA_CORTE% --apply
    if errorlevel 1 (
        popd
        goto :error
    )
    popd
)

if "%SOLO_VERIFICAR%"=="1" goto :verificar_modelo

if defined FECHA_CORTE (
    call "%~dp02_ACTUALIZAR_DATOS.bat" --fecha-corte "%FECHA_CORTE%" --sin-pausa
) else (
    call "%~dp02_ACTUALIZAR_DATOS.bat" --sin-pausa
)
if errorlevel 1 goto :error

call "%~dp06_ACTUALIZAR_DASHBOARD_WEB.bat" --app-root "%APP_ROOT%" --sin-pausa
if errorlevel 1 goto :error

echo.
echo Actualizacion y publicacion completadas.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:verificar_modelo
if defined FECHA_CORTE (
    call "%~dp02_ACTUALIZAR_DATOS.bat" --fecha-corte "%FECHA_CORTE%" --solo-verificar --sin-pausa
) else (
    call "%~dp02_ACTUALIZAR_DATOS.bat" --solo-verificar --sin-pausa
)
if errorlevel 1 goto :error
echo Revision completada. No se importo ni publico informacion.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:uso
echo Uso: 7_ACTUALIZAR_TODO.bat [--fecha-corte AAAA-MM-DD] [--trafico-excel RUTA] [--trafico-desde AAAA-MM-DD] [--app-root RUTA] [--solo-verificar] [--sin-pausa]
goto :error

:error
echo.
echo El flujo se detuvo; revisa el ultimo paso completado y sus respaldos antes de reintentarlo.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
