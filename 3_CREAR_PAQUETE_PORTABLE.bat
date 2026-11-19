@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

rem Al abrir con doble clic se conserva el avance visible sin detenerse en
rem un "Presione una tecla"; la consola se puede cerrar al finalizar.
if /I not "%~1"=="--sin-pausa" (
    start "Dashboard General · Paquete portable" cmd.exe /d /k call "%~f0" --sin-pausa
    exit /b 0
)

set "SIN_PAUSA=0"
if /I "%~1"=="--sin-pausa" set "SIN_PAUSA=1"

if not exist "piplines\VERSION.txt" (
    echo ERROR: falta piplines\VERSION.txt.
    goto :error
)
set /p "VERSION=" < "piplines\VERSION.txt"
if not defined VERSION (
    echo ERROR: la version del paquete esta vacia.
    goto :error
)

where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: se requiere Windows PowerShell para crear el ZIP.
    goto :error
)

echo ============================================================
echo CREAR PAQUETE PORTABLE
echo ============================================================
echo El ZIP incluye .env y el historico tecnico de Capa 1/Capa 2.
echo No incluye Excel RMS antiguos: solo se cargan entregas nuevas por periodo.
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo AVISO: Node.js no esta disponible. El paquete se creara sin dist\.
    echo En la otra PC ejecuta 1_INSTALAR_REQUISITOS.bat antes de abrir la web.
) else (
    if not exist "node_modules\vite\bin\vite.js" (
        echo Instalando dependencias para compilar la interfaz...
        call npm ci
        if errorlevel 1 goto :error
    )
    echo Compilando la interfaz incluida en el paquete...
    call npm run build
    if errorlevel 1 goto :error
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "piplines\crear_paquete_portable.ps1" -Root "%CD%" -Version "%VERSION%"
if errorlevel 1 goto :error

echo.
echo ============================================================
echo PAQUETE CREADO CORRECTAMENTE
echo Ubicacion: paquetes_portables\DashboardGeneral_Portable_v%VERSION%.zip
echo ============================================================
if "%SIN_PAUSA%"=="0" (
    start "" explorer.exe "%CD%\paquetes_portables"
)
exit /b 0

:error
echo.
echo No se pudo crear el paquete portable. Revisa el ultimo mensaje.
exit /b 1
