param([switch]$Install)

$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Settings([string]$Path) {
    $settings = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in [IO.File]::ReadAllLines($Path)) {
            if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=(.*)$') {
                $settings[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
            }
        }
    }
    return $settings
}

function Save-Setting([string]$Path, [string]$Name, [string]$Value) {
    $lines = @()
    if (Test-Path -LiteralPath $Path) { $lines = [IO.File]::ReadAllLines($Path) }
    $found = $false
    $lines = @($lines | ForEach-Object {
        if ($_ -match "^\s*$Name\s*=") { $found = $true; "$Name=$Value" } else { $_ }
    })
    if (!$found) { $lines += "$Name=$Value" }
    [IO.File]::WriteAllLines($Path, [string[]]$lines, $utf8)
}

function Run-In([string]$Folder, [string]$Program, [string[]]$Arguments) {
    Push-Location (Join-Path $repoPath $Folder)
    try {
        & $Program @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$Program failed in $Folder (exit $LASTEXITCODE)." }
    } finally { Pop-Location }
}

function New-LocalSecret {
    $bytes = New-Object byte[] 48
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

Get-Command pnpm,docker -ErrorAction Stop | Out-Null
& docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, wait until its engine is running, then run this script again.' }

foreach ($service in @('user-service', 'supplier-service')) {
    $envPath = Join-Path $repoPath "$service/.env"
    if (!(Test-Path $envPath)) { Copy-Item (Join-Path $repoPath "$service/.env.example") $envPath }
}
$userSettings = Read-Settings (Join-Path $repoPath 'user-service/.env')
$jwtSecret = $userSettings['JWT_ACCESS_TOKEN_SECRET']
if (!$jwtSecret -or $jwtSecret.Length -lt 32 -or $jwtSecret.StartsWith('replace-')) {
    $jwtSecret = New-LocalSecret
    Save-Setting (Join-Path $repoPath 'user-service/.env') 'JWT_ACCESS_TOKEN_SECRET' $jwtSecret
}
if (!$userSettings['EMAIL_VERIFICATION_CODE_SECRET'] -or $userSettings['EMAIL_VERIFICATION_CODE_SECRET'].StartsWith('replace-')) {
    Save-Setting (Join-Path $repoPath 'user-service/.env') 'EMAIL_VERIFICATION_CODE_SECRET' (New-LocalSecret)
}
$rootEnv = Join-Path $repoPath '.env'
$rootSettings = Read-Settings $rootEnv
$internalToken = $rootSettings['CREDIT_INTERNAL_API_TOKEN']
if (!$internalToken -or $internalToken.Length -lt 32 -or $internalToken.StartsWith('replace-')) {
    $internalToken = New-LocalSecret
}
Save-Setting $rootEnv 'JWT_ACCESS_TOKEN_SECRET' $jwtSecret
Save-Setting $rootEnv 'CREDIT_INTERNAL_API_TOKEN' $internalToken
Save-Setting (Join-Path $repoPath 'supplier-service/.env') 'JWT_ACCESS_TOKEN_SECRET' $jwtSecret
Save-Setting (Join-Path $repoPath 'web-app/.env.local') 'CREDIT_INTERNAL_API_TOKEN' $internalToken

$rootSettings = Read-Settings $rootEnv
$creditPort = if ($rootSettings['CREDIT_DATABASE_PORT']) { $rootSettings['CREDIT_DATABASE_PORT'] } else { '5435' }
$creditUser = if ($rootSettings['CREDIT_DATABASE_USER']) { $rootSettings['CREDIT_DATABASE_USER'] } else { 'foc_credit' }
$creditPassword = if ($rootSettings['CREDIT_DATABASE_PASSWORD']) { $rootSettings['CREDIT_DATABASE_PASSWORD'] } else { 'local_credit_password' }
$creditDatabase = if ($rootSettings['CREDIT_DATABASE_NAME']) { $rootSettings['CREDIT_DATABASE_NAME'] } else { 'foc_credit' }
$creditEnv = Join-Path $repoPath 'credit-service/.env'
Save-Setting $creditEnv 'DATABASE_URL' "postgresql://$([Uri]::EscapeDataString($creditUser)):$([Uri]::EscapeDataString($creditPassword))@127.0.0.1:$creditPort/$creditDatabase"
Save-Setting $creditEnv 'JWT_ACCESS_TOKEN_SECRET' $jwtSecret
Save-Setting $creditEnv 'CREDIT_INTERNAL_API_TOKEN' $internalToken
foreach ($name in @('CREDIT_INITIAL_BALANCE','CREDIT_TRANSACTION_RETRIES','JWT_ISSUER','JWT_AUDIENCE','LOG_LEVEL')) {
    if ($rootSettings[$name]) { Save-Setting $creditEnv $name $rootSettings[$name] }
}

if ($Install -or !(Test-Path (Join-Path $repoPath 'node_modules'))) { Run-In '.' 'pnpm' @('install') }
foreach ($service in @('user-service','supplier-service')) {
    if ($Install -or !(Test-Path (Join-Path $repoPath "$service/node_modules"))) { Run-In $service 'pnpm' @('install') }
}
Run-In 'user-service' 'docker' @('compose','up','-d','--wait','database','redis')
Run-In 'supplier-service' 'docker' @('compose','up','-d','--wait','database')
Run-In '.' 'docker' @('compose','up','-d','--wait','credit-db')
foreach ($service in @('user-service','supplier-service')) {
    Run-In $service 'pnpm' @('prisma:generate')
    Run-In $service 'pnpm' @('db:migrate:deploy')
}
Run-In 'credit-service' 'pnpm' @('db:generate')
Run-In 'credit-service' 'pnpm' @('db:migrate')

$logPath = Join-Path $repoPath '.local'
New-Item -ItemType Directory -Force -Path $logPath | Out-Null
$services = @(
    @{ Folder = 'user-service'; Port = 3001; Command = 'pnpm start:dev' },
    @{ Folder = 'supplier-service'; Port = 3002; Command = 'pnpm start:dev' },
    @{ Folder = 'credit-service'; Port = 3003; Command = 'pnpm start:dev' },
    @{ Folder = '.'; Port = 3000; Command = 'pnpm web:dev' }
)
foreach ($service in $services) {
    if (Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue) {
        Write-Host "Port $($service.Port) is already in use; keeping the running process. Restart it if you changed its configuration."
        continue
    }
    $name = if ($service.Port -eq 3000) { 'web-app' } else { $service.Folder }
    $process = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d','/c',$service.Command) -WorkingDirectory (Join-Path $repoPath $service.Folder) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath "$name.log") -RedirectStandardError (Join-Path $logPath "$name.error.log")
    Write-Host "Starting $name (process $($process.Id)); logs in .local/"
}
Write-Host 'Waiting for the application services to be ready...'
$readyDeadline = [DateTime]::UtcNow.AddSeconds(90)
foreach ($target in @(
    @{ Url = 'http://127.0.0.1:3001/api/accounts/me'; Status = 401 },
    @{ Url = 'http://127.0.0.1:3002/api/suppliers'; Status = 401 },
    @{ Url = 'http://127.0.0.1:3003/health/ready'; Status = 200 },
    @{ Url = 'http://localhost:3000/login'; Status = 200 }
)) {
    $ready = $false
    while ([DateTime]::UtcNow -lt $readyDeadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $target.Url -TimeoutSec 3
            $ready = $response.StatusCode -eq $target.Status
        } catch {
            $ready = $_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq $target.Status
        }
        if ($ready) { break }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw "Service not ready at $($target.Url). Check .local/ logs before opening the app." }
}
Write-Host 'Open http://localhost:3000, log in, then click the gold coin and balance. A missing credit account is provisioned once after login.'
