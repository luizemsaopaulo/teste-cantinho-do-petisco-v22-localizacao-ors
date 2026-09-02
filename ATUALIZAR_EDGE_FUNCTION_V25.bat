@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Cantinho do Petisco - Deploy V25 Pagamentos

echo ============================================================
echo   CANTINHO DO PETISCO - V25 - PAGAMENTOS
ECHO ============================================================
echo.
echo Este BAT publica as Edge Functions usadas por entrega e pagamento.
echo Antes, execute EXECUTAR_NO_SUPABASE_V25.sql no SQL Editor.
echo.

where node.exe >nul 2>&1 || goto :NO_NODE
where npx.cmd >nul 2>&1 || goto :NO_NPX

echo [1/4] Verificando login Supabase...
call npx.cmd --yes supabase@latest projects list >nul 2>&1
if errorlevel 1 (
  echo.
  echo A Supabase CLI precisa de login. Rode:
  echo   npx supabase login
  echo e execute este BAT novamente.
  goto :END
)

echo [2/4] Vinculando projeto...
call npx.cmd --yes supabase@latest link --project-ref ubhxzrfhokzkdndjlrwt
if errorlevel 1 goto :FAIL

echo [3/4] Publicando calc-delivery...
call npx.cmd --yes supabase@latest functions deploy calc-delivery --no-verify-jwt
if errorlevel 1 goto :FAIL

echo [4/4] Publicando create-payment...
call npx.cmd --yes supabase@latest functions deploy create-payment --no-verify-jwt
if errorlevel 1 goto :FAIL

echo.
echo OK - Funcoes V25 publicadas.
echo A ORS_API_KEY ja usada pelo delivery precisa continuar configurada nos Secrets.
goto :END

:NO_NODE
echo ERRO: Node.js nao encontrado.
goto :END
:NO_NPX
echo ERRO: npx nao encontrado.
goto :END
:FAIL
echo.
echo ERRO: o deploy nao foi concluido. Leia a mensagem acima.
:END
echo.
pause
