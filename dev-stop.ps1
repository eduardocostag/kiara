$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $here "data/server.pid"

if (!(Test-Path $pidFile)) {
  Write-Host "PID file não encontrado: $pidFile"
  exit 0
}

$pid = (Get-Content $pidFile -ErrorAction Stop | Select-Object -First 1).Trim()
if (!$pid) {
  Write-Host "PID inválido no arquivo."
  exit 0
}

try {
  Stop-Process -Id ([int]$pid) -Force
  Write-Host "KIARA parada. PID=$pid"
} catch {
  Write-Host "Falha ao parar PID=$pid ($($_.Exception.Message))"
}

