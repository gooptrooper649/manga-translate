@echo off
REM Manga Translator Installer
REM This script sets up the environment and installs dependencies

echo ========================================
echo    Manga Translator Installer
echo ========================================
echo.

REM Check Python installation
echo [1/5] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.10 or higher from https://python.org
    pause
    exit /b 1
)
python --version
echo.

REM Create virtual environment
echo [2/5] Creating virtual environment...
if not exist ".venv" (
    python -m venv .venv
    echo Virtual environment created successfully.
) else (
    echo Virtual environment already exists.
)
echo.

REM Activate virtual environment
echo [3/5] Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo [ERROR] Failed to activate virtual environment
    pause
    exit /b 1
)
echo Virtual environment activated.
echo.

REM Install dependencies
echo [4/5] Installing dependencies...
echo This may take several minutes...
pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo Dependencies installed successfully.
echo.

REM Create necessary directories
echo [5/5] Creating directories...
if not exist "models" mkdir models
if not exist "data" mkdir data
if not exist "output" mkdir output
echo Directories created.
echo.

echo ========================================
echo    Installation Complete!
echo ========================================
echo.
echo To run the application:
echo   1. Double-click START.bat
echo   2. Or run: streamlit run app.py
echo.
echo The application will open at: http://localhost:8501
echo.
pause