@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Cantinho do Petisco - Abrir localmente

where py >nul 2>nul
if %errorlevel%==0 (
  set "PY=py"
) else (
  where python >nul 2>nul
  if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Python nao foi encontrado no computador.
    echo Instale o Python e marque a opcao "Add Python to PATH".
    echo.
    pause
    exit /b 1
  )
  set "PY=python"
)

for /f %%P in ('powershell -NoProfile -Command "$l=[System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$l.Start();$p=$l.LocalEndpoint.Port;$l.Stop();$p"') do set "PORT=%%P"
if not defined PORT set "PORT=8765"

echo ============================================================
echo          CANTINHO DO PETISCO - ABRIR LOCALMENTE
echo ============================================================
echo.
echo   1 - Delivery e retirada
echo   2 - Cardapio para uso no restaurante
echo   3 - Painel administrativo
echo   4 - Abrir os tres
echo.
set /p "OPCAO=Escolha uma opcao [1-4]: "

start "Cantinho do Petisco - servidor" /min cmd /c "%PY% -m http.server %PORT% --bind 127.0.0.1"
timeout /t 2 /nobreak >nul

if "%OPCAO%"=="2" goto RESTAURANTE
if "%OPCAO%"=="3" goto ADMIN
if "%OPCAO%"=="4" goto TODOS

:DELIVERY
start "" "http://127.0.0.1:%PORT%/index.html"
goto FIM

:RESTAURANTE
start "" "http://127.0.0.1:%PORT%/restaurante.html"
goto FIM

:ADMIN
start "" "http://127.0.0.1:%PORT%/admin.html"
goto FIM

:TODOS
start "" "http://127.0.0.1:%PORT%/index.html"
start "" "http://127.0.0.1:%PORT%/restaurante.html"
start "" "http://127.0.0.1:%PORT%/admin.html"

:FIM
echo.
echo Servidor local: http://127.0.0.1:%PORT%/
echo O servidor abriu em uma janela minimizada.
echo.
pause
