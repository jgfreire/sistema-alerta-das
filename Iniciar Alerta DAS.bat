@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
set "PROJECT_DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js 22 ou superior e tente de novo.
  pause
  exit /b 1
)

node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"
if errorlevel 1 (
  echo O Node.js instalado e antigo. O Alerta DAS precisa do Node.js 22 ou mais novo.
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%server\.env" (
  echo Falta o arquivo server\.env. Copie o server\.env do computador de origem para esta pasta ^(ele nao vai pelo GitHub^).
  pause
  exit /b 1
)

rem A porta e a do proprio servidor (PORT no server\.env); o .bat so le, nao define nem altera nada.
set "PORT=3000"
for /f "usebackq tokens=2 delims==" %%a in (`findstr /B /C:"PORT=" "%PROJECT_DIR%server\.env"`) do set "PORT=%%a"
set "URL=http://localhost:%PORT%"

if not exist "%PROJECT_DIR%server\node_modules" (
  echo Instalando dependencias, aguarde...
  pushd "%PROJECT_DIR%server"
  call npm install
  popd
)

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo O servidor ja esta rodando.
  goto abrir
)

start "Alerta DAS - Servidor" /min cmd /c "cd /d "%PROJECT_DIR%server" && npm start"
timeout /t 4 /nobreak >nul

:abrir
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=%URL%
) else (
  start "" "%URL%"
)
endlocal
