@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

rem La aplicacion unificada Asiste es la vista local actual. El Angular antiguo
rem queda disponible con --legacy para paquetes portables previos.
if /I "%~1"=="--legacy" goto :dashboard_legado
if exist "Tienda-Asistencia-cap\package.json" (
    if not exist "Tienda-Asistencia-cap\.env" (
        echo ERROR: falta la configuracion privada de Asiste.
        goto :error
    )
    where npm >nul 2>nul
    if errorlevel 1 (
        echo ERROR: instala Node.js para ejecutar Asiste localmente.
        goto :error
    )
    curl.exe --silent --fail --max-time 2 "http://127.0.0.1:5180/" >nul 2>nul
    if not errorlevel 1 (
        echo Asiste ya esta activo en http://127.0.0.1:5180/
        if /I not "%~1"=="--sin-navegador" start "" "http://127.0.0.1:5180/"
        exit /b 0
    )
    pushd "Tienda-Asistencia-cap"
    if not exist "node_modules\vite" (
        echo Instalando dependencias de Asiste...
        call npm ci
        if errorlevel 1 (
            popd
            goto :error
        )
    )
    echo Abriendo Asiste en http://127.0.0.1:5180/
    if /I not "%~1"=="--sin-navegador" start "" "http://127.0.0.1:5180/"
    call npm run dev
    if errorlevel 1 (
        popd
        goto :error
    )
    popd
    exit /b 0
)

:dashboard_legado
set "WEBROOT=dashboard-web\dist\dashboard-web\browser"

echo ============================================================
echo DASHBOARD WEB LOCAL - ALMACEN DE REMATES
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo No existe el entorno local. Se ejecutara la instalacion.
    call "%~dp01_INSTALAR_REQUISITOS.bat" --sin-pausa
    if errorlevel 1 goto :error
)

rem Si falta dist, intentar recuperarlo automaticamente en la PC de desarrollo.
if not exist "%WEBROOT%\index.html" (
    echo No se encontro la version compilada del dashboard.
    echo Intentando compilar dashboard-web automaticamente...

    where npm >nul 2>nul
    if errorlevel 1 (
        echo.
        echo ERROR: No existe %WEBROOT%\index.html y tampoco se encontro npm.
        echo Este paquete fue creado sin dashboard-web\dist.
        echo Vuelve a la PC de desarrollo, ejecuta 3_CREAR_PAQUETE_PORTABLE.bat
        echo corregido y vuelve a copiar el ZIP generado.
        goto :error
    )

    pushd "dashboard-web"
    if not exist "node_modules" (
        echo Instalando dependencias Angular...
        call npm ci
        if errorlevel 1 (
            popd
            goto :error
        )
    )
    echo Compilando dashboard web...
    call npm run build
    if errorlevel 1 (
        popd
        goto :error
    )
    popd
)

if not exist "%WEBROOT%\index.html" (
    echo ERROR: No se pudo generar la version compilada del dashboard.
    goto :error
)

rem Localhost debe leer los JSON generados en este equipo, no la version de Supabase.
if not exist "dashboard-web\public\runtime-config.local.js" (
    echo ERROR: Falta dashboard-web\public\runtime-config.local.js.
    goto :error
)
copy /Y "dashboard-web\public\runtime-config.local.js" "%WEBROOT%\runtime-config.js" >nul
if errorlevel 1 (
    echo ERROR: No se pudo activar la configuracion local del dashboard.
    goto :error
)

if exist "capa2\FactVentas.parquet" if exist "capa2\FactStock.parquet" (
    echo Actualizando la web con los Parquet actuales...
    ".venv\Scripts\python.exe" "piplines\generar_datos_web.py"
    if errorlevel 1 goto :error

    rem El generador escribe en public. Sin recompilar Angular, sincronizamos
    rem solamente los datos JSON con la carpeta dist que se sirve localmente.
    if exist "dashboard-web\public\assets\data" (
        if not exist "%WEBROOT%\assets\data" mkdir "%WEBROOT%\assets\data"
        xcopy /E /I /Y /Q "dashboard-web\public\assets\data\*" "%WEBROOT%\assets\data\" >nul
        if errorlevel 1 goto :error
    )
) else (
    echo No existe Capa 2; se usaran los datos incluidos en la version compilada.
    echo Para reconstruir todo primero ejecuta 2_ACTUALIZAR_DATOS.bat.
)

if not exist "%WEBROOT%\assets\data\dashboard.json" (
    echo ERROR: No existen datos para mostrar.
    echo Ejecuta 2_ACTUALIZAR_DATOS.bat.
    goto :error
)

echo.
echo Abriendo http://127.0.0.1:4200/
echo Esta ventana mantiene el dashboard activo.
echo Para cerrarlo, vuelve aqui y presiona Ctrl+C.
echo.

if /I not "%~1"=="--sin-navegador" start "" "http://127.0.0.1:4200/"
".venv\Scripts\python.exe" "piplines\servidor_dashboard.py" --port 4200 --directory "%WEBROOT%"
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo No se pudo abrir el dashboard web local.
pause
exit /b 1
