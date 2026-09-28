#!/usr/bin/env bash
set -e

echo "========================================================"
echo "   Manga Translator - Starting AI Localization Server"
echo "========================================================"
echo ""

if [ ! -d "node_modules" ]; then
    echo "[!] node_modules not found. Running setup.sh first..."
    ./setup.sh
fi

echo "[*] Server starting at http://localhost:3000 ..."
echo "[*] Press Ctrl+C to stop the server."
echo ""

npm run dev
