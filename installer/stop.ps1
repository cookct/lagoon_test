# Lagoon stop script
# Terminates the running Lagoon server process.
#
# Usage (from Start Menu shortcut or manually):
#   powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File stop.ps1

$installDir = Split-Path -Parent $PSCommandPath
$pidFile    = Join-Path $installDir 'lagoon.pid'

if (Test-Path $pidFile) {
    $storedPid = [int](Get-Content $pidFile -Raw)
    try {
        Stop-Process -Id $storedPid -Force -ErrorAction Stop
        Write-Host "Lagoon stopped (PID $storedPid)."
    } catch {
        Write-Host "Process $storedPid not found — already stopped."
    }
    Remove-Item $pidFile -Force
} else {
    # No PID file — fall back to killing by port
    $port = 5007
    $connections = netstat -ano | Select-String ":$port\s"
    foreach ($line in $connections) {
        if ($line -match '\s+(\d+)$') {
            $pid = [int]$Matches[1]
            try { Stop-Process -Id $pid -Force } catch {}
        }
    }
    Write-Host "Lagoon stopped."
}
