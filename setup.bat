@echo off
setlocal EnableDelayedExpansion
title Manga Translator - Setup Script

echo ========================================================
echo    Manga Translator - Open Source AI Localization Setup
echo ========================================================
echo.

:: 1. Check for Node.js
echo [*] Checking Node.js installation...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    echo Please download and install Node.js 18+ or 20+ LTS from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Found Node.js: %NODE_VERSION%
echo.

:: 2. Check for npm
echo [*] Checking npm...
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm was not found! Please ensure npm is in your PATH.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [OK] Found npm: %NPM_VERSION%
echo.

:: 3. Setup .env file
echo [*] Checking environment configuration (.env)...
if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo [OK] Created .env from .env.example
    ) else (
        echo PORT=3000 > .env
        echo [OK] Created default .env
    )
) else (
    echo [OK] .env configuration file already exists.
)
echo.

:: 4. Install npm dependencies
echo [*] Installing project dependencies with npm...
echo This may take 1-2 minutes depending on your internet connection.
echo.
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] npm install encountered an issue!
    pause
    exit /b 1
)
echo.
echo [OK] Dependencies installed successfully!
echo.

:: 5. Ready message
echo ========================================================
echo   [SUCCESS] Setup Completed!
echo ========================================================
echo.
echo Next step:
echo   Double-click run.bat to start Manga Translator!
echo.
echo Note:
echo   You can get a free Google Gemini API key from:
echo   https://aistudio.google.com/app/apikey
echo   and enter it in the app's "API Keys" tab.
echo.
pause
