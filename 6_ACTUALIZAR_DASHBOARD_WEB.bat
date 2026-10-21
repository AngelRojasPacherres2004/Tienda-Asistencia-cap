@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "SIN_PAUSA=0"
set "APP_ROOT=%~dp0"

:leer_argumentos
if "%~1"=="" goto :argumentos_listos
if /I "%~1"=="--sin-pausa" (
    set "SIN_PAUSA=1"
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
echo ============================================================
echo PUBLICACION COMPLETA - BD-APP
echo ============================================================
echo Se publicaran dashboard y reportes del mismo corte.
echo Nunca se usara la configuracion del proyecto Supabase antiguo.
echo.

if not exist ".venv\Scripts\python.exe" (
    echo ERROR: instala primero los requisitos con 1_INSTALAR_REQUISITOS.bat.
    goto :error
)
if not exist "%APP_ROOT%\scripts\publish-annual-reports.mjs" (
    echo ERROR: no se encontro el proyecto Asiste en %APP_ROOT%.
    goto :error
)
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado.
    goto :error
)
if not exist "%APP_ROOT%\node_modules\@supabase\supabase-js" (
    echo Instalando dependencias del proyecto Asiste...
    pushd "%APP_ROOT%"
    call npm ci
    if errorlevel 1 (
        popd
        goto :error
    )
    popd
)

".venv\Scripts\python.exe" "piplines\publicar_corte_completo.py" --app-root "%APP_ROOT%"
if errorlevel 1 goto :error

echo.
echo Dashboard y reportes publicados y verificados.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:uso
echo Uso: 6_ACTUALIZAR_DASHBOARD_WEB.bat [--app-root RUTA] [--sin-pausa]
goto :error

:error
echo.
echo La publicacion no termino. Revisa el mensaje anterior y vuelve a
echo ejecutar este BAT; los archivos incompletos se retoman sin duplicar.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
