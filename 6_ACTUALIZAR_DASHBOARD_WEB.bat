@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo PUBLICAR DATOS EN EL DASHBOARD WEB
echo ============================================================
echo.
echo Este proceso publica en Supabase los datos ya generados.
echo No solicita la contrasena de Gmail, GitHub ni Netlify.
echo.

if not exist ".venv\Scripts\python.exe" (
    echo No existe el entorno local. Se ejecutara la instalacion.
    call "%~dp01_INSTALAR_REQUISITOS.bat" --sin-pausa
    if errorlevel 1 goto :error
)

if not exist "capa2\FactVentas.parquet" (
    echo ERROR: no existe capa2\FactVentas.parquet.
    echo Ejecuta primero 2_ACTUALIZAR_DATOS.bat.
    goto :error
)

if not exist "capa2\FactStock.parquet" (
    echo ERROR: no existe capa2\FactStock.parquet.
    echo Ejecuta primero 2_ACTUALIZAR_DATOS.bat.
    goto :error
)

echo Preparando los archivos web desde los Parquet actuales...
".venv\Scripts\python.exe" "piplines\generar_datos_web.py"
if errorlevel 1 goto :error

echo.
echo Ingresa el usuario publicador y su contrasena.
echo Usuario por defecto: Sistemas
echo La contrasena se oculta y no se guarda en este equipo.
echo.
".venv\Scripts\python.exe" "piplines\publicar_supabase.py" --interactive
if errorlevel 1 goto :error

echo.
echo ============================================================
echo DASHBOARD WEB ACTUALIZADO CORRECTAMENTE
echo Netlify detectara la nueva version sin volver a desplegar.
echo ============================================================
if /I not "%~1"=="--sin-pausa" pause
exit /b 0

:error
echo.
echo No se pudo actualizar el dashboard web. La version publicada
echo anteriormente permanece disponible y no fue reemplazada.
if /I not "%~1"=="--sin-pausa" pause
exit /b 1

