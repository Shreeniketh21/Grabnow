@echo off
setlocal
title Push GrabNow to GitHub

cd /d "%~dp0"

echo ========================================================
echo               Pushing GrabNow to GitHub
echo ========================================================
echo Repository: https://github.com/Shreeniketh21/Grabnow.git
echo Branch:     main
echo ========================================================
echo.

git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo [SUCCESS] Code successfully pushed to GitHub!
    echo Visit: https://github.com/Shreeniketh21/Grabnow
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo [ERROR] Git push encountered an issue. Check above.
    echo ========================================================
)

echo.
pause
