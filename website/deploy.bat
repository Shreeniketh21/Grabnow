@echo off
setlocal
title Deploy GrabNow to Firebase Hosting

echo ========================================================
echo          GrabNow - Deploy to Firebase Hosting
echo ========================================================
echo Target Project: relive-f7a68
echo Target URL:     https://relive-f7a68.web.app
echo ========================================================
echo.

cd /d "%~dp0"

echo [Step 1/2] Checking Firebase authentication...
echo If a browser window opens, please select your Google account to log in.
echo.
call npx --yes firebase-tools login
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo [ERROR] Firebase login was not completed.
    echo Please try running this script again to authenticate.
    echo ========================================================
    pause
    exit /b 1
)

echo.
echo ========================================================
echo [Step 2/2] Deploying website to Firebase Hosting...
echo ========================================================
echo.
call npx --yes firebase-tools deploy --only hosting
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] Deployed successfully!
    echo Opening: https://relive-f7a68.web.app
    echo ========================================================
    echo.
    powershell -WindowStyle Hidden -Command "Start-Process 'https://relive-f7a68.web.app'"
) else (
    echo.
    echo ========================================================
    echo [ERROR] Deployment failed. Check the error logs above.
    echo ========================================================
)

echo.
pause
