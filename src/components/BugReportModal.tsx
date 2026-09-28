import React, { useState, useRef } from 'react';
import {
  X,
  Bug,
  Upload,
  Send,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Image as ImageIcon,
  Trash2,
  Mail,
  Loader2,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultImage?: string;
  recentLogs?: string[];
}

export const BugReportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultImage,
  recentLogs = [],
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(defaultImage || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [mailtoUrl, setMailtoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageDataUrl(reader.result as string);
        setErrorMessage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMessage('Please enter a description of the issue.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const systemInfo = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      time: new Date().toISOString(),
      url: window.location.href,
    };

    try {
      const res = await fetch('/api/report-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Manga Translator Bug Report',
          description: description.trim(),
          userEmail: userEmail.trim() || undefined,
          imageDataUrl: imageDataUrl || undefined,
          systemInfo,
          logs: recentLogs,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit bug report');
      }

      const data = await res.json();
      setReportId(data.reportId || 'BUG-' + Date.now().toString().slice(-6));
      setMailtoUrl(data.mailtoUrl || `mailto:studyaccformeonly@gmail.com?subject=Bug%20Report`);
      setSubmitSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error sending report. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUserEmail('');
    setImageDataUrl(defaultImage || null);
    setSubmitSuccess(false);
    setErrorMessage(null);
    setReportId(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Report a Bug</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Forwarding directly to <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">studyaccformeonly@gmail.com</span>
              </p>
            </div>
          </div>
          <button
            onClick={resetForm}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {submitSuccess ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">Bug Report Dispatched!</h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-md mx-auto">
                  Thank you! Your bug report and diagnostic package have been logged and queued for delivery to{' '}
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">studyaccformeonly@gmail.com</span>.
                </p>
                {reportId && (
                  <div className="mt-3 inline-block px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-300">
                    Report ID: <span className="font-bold">{reportId}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                {mailtoUrl && (
                  <a
                    href={mailtoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
                  >
                    <Mail className="w-4 h-4" />
                    Open in Email Client / Gmail
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Issue Summary (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Speech bubble translation cut off, OCR missed vertical text..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description of the Problem <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what went wrong, which page or series you were localizing, and what you expected to see..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Your Email (optional, for follow-up)
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Image attachment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Attach Screenshot or Manga Image (optional)
                </label>

                {imageDataUrl ? (
                  <div className="relative rounded-xl border border-slate-200 dark:border-slate-800 p-2 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <img
                        src={imageDataUrl}
                        alt="Attached bug preview"
                        className="w-14 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-800 shrink-0"
                      />
                      <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        <span className="font-semibold text-slate-900 dark:text-white block">Image Attached</span>
                        <span className="text-[11px] text-slate-500 block">Ready to send with bug report</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImageDataUrl(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      title="Remove image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-xl p-4 text-center cursor-pointer transition bg-slate-50/50 dark:bg-slate-950/50"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Upload className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium block">
                      Click to upload screenshot or drag and drop
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">PNG, JPG, or WebP</span>
                  </div>
                )}
              </div>

              {/* Destination notice */}
              <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  Delivering to: <strong className="font-mono">studyaccformeonly@gmail.com</strong>
                </span>
                <span className="text-[10px] text-indigo-500">AES-128 Local Logged</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white shadow-lg shadow-rose-600/20 transition cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending Report...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Send Bug Report
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
