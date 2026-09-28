import React, { useState, useEffect } from 'react';
import { ApiKeyEntry } from '../types';
import { KeyRound, Plus, Trash2, Power, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  onKeysChanged: () => void;
}

export const ApiKeysView: React.FC<Props> = ({ onKeysChanged }) => {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [name, setName] = useState<string>('');
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'deepseek'>('gemini');
  const [apiKey, setApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      }
    } catch (err) {
      console.error('Failed to fetch keys:', err);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim()) {
      setErrorMsg('Please provide both a key name and an API key.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, provider, apiKey }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save key');
      }

      setSuccessMsg(`Key "${name}" saved successfully!`);
      setName('');
      setApiKey('');
      await fetchKeys();
      onKeysChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleKey = async (id: string) => {
    try {
      const res = await fetch(`/api/keys/${id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        await fetchKeys();
        onKeysChanged();
      }
    } catch (err) {
      console.error('Failed to toggle key:', err);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchKeys();
        onKeysChanged();
      }
    } catch (err) {
      console.error('Failed to delete key:', err);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
          <KeyRound className="w-8 h-8 text-indigo-400" />
          API Key Manager
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Manage your translation service API keys. Keys are handled server-side through a secure proxy and never exposed to the browser.
        </p>
      </div>

      {/* Add Key Form */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-400" />
          Add API Key
        </h2>

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAddKey} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Key Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My Gemini 3.8 Key"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="gemini">Google Gemini (Default)</option>
                <option value="openai">OpenAI (GPT-4o / Compatible)</option>
                <option value="deepseek">DeepSeek (OpenAI-compatible)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              API Key Token
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key here (e.g. AIzaSy...)"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs shadow-md shadow-indigo-500/20 flex items-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Save Key
            </button>
          </div>
        </form>
      </div>

      {/* Saved Keys List */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Saved Keys ({keys.length})
        </h2>

        {keys.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
            No API keys saved yet.
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => {
              const providerBadge =
                key.provider === 'gemini'
                  ? '🔵 Gemini'
                  : key.provider === 'openai'
                  ? '🟢 OpenAI'
                  : '🟣 DeepSeek';

              return (
                <div
                  key={key.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        key.isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-600'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{key.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-800 text-slate-300">
                          {providerBadge}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-slate-400 mt-0.5">{key.maskedKey}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleKey(key.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                        key.isActive
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {key.isActive ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      onClick={() => handleDeleteKey(key.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
