@echo off
setlocal EnableExtensions
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

for %%D in ("input" "capa1" "capa2") do (
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

".venv\Scripts\python.exe" "piplines\auditar_codigo.py"
if errorlevel 1 goto :error

echo.
echo ============================================================
echo INSTALACION COMPLETADA
echo Ahora ejecuta: 2_ACTUALIZAR_DATOS.bat
echo ============================================================
if /I not "%~1"=="--sin-pausa" pause
exit /b 0

:error
echo.
echo La instalacion no pudo completarse. Revisa el mensaje anterior.
if /I not "%~1"=="--sin-pausa" pause
exit /b 1
