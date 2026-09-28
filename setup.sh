#!/usr/bin/env bash
set -e

echo "========================================================"
echo "   Manga Translator - Open Source AI Localization Setup"
echo "========================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js 18+ or 20+ from https://nodejs.org/"
    exit 1
fi

echo "[OK] Found Node.js: $(node -v)"
echo "[OK] Found npm: $(npm -v)"
echo ""

# Setup .env
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "[OK] Created .env from .env.example"
    else
        echo "PORT=3000" > .env
        echo "[OK] Created default .env"
    fi
fi

# Install dependencies
echo "[*] Installing project dependencies..."
npm install

echo ""
echo "========================================================"
echo "  [SUCCESS] Setup Completed!"
echo "========================================================"
echo "Run './run.sh' or 'npm run dev' to start the application."
