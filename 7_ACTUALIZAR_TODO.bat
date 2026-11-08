@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "SIN_PAUSA=0"
set "FECHA_CORTE="
set "APP_ROOT=%~dp0."
set "SOLO_VERIFICAR=0"

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
goto :uso

:argumentos_listos
for %%I in ("%APP_ROOT%\.") do set "APP_ROOT=%%~fI"
echo ============================================================
echo ACTUALIZACION DE PUNTA A PUNTA
echo ============================================================
echo 1. Reemplazar VENTAS.xlsx, INGRESO.xlsx y TRANSFERENCIAS.xlsx en input\.
echo 2. Agregar STOCK.xlsx solo en el cierre mensual y elegir el ultimo dia del mes.
echo 3. Elegir corte, reconstruir y validar modelo.
echo 4. Publicar dashboard y reportes privados en bd-app.
echo.

if "%SOLO_VERIFICAR%"=="1" goto :verificar_modelo

if not defined FECHA_CORTE (
    echo ERROR: indica --fecha-corte AAAA-MM-DD.
    goto :error
)

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
echo Uso: 7_ACTUALIZAR_TODO.bat --fecha-corte AAAA-MM-DD [--fecha-stock AAAA-MM-DD] [--valorar-stock-cantidad-precio] [--app-root RUTA] [--solo-verificar] [--sin-pausa]
goto :error

:error
echo.
echo El flujo se detuvo; revisa el ultimo paso completado y sus respaldos antes de reintentarlo.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
