@echo off
setlocal
title GrabNow - Media Downloader Server

:: 1. Navigate to the website directory
if exist "%~dp0server.js" cd /d "%~dp0" && goto dir_found
if exist "%~dp0website\server.js" cd /d "%~dp0website" && goto dir_found

echo ========================================================
echo [ERROR] Could not find server.js!
echo ========================================================
echo.
pause
exit /b 1

:dir_found

:: 2. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 goto node_ok

echo ========================================================
echo [ERROR] Node.js is not found in your system PATH!
echo Please install Node.js LTS from: https://nodejs.org/
echo ========================================================
echo.
pause
exit /b 1

:node_ok

:: 3. Auto-install dependencies if node_modules is missing
if exist "node_modules\" goto deps_ok
echo [SETUP] Installing required packages for GrabNow...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies. Please check your internet connection.
    pause
    exit /b 1
)

:deps_ok

echo ========================================================
echo               GrabNow - Media Downloader
echo ========================================================
echo URL: http://localhost:3000
echo.

:: 4. Check if the server is already running on port 3000
netstat -ano | findstr /R ":3000.*LISTENING" >nul 2>nul
if %ERRORLEVEL% NEQ 0 goto start_new_server

echo [INFO] GrabNow server is already running on port 3000!
echo Opening Chrome browser...
powershell -WindowStyle Hidden -Command "$u='http://localhost:3000'; if (Test-Path 'C:\Program Files\Google\Chrome\Application\chrome.exe') { Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' $u } elseif (Test-Path 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe') { Start-Process 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' $u } elseif (Test-Path \"$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe\") { Start-Process \"$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe\" $u } else { Start-Process $u }"
echo.
echo Press any key to close this launcher window.
pause >nul
exit /b 0

:start_new_server
echo [1/2] Starting local backend server...
echo [2/2] Opening Chrome browser...
echo.
echo Press Ctrl+C anytime in this window to stop the server.
echo ========================================================
echo.

:: Launch Chrome in background after giving the server 1.5 seconds to initialize
start "" /b powershell -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1500; $u='http://localhost:3000'; if (Test-Path 'C:\Program Files\Google\Chrome\Application\chrome.exe') { Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' $u } elseif (Test-Path 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe') { Start-Process 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' $u } elseif (Test-Path \"$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe\") { Start-Process \"$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe\" $u } else { Start-Process $u }"

:: Run the Node.js server
node server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo [NOTICE] Server stopped or encountered an error.
    echo ========================================================
    pause
)
