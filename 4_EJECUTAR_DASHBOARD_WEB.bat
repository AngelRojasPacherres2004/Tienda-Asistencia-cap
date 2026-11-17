@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

if not exist "package.json" (
    echo ERROR: falta el proyecto React.
    goto :error
)
if not exist ".env" (
    echo ERROR: falta la configuracion privada .env de Asiste.
    goto :error
)
where curl.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: falta curl.exe de Windows para verificar el dashboard local.
    goto :error
)
where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: instala Node.js para ejecutar Asiste.
    goto :error
)
if not exist "node_modules\vite" (
    echo Instalando dependencias de React...
    call npm ci
    if errorlevel 1 goto :error
)
call :listo
if not errorlevel 1 goto :abrir

call :web_lista
if errorlevel 1 (set "WEB_LISTA=0") else (set "WEB_LISTA=1")
call :api_lista
if errorlevel 1 (set "API_LISTA=0") else (set "API_LISTA=1")

rem Recupera una ejecución incompleta sin duplicar el servicio que sí funciona.
if "%WEB_LISTA%"=="1" (
    call :puerto_ocupado 8788
    if not errorlevel 1 goto :incompleto
    set "ARRANQUE=npm run dev:api"
    goto :iniciar
)
if "%API_LISTA%"=="1" (
    call :puerto_ocupado 5180
    if not errorlevel 1 goto :incompleto
    set "ARRANQUE=npm run dev:web"
    goto :iniciar
)

rem Ningún servicio está sano: solo se inicia el conjunto completo si ambos
rem puertos están libres. Así nunca se abre una copia parcial o en otro puerto.
call :puerto_ocupado 5180
if not errorlevel 1 goto :incompleto
call :puerto_ocupado 8788
if not errorlevel 1 goto :incompleto
set "ARRANQUE=npm run dev"

:iniciar
echo Iniciando dashboard local...
start "Dashboard General - Local" /min cmd.exe /d /k "call %ARRANQUE%"
set /a INTENTOS=0

:esperar
ping.exe 127.0.0.1 -n 2 >nul
set /a INTENTOS+=1
call :listo
if not errorlevel 1 goto :abrir
if %INTENTOS% LSS 35 goto :esperar

echo.
echo El dashboard no termino de iniciar. Revisa la ventana "Dashboard General - Local".
goto :error

:abrir
echo Dashboard local listo en http://127.0.0.1:5180/
if /I not "%~1"=="--sin-navegador" start "" "http://127.0.0.1:5180/"
exit /b 0

:listo
call :web_lista
if errorlevel 1 exit /b 1
call :api_lista
if errorlevel 1 exit /b 1
exit /b 0

:web_lista
curl.exe --silent --fail --max-time 2 "http://127.0.0.1:5180/" >nul 2>nul
exit /b %errorlevel%

:api_lista
curl.exe --silent --fail --max-time 3 "http://127.0.0.1:8788/health" >nul 2>nul
exit /b %errorlevel%

:puerto_ocupado
powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %~1 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:incompleto
echo.
echo Hay un proceso local incompleto ocupando el puerto 5180 o 8788.
echo Cierra la ventana anterior de Dashboard General y vuelve a ejecutar este archivo.
goto :error

:error
echo.
echo No se pudo abrir el dashboard local.
pause
exit /b 1
