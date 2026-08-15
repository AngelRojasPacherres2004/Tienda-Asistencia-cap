@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "WEBROOT=dashboard-web\dist\dashboard-web\browser"

echo ============================================================
echo ACTUALIZACION COMPLETA - DASHBOARD GENERAL
echo ============================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo No existe el entorno virtual. Se ejecutara la instalacion.
    call "%~dp01_INSTALAR_REQUISITOS.bat" --sin-pausa
    if errorlevel 1 goto :error
)

for /f "delims=" %%F in ('.venv\Scripts\python.exe -c "from datetime import date; print(date.today().year)"') do set "ANIO_FIN=%%F"

echo.
echo Se reconstruiran Capa 1, Capa 2 y el modelo TMDL.
echo La fecha comercial del STOCK se igualara automaticamente a la
echo ultima fecha disponible en ventas.
echo.

".venv\Scripts\python.exe" "piplines\ejecutar_todo.py" ^
    --reconstruir-capa1 ^
    --paralelismo 2 ^
    --anio-inicio 2024 ^
    --anio-fin "%ANIO_FIN%"
if errorlevel 1 goto :error

echo Ejecutando validacion estricta final...
".venv\Scripts\python.exe" "piplines\validar_modelo.py" --estricto
if errorlevel 1 goto :error

if exist "dashboard-web\public" (
    echo Actualizando datos compactos del dashboard web...
    ".venv\Scripts\python.exe" "piplines\generar_datos_web.py"
    if errorlevel 1 goto :error

    echo Datos locales preparados.
    echo Para publicarlos en Internet ejecuta 6_ACTUALIZAR_DASHBOARD_WEB.bat.

    rem Si todavia no existe una compilacion, crearla una sola vez.
    if not exist "%WEBROOT%\index.html" (
        echo.
        echo No existe dashboard-web\dist. Compilando Angular...
        where npm >nul 2>nul
        if errorlevel 1 (
            echo ERROR: No se encontro npm. Instala Node.js o compila la web en la PC de desarrollo.
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

    rem El generador actualiza public; copiar los JSON a la compilacion ya creada.
    if exist "dashboard-web\public\assets\data" if exist "%WEBROOT%\assets" (
        if not exist "%WEBROOT%\assets\data" mkdir "%WEBROOT%\assets\data"
        xcopy /E /I /Y /Q "dashboard-web\public\assets\data\*" "%WEBROOT%\assets\data\" >nul
        if errorlevel 1 goto :error
    )
)

if not exist "%WEBROOT%\index.html" (
    echo ERROR: La actualizacion termino, pero no existe la compilacion web.
    goto :error
)

echo.
echo ============================================================
echo ACTUALIZACION COMPLETADA
echo Parquet finales: capa2
echo Modelo Power BI: capa2\Modelo_Dashboard.tmdl
echo Dashboard web: ejecutar 4_EJECUTAR_DASHBOARD_WEB.bat
echo ============================================================
if /I not "%~1"=="--sin-pausa" pause
exit /b 0

:error
echo.
echo La actualizacion no pudo completarse. Los resultados anteriores se
echo conservan mediante el respaldo automatico de la pipeline.
if /I not "%~1"=="--sin-pausa" pause
exit /b 1
