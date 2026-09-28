import React, { useState, useEffect } from 'react';
import { KeyStats, RoutingEvent } from '../types';
import { Activity, RefreshCw, Cpu, CheckCircle2, AlertTriangle, ShieldAlert, ArrowRightLeft } from 'lucide-react';

interface Props {
  onRefresh: () => void;
}

export const TrackerView: React.FC<Props> = ({ onRefresh }) => {
  const [stats, setStats] = useState<KeyStats[]>([]);
  const [events, setEvents] = useState<RoutingEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchTrackerData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tracker/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || []);
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch tracker stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackerData();
  }, []);

  const handleManualRefresh = () => {
    fetchTrackerData();
    onRefresh();
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Live Token & Routing Tracker
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">
            Real-time multi-model telemetry, rate-limit cooldown monitors, and fallback routing logs.
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-2 transition cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </button>
      </div>

      {/* Key Status Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Key & Model Status
        </h2>

        {stats.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            No API activity recorded yet. Translate manga pages to view real-time token tracking!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {stats.map((stat) => {
              const providerBadge =
                stat.provider === 'gemini'
                  ? '🔵 Gemini'
                  : stat.provider === 'openai'
                  ? '🟢 OpenAI'
                  : '🟣 DeepSeek';

              const rateLimitRatio =
                stat.totalRequests > 0
                  ? Math.min(1.0, stat.rateLimitHits / stat.totalRequests)
                  : 0;

              return (
                <div
                  key={stat.keyId}
                  className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate max-w-[180px]" title={stat.keyName}>
                        {stat.keyName}
                      </h3>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{providerBadge}</span>
                    </div>

                    {/* Status Badge */}
                    {stat.isRateLimited ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Cooldown
                      </span>
                    ) : stat.rateLimitHits > 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> Rate-Limited
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    )}
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200 dark:border-slate-800/80">
                    <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800/50">
                      <span className="text-[10px] uppercase font-semibold text-slate-500">Requests</span>
                      <p className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{stat.totalRequests}</p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800/50">
                      <span className="text-[10px] uppercase font-semibold text-slate-500">Tokens Used</span>
                      <p className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {stat.totalTokens.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Rate Limit Ratio Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-500 dark:text-slate-400">Rate Limit Ratio</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{(rateLimitRatio * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          rateLimitRatio > 0.3 ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(4, rateLimitRatio * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Routing Log Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Live Routing Log ({events.length} events)
        </h2>

        {events.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            No routing events recorded yet.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Key / Route</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Detail</th>
                    <th className="py-3 px-4 text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                  {events.map((e) => {
                    const actionBadge =
                      e.action === 'request_ok' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> request_ok
                        </span>
                      ) : e.action === 'rate_limited' ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                          <ShieldAlert className="w-3.5 h-3.5" /> rate_limited
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                          <ArrowRightLeft className="w-3.5 h-3.5" /> fallback
                        </span>
                      );

                    const timeStr = new Date(e.timestamp).toLocaleTimeString();

                    return (
                      <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{timeStr}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-200">{e.keyName}</td>
                        <td className="py-2.5 px-4 whitespace-nowrap">{actionBadge}</td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 font-sans max-w-md truncate" title={e.detail}>
                          {e.detail}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                          {e.tokensUsed > 0 ? `+${e.tokensUsed}` : '0'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
