@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
set "PROJECT_DIR=%~dp0"
set "URL=http://localhost:3200"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js 22 ou superior e tente de novo.
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%server\.env" (
  echo Falta o arquivo server\.env. Copie server\.env.example para server\.env e preencha.
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%server\node_modules" (
  echo Instalando dependencias, aguarde...
  pushd "%PROJECT_DIR%server"
  call npm install
  popd
)

netstat -ano | findstr /R /C:":3200 .*LISTENING" >nul
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
