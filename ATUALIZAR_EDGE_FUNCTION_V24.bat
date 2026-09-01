@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Cantinho do Petisco - Atualizar Supabase V24
set "PROJECT_REF=ubhxzrfhokzkdndjlrwt"
set "FUNCTION_NAME=calc-delivery"
echo.
echo ============================================================
echo   CANTINHO DO PETISCO - V24 - EDGE FUNCTION
echo ============================================================
echo.
if not exist "%~dp0supabase\functions\%FUNCTION_NAME%\index.ts" goto :nofile
where npx.cmd >nul 2>&1 || goto :nonpx
echo Publicando calc-delivery V24...
call npx.cmd --yes supabase@latest functions deploy %FUNCTION_NAME% --project-ref %PROJECT_REF% --no-verify-jwt --use-api
if errorlevel 1 goto :fail
echo.
echo PRONTO: Edge Function V24 publicada.
echo.
echo IMPORTANTE: a tabela delivery_settings precisa existir.
echo Se ainda nao executou, abra EXECUTAR_NO_SUPABASE_V24.sql no SQL Editor do Supabase.
pause
exit /b 0
:nofile
echo ERRO: nao encontrei supabase\functions\calc-delivery\index.ts
goto :fail
:nonpx
echo ERRO: npx nao encontrado. Instale Node.js 20 ou superior.
:fail
echo.
echo Falha ao publicar.
pause
exit /b 1
