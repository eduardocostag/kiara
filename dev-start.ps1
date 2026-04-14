$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

New-Item -ItemType Directory -Force -Path (Join-Path $here "data") | Out-Null

$env:KIARA_ENABLE_WS = "1"

$p = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $here -PassThru -WindowStyle Hidden
Set-Content -Path (Join-Path $here "data/server.pid") -Value $p.Id -Encoding ascii

Write-Host "KIARA iniciada. PID=$($p.Id)"
Write-Host "Abra: http://localhost:3000"

