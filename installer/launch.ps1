# Lagoon launcher
Add-Type -AssemblyName System.Windows.Forms
$installDir = Split-Path -Parent $PSCommandPath
$python     = Join-Path $installDir 'venv\Scripts\python.exe'
$app        = Join-Path $installDir 'app.py'
$pidFile    = Join-Path $installDir 'lagoon.pid'
$logFile    = Join-Path $installDir 'lagoon_launch.log'
$port       = 5007

function Log($msg) {
    "$(Get-Date -Format 'HH:mm:ss') $msg" | Add-Content $logFile
}

"" | Out-File $logFile  # clear log
Log "Lagoon launcher started"
Log "Install dir: $installDir"

# ── Already running? ──────────────────────────────────────────────────────────
if (Test-Path $pidFile) {
    $existingPid = [int](Get-Content $pidFile -Raw -ErrorAction SilentlyContinue)
    $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($proc) {
        Log "Already running (PID $existingPid), opening browser"
        Start-Process "http://127.0.0.1:$port"
        exit 0
    } else {
        Log "Stale PID file, removing"
        Remove-Item $pidFile -Force
    }
}

# ── First-run: install deps if venv missing ────────────────────────────────────
if (-not (Test-Path $python)) {
    Log "First run — venv not found, launching install_deps.bat"
    $installBat = Join-Path $installDir 'install_deps.bat'
    if (-not (Test-Path $installBat)) {
        Log "ERROR: install_deps.bat not found"
        [System.Windows.Forms.MessageBox]::Show("install_deps.bat not found.`nPlease re-run LagoonSetup to repair the installation.", "Lagoon Error", 0, 16) | Out-Null
        exit 1
    }
    $proc = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c `"$installBat`"" `
        -WorkingDirectory $installDir `
        -PassThru -Wait
    if ($proc.ExitCode -ne 0) {
        Log "ERROR: install_deps.bat failed (exit $($proc.ExitCode))"
        [System.Windows.Forms.MessageBox]::Show("Dependency installation failed.`nCheck the console output for details.", "Lagoon Error", 0, 16) | Out-Null
        exit 1
    }
    Log "install_deps.bat completed"
    if (-not (Test-Path $python)) {
        Log "ERROR: Python still missing after install"
        [System.Windows.Forms.MessageBox]::Show("Installation completed but venv was not created.`nPlease re-run LagoonSetup.", "Lagoon Error", 0, 16) | Out-Null
        exit 1
    }
}

Log "Python found: $python"

# ── Start server ──────────────────────────────────────────────────────────────
try {
    $proc = Start-Process `
        -FilePath $python `
        -ArgumentList "`"$app`"" `
        -WorkingDirectory $installDir `
        -WindowStyle Hidden `
        -PassThru
    $proc.Id | Out-File $pidFile -Encoding ascii
    Log "Server started (PID $($proc.Id))"
} catch {
    Log "ERROR starting server: $_"
    exit 1
}

# ── Wait for port 5007 (max 30s) ──────────────────────────────────────────────
Log "Waiting for port $port..."
$deadline = (Get-Date).AddSeconds(30)
$ready = $false

while ((Get-Date) -lt $deadline) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect('127.0.0.1', $port)
        $tcp.Close()
        $ready = $true
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

if ($ready) {
    Log "Server ready, opening browser"
} else {
    Log "WARNING: server did not respond within 30s, opening browser anyway"
}

Start-Process "http://127.0.0.1:$port"
Log "Done"
