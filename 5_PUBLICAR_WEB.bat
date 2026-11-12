@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "PERIODO="
set "FECHA_CORTE="
set "SIN_PAUSA=0"

:args
if "%~1"=="" goto :run
if /I "%~1"=="--periodo" (
    set "PERIODO=%~2"
    shift & shift & goto :args
)
if /I "%~1"=="--fecha-corte" (
    set "FECHA_CORTE=%~2"
    shift & shift & goto :args
)
if /I "%~1"=="--sin-pausa" (
    set "SIN_PAUSA=1"
    shift & goto :args
)
echo ERROR: argumento no reconocido: %~1
goto :error

:run
if not defined PERIODO (
    echo ERROR: indica --periodo AAAAMM.
    goto :error
)
if not defined FECHA_CORTE (
    echo ERROR: indica --fecha-corte AAAA-MM-DD.
    goto :error
)
if not exist ".venv\Scripts\python.exe" (
    echo ERROR: ejecuta primero 1_INSTALAR_REQUISITOS.bat.
    goto :error
)

".venv\Scripts\python.exe" "piplines\publicar_web_local.py" --periodo "%PERIODO%" --fecha-corte "%FECHA_CORTE%"
if errorlevel 1 goto :error

echo.
echo Publicacion web completada.
if "%SIN_PAUSA%"=="0" pause
exit /b 0

:error
echo.
echo La publicacion no se completo. El dashboard publicado no fue reemplazado.
if "%SIN_PAUSA%"=="0" pause
exit /b 1
