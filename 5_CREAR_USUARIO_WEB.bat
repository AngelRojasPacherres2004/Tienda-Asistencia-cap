@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo CREAR USUARIO PRIVADO DEL DASHBOARD WEB
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo ERROR: primero ejecuta 1_INSTALAR_REQUISITOS.bat
    goto :error
)

if not exist ".env.supabase.local" (
    echo ERROR: falta .env.supabase.local con las credenciales de Supabase.
    goto :error
)

".venv\Scripts\python.exe" "piplines\crear_usuario_dashboard.py"
if errorlevel 1 goto :error

echo.
echo Acceso creado correctamente.
pause
exit /b 0

:error
echo.
echo No se pudo crear el acceso.
pause
exit /b 1
