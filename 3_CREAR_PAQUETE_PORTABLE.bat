@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "WEBROOT=commercial-dashboard\dist\dashboard-web\browser"
set "PARQUET_C1_OK=1"

echo ============================================================
echo PAQUETE PORTABLE - DASHBOARD GENERAL
echo ============================================================
echo.

if not exist "piplines\VERSION.txt" (
    echo ERROR: No se encontro piplines\VERSION.txt.
    goto :error
)

set /p "VERSION=" < "piplines\VERSION.txt"
set "ZIP=DashboardGeneral_Portable_v%VERSION%.zip"

where tar.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: No se encontro tar.exe. Usa Windows 10 u 11 actualizado.
    goto :error
)

rem El portable DEBE incluir dist. Si no existe, compilar antes de empaquetar.
if not exist "%WEBROOT%\index.html" (
    echo No existe la version compilada del dashboard. Se compilara ahora...

    where npm >nul 2>nul
    if errorlevel 1 (
        echo ERROR: No se encontro npm. Instala Node.js antes de crear el portable.
        goto :error
    )

    pushd "commercial-dashboard"
    if not exist "node_modules" (
        echo Instalando dependencias Angular...
        call npm ci
        if errorlevel 1 (
            popd
            goto :error
        )
    )
    echo Compilando Angular...
    call npm run build
    if errorlevel 1 (
        popd
        goto :error
    )
    popd
)

if not exist "%WEBROOT%\index.html" (
    echo ERROR: npm run build no genero %WEBROOT%\index.html
    goto :error
)

rem Capa 1 es el minimo reutilizable para reconstruir Capa 2 en otra PC sin
rem volver a procesar los Excel RMS. El BAT anterior solo copiaba los XLSX.
for %%P in (
    "capa1\Fact_Ventas.parquet"
    "capa1\Fact_Ingresos.parquet"
    "capa1\Fact_Transferencias.parquet"
    "capa1\Fact_Stock.parquet"
) do (
    if not exist "%%~P" (
        echo ERROR: Falta el Parquet operativo %%~P
        set "PARQUET_C1_OK=0"
    )
)
if "%PARQUET_C1_OK%"=="0" (
    echo Ejecuta primero 2_ACTUALIZAR_DATOS.bat y vuelve a crear el portable.
    goto :error
)

rem Asegurar que los datos actuales de public tambien esten dentro de dist.
if exist "commercial-dashboard\public\assets\data" (
    if not exist "%WEBROOT%\assets\data" mkdir "%WEBROOT%\assets\data"
    xcopy /E /I /Y /Q "commercial-dashboard\public\assets\data\*" "%WEBROOT%\assets\data\" >nul
    if errorlevel 1 goto :error
)

for %%Z in (DashboardGeneral_Portable_v*.zip) do (
    if /I not "%%~nxZ"=="%ZIP%" del /q "%%~fZ"
)
if exist "%ZIP%" del /q "%ZIP%"

echo Creando %ZIP% ...
rem Una sola linea: evita que CMD interprete accidentalmente un BAT listado
rem como si fuera el siguiente comando cuando una continuacion se corrompe.
tar.exe -a -c -f "%ZIP%" --exclude="piplines/**pycache**" --exclude="commercial-dashboard/node_modules" --exclude="commercial-dashboard/.angular" --exclude="commercial-dashboard/.netlify" --exclude="commercial-dashboard/.vscode" --exclude="commercial-dashboard/public/assets/data" --exclude="commercial-dashboard/src.zip" "0_ABRIR_PANEL.bat" "1_INSTALAR_REQUISITOS.bat" "2_ACTUALIZAR_DATOS.bat" "3_CREAR_PAQUETE_PORTABLE.bat" "4_EJECUTAR_DASHBOARD_WEB.bat" "5_CREAR_USUARIO_WEB.bat" "6_ACTUALIZAR_DASHBOARD_WEB.bat" "7_ACTUALIZAR_TODO.bat" "README.md" "Manual_Actualizacion_Dashboard_Comercial.docx" "ARQUITECTURA_NUBE.md" "netlify.toml" "input" "capa1" "capa2" "piplines" "supabase" "commercial-dashboard"
if errorlevel 1 goto :error

for %%Z in ("%ZIP%") do set "ZIP_BYTES=%%~zZ"
echo.
echo ============================================================
echo PAQUETE CREADO
echo Archivo: %ZIP%
echo Tamano en bytes: %ZIP_BYTES%
echo.
echo IMPORTANTE: el ZIP ya contiene commercial-dashboard\dist compilado.
echo Tambien contiene los Parquet operativos de capa1 y los resultados
echo disponibles de capa2, ademas del manual Word de actualizacion.
echo En otra PC: extraer, ejecutar 1_INSTALAR_REQUISITOS.bat y luego
echo 0_ABRIR_PANEL.bat. Para abrir la web, ejecutar
echo 4_EJECUTAR_DASHBOARD_WEB.bat.
echo Para publicar desde otra PC tambien necesitas el archivo .env privado
echo de Asiste en la raiz del proyecto unificado.
echo El ZIP nunca incluye claves de Supabase.
echo ============================================================
if /I not "%~1"=="--sin-pausa" pause
exit /b 0

:error
echo.
echo No se pudo crear el paquete portable.
if /I not "%~1"=="--sin-pausa" pause
exit /b 1
