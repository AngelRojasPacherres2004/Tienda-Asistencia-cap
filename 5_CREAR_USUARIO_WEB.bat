@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo USUARIOS Y ROLES - ASISTE
echo ============================================================
echo.
echo Los usuarios ahora se administran desde el modulo Usuarios de Asiste,
echo sujeto a los permisos de cada rol y tienda.
echo.
echo Este BAT anterior creaba cuentas en la base antigua del dashboard.
echo Se desactivo para evitar escribir en el proyecto Supabase equivocado.
echo No se creo ni modifico ningun usuario.
echo.
if /I not "%~1"=="--sin-pausa" pause
exit /b 1
