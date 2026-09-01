@echo off
setlocal
cd /d "%~dp0"
title Cantinho do Petisco - Configurar Edge Function V23
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURAR_SUPABASE_V23.ps1"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo ==============================================
  echo CONFIGURACAO CONCLUIDA.
  echo Agora publique a V23 no GitHub Pages.
  echo ==============================================
) else (
  echo ==============================================
  echo A CONFIGURACAO NAO FOI CONCLUIDA.
  echo Codigo: %RC%
  echo Veja CONFIGURAR_PELO_DASHBOARD_V23.txt.
  echo ==============================================
)
pause
exit /b %RC%
