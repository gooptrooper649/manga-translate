# 📖 Manga Translator — Open Source AI Localization

A complete, production-grade manga localization workstation that performs text bubble detection, vertical Japanese OCR, onomatopoeia recognition, neural translation, and high-fidelity comic typesetting.

---

## 🚀 Quick Start (One-Click Launchers)

### Windows
1. **Double-click `setup.bat`** (installs Node.js dependencies and creates `.env`).
2. **Double-click `run.bat`** (starts the server and opens `http://localhost:3000` in your browser).

### macOS & Linux
```bash
chmod +x setup.sh run.sh
./setup.sh
./run.sh
```

### Manual CLI
```bash
npm install
npm run dev
# App will run at http://localhost:3000
```

---

## 🌟 Key Features

- **⚡ Multimodal Vision Pipeline**: Powered by `gemini-2.5-flash` for simultaneous bubble segmentation, vertical reading order sorting, and accurate translation.
- **🎨 Natural Bubble Inpainting**: Clean, contour-aware erasing and comic-style typesetting (`Comic Sans MS`, `Arial Rounded MT Bold`, `Bangers`) with proportional line-wrapping.
- **📖 Interactive Manga Reader**: Page-turning viewer, Side-by-Side comparison mode, before/after wipe slider, bubble inspector, and 1-click in-memory ZIP chapter export.
- **🌓 Light & Dark Mode**: Fully functional theme switcher across all pages and components with persistence in `localStorage`.
- **🔑 Multi-Key Load Balancing**: Rotate multiple Gemini API keys automatically to bypass rate limits (HTTP 429) without downtime.
- **📚 Interactive User Guide**: Comprehensive in-app walkthrough (`User Guide & Setup`) explaining environment setup, API key acquisition, and troubleshooting.
- **🐛 Direct Bug Reporting**: Built-in issue reporter allowing users to attach screenshots, describe bugs, and forward reports directly to `studyaccformeonly@gmail.com`.
- **📂 Authentic Comic Samples**: 8 high-resolution authentic Japanese manga comic pages included in `sample_images/` for instant testing without synthetic data.

---

## 🔑 Obtaining a Free Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **"Create API key"** (free tier includes generous RPM/TPM allowances).
3. Add your key in the app:
   - **Option A**: In the **API Keys** tab inside the app (encrypted locally with AES-128).
   - **Option B**: Add `GEMINI_API_KEY=AIzaSy...` in your `.env` file.

---

## 🐛 Bug Reporting & Support

Encountered an issue or translation glitch?
- **In-App**: Click the **"Report a Bug"** button in the sidebar or mobile header, attach a screenshot or sample scan, and submit.
- **Email**: Issues are forwarded directly to **`studyaccformeonly@gmail.com`**.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, JSZip.
- **Backend**: Node.js, Express, `@google/genai` TypeScript SDK.
- **Security**: Local Fernet / AES-128 key encryption.
- **License**: MIT Open Source.
