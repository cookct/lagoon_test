@echo off
cd /d "%~dp0"
echo ============================================
echo  Lagoon -- First-run dependency installer
echo ============================================
echo.
echo This runs once and takes 2-5 minutes.
echo Do NOT close this window.
echo.

echo [1/3] Creating Python virtual environment...
python -m venv venv
if errorlevel 1 (
    echo.
    echo ERROR: Failed to create virtual environment.
    echo Make sure Python 3.10+ is installed and on PATH.
    echo Download: https://www.python.org/downloads/
    echo IMPORTANT: Check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)
echo Done.
echo.

echo [2/3] Upgrading pip...
venv\Scripts\python.exe -m pip install --upgrade pip --quiet
echo Done.
echo.

echo [3/3] Installing Lagoon dependencies...
echo (This may take a few minutes)
echo.
venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: Some packages failed to install.
    echo See errors above.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Installation complete! Close this window.
echo ============================================
pause
exit /b 0
