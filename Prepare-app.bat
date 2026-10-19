@echo off
cd /d "%~dp0"
title Mundus - Prepare App

REM Ensure command window handles execution cleanly and closes on exit
if "%~1" neq "runner" (
    cmd /c ""%~f0" runner"
    exit
)

echo ===================================================
echo               MUNDUS - PREPARE APP
echo ===================================================
echo.

REM 0. Check if package.json exists in script directory
if exist "package.json" goto :check_node

echo [ERROR] package.json was not found in: "%CD%"
echo.
echo IMPORTANT: If you opened this file directly from inside a ZIP archive,
echo please EXTRACT all files from the ZIP into a regular folder first,
echo then double-click Prepare-app.bat from the extracted folder!
echo.
goto :end_error

:check_node
REM 1. Check if Node.js & npm are already installed
where node >nul 2>nul
if not errorlevel 1 goto :node_ready

REM Check standard Windows installation paths in case PATH hasn't updated
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto :node_ready
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    goto :node_ready
)
if exist "%LocalAppData%\Programs\nodejs\node.exe" (
    set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
    goto :node_ready
)

REM 2. Node.js is missing - Attempt Automatic Installation
echo [NOTICE] Node.js was not detected on your system.
echo Automatically downloading and installing Node.js LTS for Windows...
echo.

REM Option A: Try winget (built into Windows 10/11)
where winget >nul 2>nul
if errorlevel 1 goto :try_powershell_download

echo Attempting fast install via Windows Package Manager (winget)...
winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where node >nul 2>nul
if not errorlevel 1 goto :node_ready

:try_powershell_download
REM Option B: Download official MSI directly using PowerShell and run silent installation
echo Downloading official Node.js installer from nodejs.org...
set "NODE_MSI=%TEMP%\node-setup.msi"

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.SecurityPointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', '%NODE_MSI%')"

if exist "%NODE_MSI%" goto :run_msi

echo.
echo [ERROR] Could not download Node.js installer automatically.
echo Please download and install Node.js (LTS version) manually from:
echo https://nodejs.org/
echo.
goto :end_error

:run_msi
echo Installing Node.js (this may trigger a Windows Administrator prompt)...
msiexec /i "%NODE_MSI%" /passive /norestart

if exist "%NODE_MSI%" del /f /q "%NODE_MSI%" >nul 2>&1

REM Update current PATH environment variable for this session
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where node >nul 2>nul
if not errorlevel 1 goto :node_ready

echo.
echo [INFO] Node.js has been installed!
echo Windows requires a quick terminal reload to recognize the new command PATH.
echo Please CLOSE this window and double-click 'Prepare-app.bat' once more.
echo.
goto :end_success

:node_ready
echo [1/3] Node.js is ready:
call node -v
echo.

REM 3. Check and install dependencies if needed
echo [2/3] Checking dependencies...
set "NODE_NO_WARNINGS=1"
if exist "node_modules\" goto :deps_ready

echo Installing dependencies for the first time, this may take a couple of minutes...
call npm install --no-fund --no-audit --loglevel=error
if not errorlevel 1 goto :deps_ready

echo.
echo [ERROR] Failed to install npm dependencies.
echo Please check your internet connection and try running 'npm install' manually.
echo.
goto :end_error

:deps_ready
echo Dependencies present in node_modules.
echo.

REM 4. Build React frontend, Electron bundle, and desktop executables
echo [3/3] Compiling Mundus and building the desktop application...
call npm run electron:build
if errorlevel 1 goto :build_failed

REM Verify that executables were generated before proceeding to cleanup
if not exist "release\*.exe" (
    echo.
    echo [ERROR] No executables were found in the release directory.
    goto :build_failed
)

REM 5. Relocate executables to root folder and purge all source & build files
echo.
echo [CLEANUP] Moving standalone executables to the root folder...
move /y "release\*.exe" ".\" >nul 2>&1

echo [CLEANUP] Purging temporary build artifacts, source code, and node_modules...
if exist "release\" rmdir /s /q "release" 2>nul
if exist "dist\" rmdir /s /q "dist" 2>nul
if exist "dist-electron\" rmdir /s /q "dist-electron" 2>nul
if exist "node_modules\" rmdir /s /q "node_modules" 2>nul
if exist "src\" rmdir /s /q "src" 2>nul
if exist "electron\" rmdir /s /q "electron" 2>nul

del /f /q "package.json" "package-lock.json" "bun.lock" "tsconfig.json" "vite.config.ts" 2>nul
del /f /q "electron-builder.json" "index.html" "metadata.json" "firestore.rules" "firebase-blueprint.json" 2>nul
del /f /q ".gitignore" ".env.example" "Prepare-app.sh" 2>nul

echo [CLEANUP] Cleanup completed! Only your standalone executables and README remain.

echo.
echo ===================================================
echo               PREPARATION COMPLETED!
echo ===================================================
echo.
echo Your standalone executable files are ready in this folder:
echo.
dir /b *.exe 2>nul
echo.
echo You can run the Portable .exe directly or run the Setup .exe to install.
echo All development files have been cleaned.
echo.

del /f /q "Run-Prepare.cmd" 2>nul

:end_success
echo All done! Press any key to close this window...
pause >nul
REM Self-delete the preparation script on finish
start /b "" cmd /c "timeout /t 1 /nobreak >nul & del /f /q \"%~f0\" 2>nul"
exit

:build_failed
echo.
echo ===================================================
echo [ERROR] Build failed. Please check the terminal output above.
echo ===================================================
echo.
goto :end_error

:end_error
echo.
echo Script stopped due to an error.
echo (Source files have NOT been deleted so you can investigate or retry).
echo Press any key to exit.
pause >nul
exit
