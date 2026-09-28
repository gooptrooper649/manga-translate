import React, { useState, useEffect } from 'react';
import { MangaPage } from './types';
import { UploadTranslateView } from './components/UploadTranslateView';
import { ReaderView } from './components/ReaderView';
import { TrackerView } from './components/TrackerView';
import { ApiKeysView } from './components/ApiKeysView';
import { AuthView } from './components/AuthView';
import { UserGuideView } from './components/UserGuideView';
import { BugReportModal } from './components/BugReportModal';
import { useTheme } from './context/ThemeContext';
import {
  BookOpen,
  Upload,
  Activity,
  KeyRound,
  ShieldCheck,
  Lock,
  LogOut,
  Menu,
  X,
  Sparkles,
  Sun,
  Moon,
  Bug,
  HelpCircle,
} from 'lucide-react';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'upload' | 'reader' | 'tracker' | 'keys' | 'guide' | 'auth'>('upload');
  const [pages, setPages] = useState<MangaPage[]>([]);
  const [activeKeysCount, setActiveKeysCount] = useState<number>(1);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [bugReportOpen, setBugReportOpen] = useState<boolean>(false);
  const [bugReportImage, setBugReportImage] = useState<string | undefined>(undefined);

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authProvider, setAuthProvider] = useState<string | null>(null);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/config');
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(data.isAuthenticated);
        setAuthProvider(data.provider);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  const fetchKeysCount = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const keys = await res.json();
        const active = keys.filter((k: any) => k.isActive).length;
        setActiveKeysCount(active || 1);
      }
    } catch {
      setActiveKeysCount(1);
    }
  };

  useEffect(() => {
    checkAuthStatus();
    fetchKeysCount();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsAuthenticated(false);
      setAuthProvider(null);
      setActiveTab('auth');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const translatedCount = pages.filter((p) => p.status === 'completed' || p.translatedDataUrl).length;

  const navItems = [
    { id: 'upload', label: 'Upload & Translate', icon: Upload },
    { id: 'reader', label: 'Manga Reader', icon: BookOpen },
    { id: 'tracker', label: 'Token Tracker', icon: Activity },
    { id: 'keys', label: 'API Keys', icon: KeyRound },
    { id: 'guide', label: 'User Guide & Setup', icon: HelpCircle },
    { id: 'auth', label: 'Security & Auth', icon: Lock },
  ] as const;

  // Initial loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-500 dark:text-slate-400 font-mono text-xs">
        Checking encrypted user configuration...
      </div>
    );
  }

  // Not authenticated: show login/onboarding screen directly
  if (!isAuthenticated && activeTab !== 'auth') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
        <AuthView
          onAuthenticated={() => {
            setIsAuthenticated(true);
            checkAuthStatus();
            fetchKeysCount();
            setActiveTab('upload');
          }}
          isStandalone
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row font-sans transition-colors duration-200">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-base">
          <span className="text-xl">📖</span> Manga Translator
        </div>
        <div className="flex items-center gap-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark/light mode"
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* Report Bug */}
          <button
            onClick={() => setBugReportOpen(true)}
            aria-label="Report Bug"
            className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition"
          >
            <Bug className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle menu"
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between z-30 transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-5 overflow-y-auto pr-1">
          {/* Logo / Header & Theme Toggle */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-lg shadow-md shadow-indigo-600/30">
                📖
              </div>
              <div>
                <h2 className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">Manga Translator</h2>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">v1.2 Open Source</p>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer border border-slate-200 dark:border-slate-700"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800/80 my-1" />

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Metrics, Bug Reporter, & Security Status */}
        <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800/80">
          {/* Quick Bug Report Button */}
          <button
            onClick={() => setBugReportOpen(true)}
            className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Bug className="w-3.5 h-3.5 text-rose-500" />
            Report a Bug (Send Email)
          </button>

          {authProvider && (
            <div className="bg-slate-100 dark:bg-slate-950/80 p-2 rounded-xl border border-slate-200 dark:border-slate-800/80 space-y-0.5 text-center">
              <span className="text-[9px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block tracking-wider">
                Active Provider
              </span>
              <span className="text-[11px] font-bold text-slate-800 dark:text-white block truncate">{authProvider}</span>
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block font-mono">● AES Encrypted</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-100 dark:bg-slate-950/70 p-2 rounded-xl border border-slate-200 dark:border-slate-800/60 text-center">
              <span className="text-[9px] uppercase font-semibold text-slate-500 block">Active Keys</span>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">{activeKeysCount}</span>
            </div>

            <div className="bg-slate-100 dark:bg-slate-950/70 p-2 rounded-xl border border-slate-200 dark:border-slate-800/60 text-center">
              <span className="text-[9px] uppercase font-semibold text-slate-500 block">Translated</span>
              <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block">{translatedCount}</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-medium">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              <span>AES-128 Local Security</span>
            </div>

            <button
              onClick={handleLogout}
              className="w-full py-1 px-2 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              Log Out & Lock
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 lg:p-10 overflow-y-auto">
        {activeTab === 'upload' && (
          <UploadTranslateView
            pages={pages}
            setPages={setPages}
            onNavigateToReader={() => setActiveTab('reader')}
            onRefreshStats={fetchKeysCount}
          />
        )}
        {activeTab === 'reader' && (
          <ReaderView
            pages={pages}
            setPages={setPages}
            onUploadMore={() => setActiveTab('upload')}
          />
        )}
        {activeTab === 'tracker' && <TrackerView onRefresh={fetchKeysCount} />}
        {activeTab === 'keys' && <ApiKeysView onKeysChanged={fetchKeysCount} />}
        {activeTab === 'guide' && (
          <UserGuideView
            onNavigateToUpload={() => setActiveTab('upload')}
            onNavigateToKeys={() => setActiveTab('keys')}
            onOpenBugReport={() => setBugReportOpen(true)}
          />
        )}
        {activeTab === 'auth' && (
          <AuthView
            onAuthenticated={() => {
              setIsAuthenticated(true);
              checkAuthStatus();
              fetchKeysCount();
              setActiveTab('upload');
            }}
          />
        )}
      </main>

      {/* Global Bug Report Modal */}
      <BugReportModal
        isOpen={bugReportOpen}
        onClose={() => setBugReportOpen(false)}
        defaultImage={bugReportImage}
      />
    </div>
  );
};
