$ErrorActionPreference = 'Stop'
$projectRef = 'ubhxzrfhokzkdndjlrwt'
$functionName = 'calc-delivery'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Run-NpxSupabase([string[]]$Arguments) {
    & npx.cmd --yes supabase@latest @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Supabase CLI falhou: $($Arguments -join ' ')" }
}

try {
    $nodeText = (& node.exe --version 2>$null)
    if (-not $nodeText) { throw 'Node.js não encontrado. Use o método do Dashboard.' }
    $major = [int](($nodeText -replace '^v','').Split('.')[0])
    if ($major -lt 20) { throw "Node.js $nodeText detectado. É necessário Node.js 20 ou superior." }

    Write-Host 'Cantinho do Petisco - V23' -ForegroundColor Cyan
    Write-Host 'A chave ORS será enviada diretamente aos Secrets do Supabase e não será salva no projeto.'
    Write-Host ''

    Run-NpxSupabase @('--version')
    Write-Host ''
    Write-Host '1/4 - Login no Supabase...' -ForegroundColor Yellow
    Run-NpxSupabase @('login')

    Write-Host '2/4 - Vinculando projeto...' -ForegroundColor Yellow
    Run-NpxSupabase @('link','--project-ref',$projectRef)

    Write-Host '3/4 - Informe a chave OpenRouteService/HeiGIT.' -ForegroundColor Yellow
    $secure = Read-Host 'ORS_API_KEY' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Chave vazia.' }

    $temp = Join-Path $env:TEMP ("cantinho-ors-" + [guid]::NewGuid().ToString('N') + '.env')
    try {
        [IO.File]::WriteAllText($temp, "ORS_API_KEY=$plain`n", (New-Object Text.UTF8Encoding($false)))
        Run-NpxSupabase @('secrets','set','--env-file',$temp,'--project-ref',$projectRef)
    } finally {
        if (Test-Path $temp) { Remove-Item -Force $temp }
        $plain = $null
        $secure = $null
        [GC]::Collect()
    }

    Write-Host '4/4 - Implantando Edge Function...' -ForegroundColor Yellow
    Run-NpxSupabase @('functions','deploy',$functionName,'--project-ref',$projectRef,'--no-verify-jwt','--use-api')

    $url = "https://$projectRef.supabase.co/functions/v1/$functionName"
    Write-Host ''
    Write-Host 'Testando CORS da função...' -ForegroundColor Yellow
    $headers = @{ Origin = 'https://luizemsaopaulo.github.io'; 'Access-Control-Request-Method'='POST'; 'Access-Control-Request-Headers'='content-type,apikey,x-cantinho-client' }
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Method Options -Uri $url -Headers $headers
        if ($r.StatusCode -ne 204 -and $r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode)" }
        Write-Host 'Edge Function respondeu corretamente.' -ForegroundColor Green
    } catch {
        Write-Warning "A função foi implantada, mas o teste CORS não confirmou: $($_.Exception.Message)"
    }

    Write-Host ''
    Write-Host 'PRONTO: ORS_API_KEY está no Supabase e não no GitHub.' -ForegroundColor Green
    exit 0
} catch {
    Write-Host ''
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
