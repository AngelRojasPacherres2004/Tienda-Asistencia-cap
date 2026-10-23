@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if exist ".venv\Scripts\pythonw.exe" (
    start "" ".venv\Scripts\pythonw.exe" "piplines\panel_control.py"
    exit /b 0
)

where pyw.exe >nul 2>nul
if not errorlevel 1 (
    start "" pyw.exe -3 "piplines\panel_control.py"
    exit /b 0
)

echo No se encontro Python. Ejecuta primero 1_INSTALAR_REQUISITOS.bat.
pause
exit /b 1
