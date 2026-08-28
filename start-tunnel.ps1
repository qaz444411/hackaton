# Start an HTTPS tunnel to the Vite dev server (port 5173).
#
# Why: mobile browsers block the Geolocation API on plain http.
#      The map needs the user's current location, so the phone must open an https URL.
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-tunnel.ps1
#
# Notes:
#  - The quick-tunnel URL changes every run. Register the new URL in the Kakao console
#    (My Application > Platform > Web) or the map SDK will refuse to load.
#  - Restart the Vite dev server with VITE_TUNNEL=1 so HMR points at port 443.
#  - Stop with Ctrl+C, or: Get-Process cloudflared | Stop-Process

$ErrorActionPreference = 'Stop'

$exe = "$env:USERPROFILE\tools\cloudflared.exe"
if (-not (Test-Path $exe)) {
    Write-Host "cloudflared not found. Downloading..."
    $dir = Split-Path $exe
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' `
        -OutFile $exe -UseBasicParsing
}

# Make sure the dev server is actually up, otherwise the tunnel serves 502s.
try {
    $null = Invoke-WebRequest 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 5
} catch {
    Write-Host "Vite dev server is not responding on port 5173." -ForegroundColor Yellow
    Write-Host "Start it first:  cd client; `$env:VITE_TUNNEL='1'; npm.cmd run dev"
    exit 1
}

$log = Join-Path $env:TEMP 'cf-tunnel.log'
Remove-Item $log -ErrorAction SilentlyContinue

Write-Host "Starting tunnel..."
$proc = Start-Process -FilePath $exe `
    -ArgumentList 'tunnel', '--url', 'http://localhost:5173', '--no-autoupdate' `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardError $log -RedirectStandardOutput (Join-Path $env:TEMP 'cf-tunnel.out.log')

$url = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches
        if ($m) { $url = $m.Matches.Value | Select-Object -First 1; break }
    }
}

if (-not $url) {
    Write-Host "Could not get a tunnel URL. Log tail:" -ForegroundColor Red
    Get-Content $log -Tail 20
    exit 1
}

Write-Host ""
Write-Host "  Phone URL : $url" -ForegroundColor Green
Write-Host "  PID       : $($proc.Id)"
Write-Host "  Log       : $log"
Write-Host ""
Write-Host "  Register this exact URL in the Kakao console > Platform > Web," -ForegroundColor Yellow
Write-Host "  otherwise the map SDK will not load." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Stop with: Stop-Process -Id $($proc.Id)"
