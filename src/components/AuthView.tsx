import React, { useState, useEffect } from 'react';
import {
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  LogOut,
  Info,
} from 'lucide-react';

interface Props {
  onAuthenticated: () => void;
  isStandalone?: boolean;
}

export const AuthView: React.FC<Props> = ({ onAuthenticated, isStandalone = false }) => {
  const [provider, setProvider] = useState<string>('Gemini');
  const [apiKey, setApiKey] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [existingConfig, setExistingConfig] = useState<{
    isAuthenticated: boolean;
    provider: string | null;
    maskedKey: string | null;
  } | null>(null);

  const checkExistingConfig = async () => {
    try {
      const res = await fetch('/api/auth/config');
      if (res.ok) {
        const data = await res.json();
        setExistingConfig(data);
        if (data.provider) {
          setProvider(data.provider);
        }
      }
    } catch (err) {
      console.error('Failed to check existing config:', err);
    }
  };

  useEffect(() => {
    checkExistingConfig();
  }, []);

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter an API key before testing connection.' });
      return;
    }

    setIsTesting(true);
    setStatusMsg({ type: 'info', text: `Verifying connection to ${provider} via Google GenAI SDK...` });

    try {
      const res = await fetch('/api/auth/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, provider }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: data.message });
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Connection verification failed.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Network error: ${err.message}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid API key.' });
      return;
    }

    setIsSaving(true);
    setStatusMsg({ type: 'info', text: 'Encrypting credentials with Fernet and saving locally...' });

    try {
      const res = await fetch('/api/auth/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, provider }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({
          type: 'success',
          text: '🎉 Credentials successfully encrypted and stored in user_config.json! Routing to dashboard...',
        });
        await checkExistingConfig();
        setTimeout(() => {
          onAuthenticated();
        }, 800);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to save credentials.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Error saving credentials: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setApiKey('');
      setStatusMsg({ type: 'info', text: 'Local credentials cleared. Please enter a key to log in.' });
      await checkExistingConfig();
    } catch (err) {
      console.error('Failed to log out:', err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto shadow-lg shadow-indigo-600/20">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
          User Onboarding & Authentication
        </h1>
        <p className="text-slate-400 text-xs md:text-sm max-w-lg mx-auto">
          Configure your translation provider and securely encrypt your credentials using Fernet (AES-128-CBC) stored in{' '}
          <code className="text-indigo-400 bg-slate-900 px-1 py-0.5 rounded">user_config.json</code>.
        </p>
      </div>

      {/* Active Config Banner if already configured */}
      {existingConfig?.isAuthenticated && existingConfig.maskedKey && (
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-white">
                  Active Configuration Detected: <span className="text-emerald-400">{existingConfig.provider}</span>
                </p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Encrypted Key: {existingConfig.maskedKey}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Active
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <button
              onClick={onAuthenticated}
              className="py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-indigo-600/20"
            >
              <ArrowRight className="w-4 h-4" />
              Continue to Dashboard
            </button>
            <button
              onClick={handleLogout}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Reset / Re-enter Key
            </button>
          </div>
        </div>
      )}

      {/* Onboarding & Key Setup Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-400" />
            {existingConfig?.isAuthenticated ? 'Update API Key & Provider' : 'Enter API Key to Begin'}
          </h2>
          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Local Fernet Encryption
          </span>
        </div>

        {/* Status Alerts (st.success / st.error equivalent) */}
        {statusMsg && (
          <div
            className={`p-4 rounded-xl text-xs flex items-start gap-3 transition-all ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : statusMsg.type === 'error'
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                : 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : statusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 animate-spin text-indigo-400" />
            )}
            <div className="flex-1 font-medium">{statusMsg.text}</div>
          </div>
        )}

        <form onSubmit={handleSaveCredentials} className="space-y-5">
          {/* Provider Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Provider Name
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="Gemini">Gemini (Recommended - Google GenAI SDK)</option>
              <option value="Groq">Groq (High-speed Llama 3 translation)</option>
              <option value="OpenAI">OpenAI (GPT-4o / Compatible)</option>
              <option value="DeepSeek">DeepSeek (OpenAI-compatible)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Select your AI service provider for manga OCR and dialogue localization.
            </p>
          </div>

          {/* API Key Input (Password field) */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              API Key (st.text_input password type)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key here (e.g. AIzaSy...)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 transition"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Your key is encrypted on your machine and stored safely in user_config.json.
            </p>
          </div>

          {/* Actions: Test Connection & Save */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSaving}
              className="py-3 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {isTesting ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
              <span>Test Connection</span>
            </button>

            <button
              type="submit"
              disabled={isTesting || isSaving}
              className="py-3 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/30"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Save & Encrypt Credentials</span>
            </button>
          </div>
        </form>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-400 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-slate-300">How encryption works:</strong> When you save your key, it is encrypted via Fernet (AES-128-CBC with HMAC-SHA256 integrity verification) before being written to disk. The decryption key is held securely in <code className="text-slate-300">.secret.key</code>.
          </div>
        </div>
      </div>
    </div>
  );
};
