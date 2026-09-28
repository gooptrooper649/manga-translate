@echo off
setlocal EnableDelayedExpansion
title Manga Translator - Launch Server

echo ========================================================
echo    Manga Translator - Starting AI Localization Server
echo ========================================================
echo.

:: Check if node_modules exists
if not exist node_modules (
    echo [WARNING] Dependencies not found! Running setup.bat first...
    echo.
    call setup.bat
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Setup failed!
        pause
        exit /b 1
    )
)

echo [*] Starting Manga Translator server at http://localhost:3000 ...
echo [*] Press Ctrl+C in this window anytime to stop the server.
echo.

:: Open default browser after a 2-second delay in background
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start Vite + Express dev server
npm run dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server terminated with an error code: %ERRORLEVEL%
    pause
)
