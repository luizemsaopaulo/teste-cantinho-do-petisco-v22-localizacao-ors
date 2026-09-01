@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title Cantinho do Petisco - Supabase V23 - Corrigido

set "PROJECT_REF=ubhxzrfhokzkdndjlrwt"
set "FUNCTION_NAME=calc-delivery"
set "TOKEN_URL=https://supabase.com/dashboard/account/tokens"
set "LOG=%~dp0CONFIGURAR_SUPABASE_V23_CORRIGIDO.log"

> "%LOG%" echo Cantinho do Petisco - V23 - configuracao Supabase
>>"%LOG%" echo Inicio: %DATE% %TIME%

echo.
echo ============================================================
echo   CANTINHO DO PETISCO - V23 - SUPABASE
echo ============================================================
echo.
echo Este BAT corrige o login que ficava parado esperando
echo o navegador abrir automaticamente.
echo.
echo Agora o BAT abre a pagina de tokens do Supabase diretamente
echo e usa o modo de login manual oficial da CLI.
echo.
echo A chave ORS sera digitada de forma oculta e enviada apenas
echo para os Secrets do Supabase.
echo.

rem ------------------------------------------------------------
rem 1. Pre-requisitos
rem ------------------------------------------------------------
where node.exe >nul 2>&1
if errorlevel 1 goto :NO_NODE

where npx.cmd >nul 2>&1
if errorlevel 1 goto :NO_NPX

set "NODE_MAJOR="
for /f "tokens=1 delims=." %%V in ('node.exe --version 2^>nul') do set "NODE_MAJOR=%%V"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if not defined NODE_MAJOR goto :NO_NODE
set /a NODE_MAJOR_NUM=%NODE_MAJOR% >nul 2>&1
if errorlevel 1 goto :NO_NODE
if %NODE_MAJOR_NUM% LSS 20 goto :OLD_NODE

if not exist "%~dp0supabase\functions\%FUNCTION_NAME%\index.ts" goto :NO_FUNCTION

echo [1/5] Verificando Supabase CLI...
>>"%LOG%" echo [1/5] Verificando Supabase CLI
call npx.cmd --yes supabase@latest --version
if errorlevel 1 goto :CLI_FAIL

rem ------------------------------------------------------------
rem 2. Login
rem ------------------------------------------------------------
echo.
echo [2/5] Verificando se voce ja esta autenticado no Supabase...
>>"%LOG%" echo [2/5] Verificando autenticacao
call npx.cmd --yes supabase@latest projects list --output json >nul 2>&1
if not errorlevel 1 goto :AUTH_OK

echo.
echo Nao encontrei um login valido da Supabase CLI.
echo.
echo Vou abrir esta pagina no navegador:
echo %TOKEN_URL%
echo.
echo Crie um Personal Access Token nessa pagina.
echo Depois volte para esta janela.
echo.
>>"%LOG%" echo Login necessario - abrindo pagina de tokens

rundll32.exe url.dll,FileProtocolHandler "%TOKEN_URL%" >nul 2>&1
if not errorlevel 1 goto :TOKEN_PAGE_REQUESTED
start "" "%TOKEN_URL%" >nul 2>&1

:TOKEN_PAGE_REQUESTED
echo.
echo IMPORTANTE:
echo 1. No navegador, clique para gerar um novo token.
echo 2. Pode dar o nome: Cantinho V23.
echo 3. Copie o token gerado.
echo 4. Volte para esta janela.
echo.
echo A CLI vai pedir o token aqui. Ao colar, ele fica mascarado.
echo.
call npx.cmd --yes supabase@latest login --no-browser
if errorlevel 1 goto :LOGIN_FAIL

call npx.cmd --yes supabase@latest projects list --output json >nul 2>&1
if errorlevel 1 goto :LOGIN_FAIL

:AUTH_OK
echo Login Supabase: OK
>>"%LOG%" echo Login Supabase: OK

rem ------------------------------------------------------------
rem 3. Chave ORS - prompt oculto e arquivo temporario
rem ------------------------------------------------------------
echo.
echo [3/5] Informe a chave OpenRouteService / HeiGIT.
echo Ela NAO sera mostrada na tela e NAO sera salva no projeto.
>>"%LOG%" echo [3/5] Recebendo ORS_API_KEY de forma oculta

set "ORS_ENV=%TEMP%\cantinho-ors-%RANDOM%-%RANDOM%.env"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=Read-Host 'Cole a ORS_API_KEY' -AsSecureString; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { $p=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b); if([string]::IsNullOrWhiteSpace($p)){exit 2}; [IO.File]::WriteAllText($env:ORS_ENV,('ORS_API_KEY='+$p+[Environment]::NewLine),(New-Object System.Text.UTF8Encoding($false))) } finally { if($b -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)} }"
if errorlevel 1 goto :ORS_INPUT_FAIL
if not exist "%ORS_ENV%" goto :ORS_INPUT_FAIL

echo Enviando ORS_API_KEY para os Secrets do Supabase...
call npx.cmd --yes supabase@latest secrets set --env-file "%ORS_ENV%" --project-ref "%PROJECT_REF%"
set "SECRET_RC=%ERRORLEVEL%"
del /q "%ORS_ENV%" >nul 2>&1
set "ORS_ENV="
if not "%SECRET_RC%"=="0" goto :SECRET_FAIL

rem ------------------------------------------------------------
rem 4. Confirma o Secret sem exibir o valor
rem ------------------------------------------------------------
echo.
echo [4/5] Confirmando que o Secret foi criado...
>>"%LOG%" echo [4/5] Verificando ORS_API_KEY no Supabase
set "SECRET_LIST=%TEMP%\cantinho-secrets-%RANDOM%-%RANDOM%.txt"
call npx.cmd --yes supabase@latest secrets list --project-ref "%PROJECT_REF%" > "%SECRET_LIST%" 2>&1
if errorlevel 1 goto :SECRET_LIST_FAIL
findstr /I /C:"ORS_API_KEY" "%SECRET_LIST%" >nul 2>&1
if errorlevel 1 goto :SECRET_NOT_FOUND
del /q "%SECRET_LIST%" >nul 2>&1
set "SECRET_LIST="
echo Secret ORS_API_KEY: OK
>>"%LOG%" echo Secret ORS_API_KEY: OK

rem ------------------------------------------------------------
rem 5. Deploy da Edge Function
rem ------------------------------------------------------------
echo.
echo [5/5] Publicando Edge Function %FUNCTION_NAME%...
>>"%LOG%" echo [5/5] Deploy da Edge Function
call npx.cmd --yes supabase@latest functions deploy "%FUNCTION_NAME%" --project-ref "%PROJECT_REF%" --no-verify-jwt --use-api
if errorlevel 1 goto :DEPLOY_FAIL

echo.
echo Testando se a funcao publicada aceita CORS do GitHub Pages...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$u='https://%PROJECT_REF%.supabase.co/functions/v1/%FUNCTION_NAME%'; try { $h=@{Origin='https://luizemsaopaulo.github.io';'Access-Control-Request-Method'='POST';'Access-Control-Request-Headers'='content-type,apikey,x-cantinho-client'}; $r=Invoke-WebRequest -UseBasicParsing -Method Options -Uri $u -Headers $h -TimeoutSec 25; if($r.StatusCode -eq 200 -or $r.StatusCode -eq 204){exit 0}; exit 3 } catch { Write-Host ('Teste CORS: '+$_.Exception.Message); exit 4 }"
if errorlevel 1 goto :CORS_WARNING

:CORS_OK
echo Teste CORS: OK
>>"%LOG%" echo Teste CORS: OK
goto :SUCCESS

:CORS_WARNING
echo.
echo AVISO: o deploy terminou, mas o teste CORS nao confirmou.
echo Isso pode ser apenas bloqueio temporario de rede.
echo A configuracao do Secret e o deploy foram concluidos.
>>"%LOG%" echo AVISO: teste CORS nao confirmou
goto :SUCCESS

:SUCCESS
echo.
echo ============================================================
echo   PRONTO
echo ============================================================
echo Secret ORS_API_KEY: configurado
echo Edge Function calc-delivery: publicada
echo Chave ORS no GitHub: NAO
echo.
echo Agora voce pode publicar a V23 no GitHub Pages.
echo.
>>"%LOG%" echo Concluido: %DATE% %TIME%
pause
exit /b 0

rem ------------------------------------------------------------
rem Erros
rem ------------------------------------------------------------
:NO_NODE
echo.
echo ERRO: Node.js nao foi encontrado.
echo Instale Node.js 20 ou superior e rode novamente.
>>"%LOG%" echo ERRO: Node.js nao encontrado
goto :FAIL

:NO_NPX
echo.
echo ERRO: npx nao foi encontrado.
echo Reinstale/atualize o Node.js e rode novamente.
>>"%LOG%" echo ERRO: npx nao encontrado
goto :FAIL

:OLD_NODE
echo.
echo ERRO: Node.js %NODE_MAJOR_NUM% detectado.
echo E necessario Node.js 20 ou superior.
>>"%LOG%" echo ERRO: Node.js antigo
goto :FAIL

:NO_FUNCTION
echo.
echo ERRO: nao encontrei:
echo supabase\functions\%FUNCTION_NAME%\index.ts
echo.
echo Coloque este BAT dentro da pasta principal da V23,
echo no mesmo lugar onde ficam index.html e a pasta supabase.
>>"%LOG%" echo ERRO: Edge Function nao encontrada na pasta do BAT
goto :FAIL

:CLI_FAIL
echo.
echo ERRO: a Supabase CLI nao iniciou corretamente.
>>"%LOG%" echo ERRO: Supabase CLI
goto :FAIL

:LOGIN_FAIL
echo.
echo ERRO: o login no Supabase nao foi concluido.
echo.
echo Abra manualmente:
echo %TOKEN_URL%
echo Gere um token e execute o BAT novamente.
>>"%LOG%" echo ERRO: login Supabase
goto :FAIL

:ORS_INPUT_FAIL
if defined ORS_ENV del /q "%ORS_ENV%" >nul 2>&1
set "ORS_ENV="
echo.
echo ERRO: a chave ORS nao foi informada.
>>"%LOG%" echo ERRO: chave ORS vazia
goto :FAIL

:SECRET_FAIL
echo.
echo ERRO: nao foi possivel salvar ORS_API_KEY nos Secrets.
>>"%LOG%" echo ERRO: secrets set falhou
goto :FAIL

:SECRET_LIST_FAIL
if defined SECRET_LIST del /q "%SECRET_LIST%" >nul 2>&1
set "SECRET_LIST="
echo.
echo ERRO: nao consegui consultar os Secrets do projeto.
>>"%LOG%" echo ERRO: secrets list falhou
goto :FAIL

:SECRET_NOT_FOUND
if defined SECRET_LIST del /q "%SECRET_LIST%" >nul 2>&1
set "SECRET_LIST="
echo.
echo ERRO: ORS_API_KEY nao apareceu na lista de Secrets.
>>"%LOG%" echo ERRO: ORS_API_KEY nao confirmada
goto :FAIL

:DEPLOY_FAIL
echo.
echo ERRO: falha ao publicar a Edge Function.
>>"%LOG%" echo ERRO: deploy da Edge Function
goto :FAIL

:FAIL
echo.
echo Consulte o log:
echo %LOG%
echo.
pause
exit /b 1
