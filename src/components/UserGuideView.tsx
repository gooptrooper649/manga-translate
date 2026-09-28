import React, { useState } from 'react';
import {
  BookOpen,
  Terminal,
  KeyRound,
  Upload,
  Sparkles,
  Download,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Cpu,
  Layers,
  HelpCircle,
  Bug,
  Code2,
  FileText,
  Play,
  RotateCw,
} from 'lucide-react';

interface Props {
  onNavigateToUpload: () => void;
  onNavigateToKeys: () => void;
  onOpenBugReport: () => void;
}

export const UserGuideView: React.FC<Props> = ({
  onNavigateToUpload,
  onNavigateToKeys,
  onOpenBugReport,
}) => {
  const [activeSection, setActiveSection] = useState<'quickstart' | 'keys' | 'batch_scripts' | 'walkthrough' | 'troubleshooting' | 'opensource'>('quickstart');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const navSections = [
    { id: 'quickstart', label: '1. Quick Start', icon: Play },
    { id: 'keys', label: '2. Gemini API Key Setup', icon: KeyRound },
    { id: 'batch_scripts', label: '3. One-Click Launchers (.bat)', icon: Terminal },
    { id: 'walkthrough', label: '4. Translation Walkthrough', icon: Layers },
    { id: 'troubleshooting', label: '5. Troubleshooting & FAQ', icon: HelpCircle },
    { id: 'opensource', label: '6. Open Source Guide', icon: Code2 },
  ] as const;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-150 pb-16">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 bg-gradient-to-br from-indigo-900/60 via-slate-900 to-slate-950 border border-indigo-500/20 shadow-2xl">
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Complete Setup & User Documentation
          </div>
          <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
            Manga Translator User Guide
          </h1>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            End-to-end Japanese manga localization pipeline. Follow this guide to configure your free Gemini Vision API, run the project locally with 1-click batch scripts, and translate full volumes seamlessly.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={onNavigateToUpload}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Start Translating Manga
            </button>
            <button
              onClick={onNavigateToKeys}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-2 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-emerald-400" />
              Configure API Keys
            </button>
            <button
              onClick={onOpenBugReport}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition flex items-center gap-2 cursor-pointer"
            >
              <Bug className="w-4 h-4 text-rose-400" />
              Report an Issue
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Navigation & Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <div className="space-y-1 md:sticky md:top-6 self-start">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 px-3 block mb-2">
            Documentation Index
          </span>
          {navSections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition text-left cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Panel */}
        <div className="md:col-span-3 space-y-6">
          {/* SECTION 1: QUICK START */}
          {activeSection === 'quickstart' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-indigo-500" />
                  Quick Start: Get Running in 3 Minutes
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Everything you need to clone, set up, and launch Manga Translator on your local machine.
                </p>
              </div>

              {/* Requirements */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Node.js 18+</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Recommended: Node.js 20 or 22 LTS
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Gemini API Key</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    100% Free from Google AI Studio
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">OS Support</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    Windows, macOS, and Linux
                  </span>
                </div>
              </div>

              {/* Step 1-2-3 */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">1</span>
                      Clone or Download Repository
                    </span>
                    <button
                      onClick={() => copyToClipboard('git clone https://github.com/your-username/manga-translator.git\ncd manga-translator', 'clone')}
                      className="text-slate-400 hover:text-slate-200 transition p-1"
                      title="Copy"
                    >
                      {copiedCode === 'clone' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto">
                    git clone https://github.com/your-username/manga-translator.git{'\n'}cd manga-translator
                  </pre>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">2</span>
                      One-Click Setup (Windows & macOS/Linux)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    On Windows, simply double-click <code className="text-indigo-400 font-mono font-bold">setup.bat</code>. On Linux/macOS, run:
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto">
                    npm install
                  </pre>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">3</span>
                      Launch Application
                    </span>
                    <button
                      onClick={() => copyToClipboard('npm run dev', 'run_cli')}
                      className="text-slate-400 hover:text-slate-200 transition p-1"
                      title="Copy"
                    >
                      {copiedCode === 'run_cli' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    On Windows, double-click <code className="text-indigo-400 font-mono font-bold">run.bat</code> to start the server and open your browser automatically. Or execute:
                  </p>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto">
                    npm run dev
                  </pre>
                  <span className="text-[11px] text-emerald-500 font-medium block">
                    ✓ Server will be live at http://localhost:3000
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: GEMINI API KEY SETUP */}
          {activeSection === 'keys' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-500" />
                  Obtaining & Configuring Your Gemini API Key
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Manga Translator uses Google Gemini 3.8 Flash for high-speed comic OCR and context-aware localization.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-2">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 block">
                    Why Gemini 3.8 Flash?
                  </span>
                  <p className="text-xs text-indigo-700 dark:text-indigo-200 leading-relaxed">
                    Gemini 3.8 Flash possesses state-of-the-art multimodal vision capabilities, accurately detecting vertical Japanese text columns, stylized sound effects (onomatopoeia), and circular speech balloons in manga scans with zero preprocessing needed.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Step-by-Step API Key Generation:</h3>
                  <ol className="list-decimal list-inside space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <li>
                      Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-500 font-semibold underline inline-flex items-center gap-1">Google AI Studio <ExternalLink className="w-3 h-3" /></a> and sign in with your Google account.
                    </li>
                    <li>Click <strong>"Create API key"</strong> and choose any Google Cloud project (free tier included).</li>
                    <li>Copy your API key string (starts with <code className="font-mono text-emerald-400 font-bold">AIzaSy...</code>).</li>
                  </ol>
                </div>

                <div className="space-y-2 pt-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">How to Apply Your Key:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">Method A: In-App UI (Recommended)</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Go to the <strong>API Keys</strong> tab in the sidebar and paste your key. It will be encrypted locally with AES-128.
                      </p>
                      <button
                        onClick={onNavigateToKeys}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                      >
                        Open API Keys View →
                      </button>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">Method B: Environment Variable (.env)</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Create a <code className="font-mono">.env</code> file in project root:
                      </p>
                      <pre className="p-2 rounded bg-slate-900 text-slate-200 text-[11px] font-mono">
                        GEMINI_API_KEY=AIzaSy...
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: BATCH SCRIPTS */}
          {activeSection === 'batch_scripts' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-500" />
                  One-Click Batch Launchers: setup.bat & run.bat
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  We included automated script files in the repository root so you can launch the app effortlessly on Windows.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* setup.bat */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-400" />
                      <span className="font-bold text-sm text-slate-900 dark:text-white">setup.bat</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono font-bold">
                      Run Once
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Automatically verifies Node.js, installs all required NPM packages, sets up environment configurations, and prepares the translation engine.
                  </p>
                  <div className="text-[11px] text-slate-500 font-mono bg-slate-900 text-slate-300 p-2.5 rounded-xl">
                    Double-click <strong>setup.bat</strong> in Windows Explorer
                  </div>
                </div>

                {/* run.bat */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Play className="w-5 h-5 text-emerald-400" />
                      <span className="font-bold text-sm text-slate-900 dark:text-white">run.bat</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono font-bold">
                      Daily Launcher
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Starts the local Express + Vite dev server and opens your default browser directly to <strong>http://localhost:3000</strong>.
                  </p>
                  <div className="text-[11px] text-slate-500 font-mono bg-slate-900 text-slate-300 p-2.5 rounded-xl">
                    Double-click <strong>run.bat</strong> to start reading
                  </div>
                </div>
              </div>

              {/* Linux / macOS equivalent */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white">macOS / Linux Shell Scripts</span>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Equivalent shell scripts <code className="font-mono">setup.sh</code> and <code className="font-mono">run.sh</code> are also provided:
                </p>
                <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto">
                  chmod +x setup.sh run.sh{'\n'}./setup.sh{'\n'}./run.sh
                </pre>
              </div>
            </div>
          )}

          {/* SECTION 4: TRANSLATION WALKTHROUGH */}
          {activeSection === 'walkthrough' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  Manga Translation Walkthrough
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  How the OCR detection, inpainting, and typesetting workflow functions.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Upload Your Manga Pages</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Upload individual images (PNG, JPG, WebP) or drop an entire chapter ZIP file. You can also click <strong>"Load All 8 Sample Pages"</strong> to test with authentic Japanese comic artwork.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Set Target Language & Options</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Choose English, Spanish, French, German, or 30+ other languages. You can optionally toggle <strong>Annotation Mode</strong> to see bounding boxes over speech bubbles, or leave it off for clean, organic inpainting.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Batch Translate Chapter</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Click <strong>"Localize & Translate Chapter"</strong>. The pipeline processes each page in sequence, logging speech bubble coordinates, detected Japanese text, and localized translations in real-time.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Read & Export Volume</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Switch to the <strong>Manga Reader</strong> to enjoy seamless page-turning, toggle <strong>Side-by-Side comparison</strong>, inspect individual dialogue bubbles, and download the full localized volume as an in-memory ZIP archive.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: TROUBLESHOOTING */}
          {activeSection === 'troubleshooting' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-amber-500" />
                  Troubleshooting & Common Questions
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Quick solutions for common issues.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Q: I got an error saying "No Gemini API key configured".
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    A: You need to add a Google Gemini API key. Go to the <strong>API Keys</strong> tab in the sidebar and paste your free key from Google AI Studio.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Q: What if I hit Google API rate limits (HTTP 429) or quota errors?
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    A: Manga Translator features intelligent <strong>Multi-Key Automatic Rerouting</strong>. If multiple API keys are configured and one fails or hits rate limits, the system automatically reroutes across alternative healthy keys and executes multiple retry attempts with fallback models (gemini-3.8-flash and gemini-3.1-flash-lite).
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Q: Can it detect vertical Japanese text?
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    A: Yes! Gemini 3.8 Flash is natively tuned for vertical top-to-bottom Japanese columns and floating onomatopoeia sound effects.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 space-y-2">
                  <span className="text-xs font-bold text-rose-900 dark:text-rose-300 block flex items-center gap-2">
                    <Bug className="w-4 h-4 text-rose-500" />
                    Found a Bug or Translation Glitch?
                  </span>
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    You can report any bug with screenshots and error logs directly to our support team at <strong className="font-mono">studyaccformeonly@gmail.com</strong> using our in-app bug reporter.
                  </p>
                  <button
                    onClick={onOpenBugReport}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
                  >
                    Open Bug Report Modal →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: OPEN SOURCE */}
          {activeSection === 'opensource' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-indigo-500" />
                  Open Source Architecture & Contributing
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  How the codebase is organized and how developers can contribute improvements.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Project Directory Structure:</span>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-300 text-xs font-mono overflow-x-auto leading-relaxed">
{`manga-translator/
├── sample_images/       # Authentic high-resolution sample manga scans
├── src/
│   ├── components/      # UI Views (Upload, Reader, Tracker, Keys, Auth, Guide)
│   ├── context/         # ThemeContext (Dark/Light mode state)
│   ├── utils/           # Canvas inpainting composer & sample loader
│   ├── App.tsx          # Main React navigation and view state
│   └── index.css        # Tailwind v4 dark/light mode styles
├── server.ts            # Express server (Gemini Vision proxy, Bug reporting, Auth)
├── setup.bat / run.bat  # 1-Click Windows launchers
├── setup.sh / run.sh    # 1-Click Linux / macOS shell scripts
└── package.json`}
                  </pre>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Contribution Ideas:</span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <li>Support for additional font typesets (e.g. Wild Words, CC Wild Words, Anime Ace).</li>
                    <li>Advanced mask feathering for non-elliptical complex polygon speech bubbles.</li>
                    <li>Direct PDF and CBZ / CBR comic archive import support.</li>
                    <li>Offline quantized OCR models (e.g. Manga-OCR ONNX runtime integration).</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
