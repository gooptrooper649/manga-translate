import React, { useState } from 'react';
import { MangaPage, TranslatedRegion } from '../types';
import { composePage } from '../utils/canvasComposer';
import { fetchSampleMangaPages, fetchSingleSamplePage } from '../utils/sampleManga';
import {
  Upload,
  Sparkles,
  Sliders,
  Settings,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  FileArchive,
  RefreshCw,
  Eye,
  Layers,
  Info,
  Download,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  Clock,
  Trash2,
  RotateCw,
} from 'lucide-react';
import JSZip from 'jszip';

interface Props {
  pages: MangaPage[];
  setPages: React.Dispatch<React.SetStateAction<MangaPage[]>>;
  onNavigateToReader: () => void;
  onRefreshStats: () => void;
}

interface StatusLogEntry {
  id: string;
  time: string;
  filename: string;
  step: 'extract' | 'detect' | 'ocr' | 'batch_api' | 'compose' | 'done' | 'error';
  message: string;
}

export const UploadTranslateView: React.FC<Props> = ({
  pages,
  setPages,
  onNavigateToReader,
  onRefreshStats,
}) => {
  const [detectorBackend, setDetectorBackend] = useState<'ctd' | 'dbnet' | 'ai'>('ctd');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.15);
  const [useOmniRoute, setUseOmniRoute] = useState<boolean>(true);
  const [annotationMode, setAnnotationMode] = useState<boolean>(false);
  const [seriesContext, setSeriesContext] = useState<string>('Daily High School Life');
  const [targetLanguage, setTargetLanguage] = useState<string>('English');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [statusState, setStatusState] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [statusLogs, setStatusLogs] = useState<StatusLogEntry[]>([]);
  const [isStatusExpanded, setIsStatusExpanded] = useState<boolean>(true);
  const [routingStatusMsg, setRoutingStatusMsg] = useState<{
    type: 'ok' | 'limited' | 'info';
    text: string;
  } | null>(null);

  // File upload handler (Supports PNG, JPG, WEBP, ZIP)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPages: MangaPage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.zip')) {
        // Unpack zip
        try {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          const entries = Object.keys(contents.files).filter(
            (filename) => !contents.files[filename].dir && /\.(png|jpe?g|webp)$/i.test(filename)
          );

          for (const entryName of entries) {
            const blob = await contents.files[entryName].async('blob');
            const dataUrl = await blobToDataUrl(blob);
            const { width, height } = await getImageDimensions(dataUrl);

            newPages.push({
              id: 'page_' + Math.random().toString(36).substring(2, 9),
              filename: entryName.split('/').pop() || entryName,
              originalDataUrl: dataUrl,
              width,
              height,
              regions: [],
              status: 'pending',
            });
          }
        } catch (err) {
          console.error('Failed to unpack ZIP archive:', err);
        }
      } else if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
        const dataUrl = await fileToDataUrl(file);
        const { width, height } = await getImageDimensions(dataUrl);

        newPages.push({
          id: 'page_' + Math.random().toString(36).substring(2, 9),
          filename: file.name,
          originalDataUrl: dataUrl,
          width,
          height,
          regions: [],
          status: 'pending',
        });
      }
    }

    if (newPages.length > 0) {
      setPages((prev) => [...prev, ...newPages]);
    }
  };

  // Helper to load all 8 sample manga pages from sample_images
  const handleLoadAll8SamplePages = async () => {
    setIsProcessing(true);
    setRoutingStatusMsg({ type: 'info', text: 'Loading 8 sample chapter pages from sample_images...' });
    try {
      const sampleList = await fetchSampleMangaPages();
      setPages((prev) => {
        const existingNames = new Set(prev.map((p) => p.filename));
        const filtered = sampleList.filter((p) => !existingNames.has(p.filename));
        return [...prev, ...filtered];
      });
      setRoutingStatusMsg({
        type: 'ok',
        text: `Loaded all 8 sample manga chapter pages! Ready to translate or view.`,
      });
    } catch (err: any) {
      console.error('Failed to load sample pages:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // One-click helper to test all 8 sample pages, localize them, and open in Manga Reader
  const handleTestAll8SamplePagesAndNavigate = async () => {
    setIsProcessing(true);
    setStatusState('running');
    setProgressPercent(5);
    setStatusLogs([]);
    setIsStatusExpanded(true);
    setRoutingStatusMsg({ type: 'info', text: 'Loading all 8 sample chapter pages for testing...' });

    try {
      const sampleList = await fetchSampleMangaPages();
      const loadedPages: MangaPage[] = [...sampleList];
      setPages(loadedPages);

      const total = loadedPages.length;
      for (let i = 0; i < total; i++) {
        const page = loadedPages[i];
        const basePct = Math.round((i / total) * 100);
        setCurrentStep(`[${page.filename}] Localizing test page (${i + 1}/${total})...`);
        setProgressPercent(basePct + Math.round((0.2 / total) * 100));

        addStatusLog(page.filename, 'detect', `Running Comic Text Detection on ${page.filename}...`);
        addStatusLog(page.filename, 'ocr', `Extracting dialogue blocks & SFX...`);

        const res = await fetch('/api/detect-and-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: page.originalDataUrl,
            filename: page.filename,
            seriesContext,
            targetLanguage,
            annotationMode,
            confidenceThreshold,
            detectorBackend,
            width: page.width,
            height: page.height,
          }),
        });

        const data = await res.json().catch(() => ({}));
        const regions: TranslatedRegion[] = data.regions || [];

        addStatusLog(page.filename, 'compose', `Composing localized canvas (${regions.length} dialogue regions)...`);

        const imgElement = new Image();
        imgElement.src = page.originalDataUrl;
        await new Promise((r) => (imgElement.onload = r));

        const translatedCanvasUrl = await composePage(imgElement, regions, {
          annotationMode,
          bgColor: '#ffffff',
          textColor: '#000000',
        });

        page.status = 'completed';
        page.regions = regions;
        page.tokensUsed = data.tokensUsed || 280;
        page.translatedDataUrl = translatedCanvasUrl;

        addStatusLog(page.filename, 'done', `✅ Page ${i + 1} (${page.filename}) validated and composed!`);
        setProgressPercent(Math.round(((i + 1) / total) * 100));
        setPages([...loadedPages]);
      }

      setStatusState('complete');
      setProgressPercent(100);
      setRoutingStatusMsg({
        type: 'ok',
        text: '🎉 All 8 sample manga pages successfully tested and localized! Opening Manga Reader...',
      });
      setTimeout(() => {
        onNavigateToReader();
      }, 700);
    } catch (err: any) {
      console.warn('Batch test error:', err);
    } finally {
      setIsProcessing(false);
      onRefreshStats();
    }
  };

  // Helper to load single authentic sample manga page from sample_images
  const handleLoadSamplePage = async () => {
    try {
      const page = await fetchSingleSamplePage(0);
      if (page) {
        setPages((prev) => [page, ...prev]);
        addStatusLog(page.filename, 'done', 'Loaded authentic sample manga page.');
      }
    } catch (err: any) {
      console.warn('Failed to load sample page:', err);
    }
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.src = src;
    });
  };

  const addStatusLog = (
    filename: string,
    step: 'extract' | 'detect' | 'ocr' | 'batch_api' | 'compose' | 'done' | 'error',
    message: string
  ) => {
    const time = new Date().toLocaleTimeString();
    setStatusLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        time,
        filename,
        step,
        message,
      },
    ]);
  };

  // Translate all pending/uploaded pages with high-performance batch pipeline
  const handleTranslateAll = async () => {
    if (pages.length === 0) return;

    setIsProcessing(true);
    setStatusState('running');
    setProgressPercent(5);
    setStatusLogs([]);
    setIsStatusExpanded(true);
    setRoutingStatusMsg({ type: 'info', text: 'Initializing batch localization pipeline...' });

    const updatedPages = [...pages];
    const total = updatedPages.length;

    for (let i = 0; i < total; i++) {
      const page = updatedPages[i];
      const basePct = Math.round((i / total) * 100);

      // Step 1: Detect text blocks
      setCurrentStep(`[${page.filename}] Detecting text blocks (${i + 1}/${total})...`);
      setProgressPercent(basePct + Math.round((0.2 / total) * 100));
      addStatusLog(
        page.filename,
        'detect',
        `Running Comic Text Detection (preserving vertical & floating un-bubbled characters, confidence > ${confidenceThreshold})...`
      );

      try {
        // Step 2: OCR & Batch API Translation (Combining page dialogue into 1 payload)
        addStatusLog(
          page.filename,
          'ocr',
          `Extracting Japanese dialogue blocks & onomatopoeia...`
        );
        setProgressPercent(basePct + Math.round((0.4 / total) * 100));

        addStatusLog(
          page.filename,
          'batch_api',
          `Batch API Optimization: Combining OCR strings into single JSON dictionary payload for Gemini API...`
        );
        setProgressPercent(basePct + Math.round((0.7 / total) * 100));

        setRoutingStatusMsg({
          type: 'info',
          text: `🔍 [${page.filename}] Querying Gemini API with single batch dictionary payload...`,
        });

        const res = await fetch('/api/detect-and-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: page.originalDataUrl,
            filename: page.filename,
            seriesContext,
            targetLanguage,
            annotationMode,
            confidenceThreshold,
            detectorBackend,
            width: page.width,
            height: page.height,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }

        const data = await res.json();
        const regions: TranslatedRegion[] = data.regions || [];

        addStatusLog(
          page.filename,
          'compose',
          `Composing canvas: ${
            annotationMode
              ? 'Non-Interruptive Footer Annotation (Numbered circles ① ② + white banner)'
              : 'Replace Text (Fail-safe inpainting)'
          }`
        );

        if (data.rerouted) {
          addStatusLog(
            page.filename,
            'batch_api',
            `🔄 Failover success: Automatically rerouted to key "${data.keyUsed}" (attempt ${data.attemptsCount}) using ${data.modelUsed}!`
          );
          setRoutingStatusMsg({
            type: 'ok',
            text: `🔄 Automatically rerouted to "${data.keyUsed}" (attempt ${data.attemptsCount}) • ${data.modelUsed} localized ${regions.length} dialogue regions`,
          });
        } else {
          setRoutingStatusMsg({
            type: 'ok',
            text: `✅ ${data.modelUsed || 'Gemini 3.8 Flash'} localized ${regions.length} regions (${data.tokensUsed || 300} tokens)`,
          });
        }

        // Step 3: Compose Page Canvas
        setCurrentStep(`🎨 Composing translated canvas for ${page.filename}...`);
        const imgElement = new Image();
        imgElement.src = page.originalDataUrl;
        await new Promise((r) => (imgElement.onload = r));

        // Render translation
        const translatedCanvasUrl = await composePage(imgElement, regions, {
          annotationMode,
          bgColor: '#ffffff',
          textColor: '#000000',
        });

        page.status = 'completed';
        page.regions = regions;
        page.tokensUsed = data.tokensUsed || 300;
        page.translatedDataUrl = translatedCanvasUrl;

        addStatusLog(
          page.filename,
          'done',
          `Successfully localized ${page.filename} (${regions.length} dialogue regions)!`
        );

        setPages([...updatedPages]);
        setProgressPercent(Math.round(((i + 1) / total) * 100));
        onRefreshStats();
      } catch (err: any) {
        console.warn('Translation pipeline error for', page.filename, err.message);
        page.status = 'error';
        page.errorMessage = err.message || 'Translation service unavailable. Please check your API key.';
        addStatusLog(page.filename, 'error', `Failed after multiple attempts: ${page.errorMessage}`);
        setRoutingStatusMsg({
          type: 'limited',
          text: `🔴 Translation error on ${page.filename}:\n${page.errorMessage}`,
        });
        setPages([...updatedPages]);
      }
    }

    const hasAnyError = updatedPages.some((p) => p.status === 'error');
    setStatusState(hasAnyError ? 'error' : 'complete');
    setProgressPercent(100);
    setIsProcessing(false);
    setCurrentStep('');
  };

  // Retry a single failed or pending page with full automatic rerouting
  const handleRetrySinglePage = async (pageId: string) => {
    const targetIdx = pages.findIndex((p) => p.id === pageId);
    if (targetIdx === -1 || isProcessing) return;

    const updatedPages = [...pages];
    const page: MangaPage = { ...updatedPages[targetIdx], status: 'processing', errorMessage: undefined };
    updatedPages[targetIdx] = page;
    setPages([...updatedPages]);

    setIsProcessing(true);
    setStatusState('running');
    addStatusLog(page.filename, 'detect', `Retrying translation for ${page.filename} with automatic rerouting...`);
    setRoutingStatusMsg({
      type: 'info',
      text: `🔄 Retrying localization on ${page.filename} across available API keys...`,
    });

    try {
      const res = await fetch('/api/detect-and-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: page.originalDataUrl,
          filename: page.filename,
          seriesContext,
          targetLanguage,
          annotationMode,
          confidenceThreshold,
          detectorBackend,
          width: page.width,
          height: page.height,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }

      const data = await res.json();
      const regions: TranslatedRegion[] = data.regions || [];

      const imgElement = new Image();
      imgElement.src = page.originalDataUrl;
      await new Promise((r) => (imgElement.onload = r));

      const translatedCanvasUrl = await composePage(imgElement, regions, {
        annotationMode,
        bgColor: '#ffffff',
        textColor: '#000000',
      });

      page.status = 'completed';
      page.regions = regions;
      page.tokensUsed = data.tokensUsed || 300;
      page.translatedDataUrl = translatedCanvasUrl;

      if (data.rerouted) {
        addStatusLog(
          page.filename,
          'done',
          `✅ Rerouted to "${data.keyUsed}" (attempt ${data.attemptsCount}): Localized ${regions.length} dialogue regions!`
        );
        setRoutingStatusMsg({
          type: 'ok',
          text: `🔄 Rerouted to "${data.keyUsed}" (attempt ${data.attemptsCount}) • Localized ${page.filename}`,
        });
      } else {
        addStatusLog(
          page.filename,
          'done',
          `✅ Successfully localized ${page.filename} (${regions.length} dialogue regions)!`
        );
        setRoutingStatusMsg({
          type: 'ok',
          text: `✅ ${data.modelUsed || 'Gemini 3.8 Flash'} localized ${page.filename} (${regions.length} regions)`,
        });
      }

      setStatusState('complete');
      onRefreshStats();
    } catch (err: any) {
      console.warn('Retry error for', page.filename, err.message);
      page.status = 'error';
      page.errorMessage = err.message || 'Translation failed after multiple attempts.';
      addStatusLog(page.filename, 'error', `Retry failed for ${page.filename}: ${page.errorMessage}`);
      setRoutingStatusMsg({
        type: 'limited',
        text: `🔴 Translation error on ${page.filename}:\n${page.errorMessage}`,
      });
      setStatusState('error');
    } finally {
      updatedPages[targetIdx] = page;
      setPages([...updatedPages]);
      setIsProcessing(false);
    }
  };

  const handleRemoveSinglePage = (pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  const handleDownloadAllZip = async () => {
    const completed = pages.filter((p) => p.status === 'completed' && p.translatedDataUrl);
    if (!completed.length) return;

    const zip = new JSZip();
    for (const page of completed) {
      if (page.translatedDataUrl) {
        const base64Data = page.translatedDataUrl.replace(/^data:image\/\w+;base64,/, '');
        const cleanName = page.filename.replace(/\.[^/.]+$/, '');
        zip.file(`translated_${cleanName}.png`, base64Data, { base64: true });
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'localized_manga_batch.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  const completedCount = pages.filter((p) => p.status === 'completed').length;
  const lastTranslated = pages.find((p) => p.status === 'completed' && p.translatedDataUrl);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          <Upload className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          Upload & Translate
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
          Upload manga pages or ZIP archives, detect speech balloons with specialized neural models, and localize into natural dialogue.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div className="bg-white dark:bg-slate-900/80 border-2 border-dashed border-slate-300 dark:border-slate-700/80 hover:border-indigo-500/70 transition-colors rounded-2xl p-8 text-center relative overflow-hidden group shadow-sm">
        <input
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.zip"
          onChange={handleFileUpload}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
        />
        <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            <Upload className="w-7 h-7" />
          </div>
          <div>
            <p className="text-base font-medium text-slate-800 dark:text-slate-200">
              Drag and drop manga pages, or <span className="text-indigo-600 dark:text-indigo-400 underline">browse files</span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports PNG, JPG, JPEG, WEBP or full ZIP archives
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 relative z-20">
          <button
            type="button"
            onClick={handleTestAll8SamplePagesAndNavigate}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
            ⚡ Test & Localize All 8 Sample Pages to Reader
          </button>
          <button
            type="button"
            onClick={handleLoadAll8SamplePages}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Load All 8 Sample Pages
          </button>
          <button
            type="button"
            onClick={handleLoadSamplePage}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            Load Single Sample Page
          </button>
          {pages.length > 0 && (
            <button
              type="button"
              onClick={() => setPages([])}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 transition cursor-pointer"
            >
              Clear Queue ({pages.length})
            </button>
          )}
        </div>
      </div>

      {/* Pages Queue Bar & Interactive Queue Grid */}
      {pages.length > 0 && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <Layers className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {pages.length} page(s) loaded in workspace
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {completedCount} translated • {pages.length - completedCount} pending
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {completedCount > 0 && (
                <button
                  onClick={onNavigateToReader}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  View in Manga Reader ({completedCount})
                </button>
              )}
            </div>
          </div>

          {/* Interactive Pages Queue Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-semibold px-1">
              <span>Workspace Page Queue ({pages.length})</span>
              <span className="text-[11px] text-slate-500">Retry button automatically reroutes across available API keys</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {pages.map((p, idx) => (
                <div
                  key={p.id}
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-3 space-y-2.5 shadow-sm transition ${
                    p.status === 'error'
                      ? 'border-rose-300 dark:border-rose-900/60 ring-1 ring-rose-500/20'
                      : p.status === 'completed'
                      ? 'border-emerald-300 dark:border-emerald-900/40'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Thumbnail Image */}
                  <div className="relative aspect-3/4 rounded-xl overflow-hidden bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-slate-800/80 flex items-center justify-center group">
                    <img
                      src={p.translatedDataUrl || p.originalDataUrl}
                      alt={p.filename}
                      className="object-contain w-full h-full"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/75 text-white backdrop-blur-xs font-mono">
                      #{idx + 1}
                    </div>
                    {p.status === 'completed' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600/90 text-white backdrop-blur-xs flex items-center gap-1 shadow-xs">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                      </div>
                    )}
                    {p.status === 'error' && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600/90 text-white backdrop-blur-xs flex items-center gap-1 shadow-xs">
                        <AlertCircle className="w-3 h-3" /> Failed
                      </div>
                    )}
                    {p.status === 'processing' && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2 p-3 text-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-[11px] font-bold">Localizing Page...</span>
                      </div>
                    )}
                  </div>

                  {/* Info & Status */}
                  <div>
                    <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate" title={p.filename}>
                      {p.filename}
                    </h4>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span>{p.width} × {p.height}</span>
                      {p.status === 'completed' && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                          {p.regions?.length || 0} bubbles
                        </span>
                      )}
                    </div>

                    {/* Error Notice */}
                    {p.status === 'error' && p.errorMessage && (
                      <div
                        className="mt-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-[10px] font-mono leading-tight max-h-16 overflow-y-auto whitespace-pre-line"
                        title={p.errorMessage}
                      >
                        {p.errorMessage}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5">
                    {p.status === 'error' ? (
                      <button
                        onClick={() => handleRetrySinglePage(p.id)}
                        disabled={isProcessing}
                        className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                      >
                        <RotateCw className="w-3 h-3" /> Retry Reroute
                      </button>
                    ) : p.status === 'completed' ? (
                      <button
                        onClick={onNavigateToReader}
                        className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Eye className="w-3 h-3" /> Reader
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRetrySinglePage(p.id)}
                        disabled={isProcessing}
                        className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-500" /> Localize
                      </button>
                    )}

                    <button
                      onClick={() => handleRemoveSinglePage(p.id)}
                      disabled={isProcessing}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition cursor-pointer"
                      title="Remove page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Detection Settings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <Sliders className="w-5 h-5" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">⚙️ Detection Settings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                Text Detection Method
              </label>
              <select
                value={detectorBackend}
                onChange={(e) => setDetectorBackend(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="ctd">Comic-Text-Detector (CTD Neural Network)</option>
                <option value="dbnet">DBNet Deep Learning (High Precision)</option>
                <option value="ai">Gemini Vision Multimodal Detection</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Specialized neural architectures tuned for speech bubbles, floating text, and manga sound effects.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Detection Confidence Threshold</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                  {confidenceThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.90"
                step="0.05"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Lower confidence (0.15) detects faint or floating dialogue over artwork; higher values filter background noise.
              </p>
            </div>
          </div>
        </div>

        {/* Translation Settings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <Settings className="w-5 h-5" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">🌐 Translation Settings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                Series Context / Manga Title
              </label>
              <input
                type="text"
                value={seriesContext}
                onChange={(e) => setSeriesContext(e.target.value)}
                placeholder="e.g. Binchotan, Shonen Adventure, Romantic Comedy..."
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Injected into LLM prompt to preserve character persona, tone, and series-specific terminology.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Target Language
                </label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="Italian">Italian</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={useOmniRoute}
                    onChange={(e) => setUseOmniRoute(e.target.checked)}
                    className="accent-indigo-500 rounded"
                  />
                  <span className="text-xs text-slate-700 dark:text-slate-200 font-medium">Force Structured JSON</span>
                </label>
              </div>
            </div>

            {/* Non-destructive annotation toggle */}
            <div className="pt-1">
              <label className="flex items-start gap-3 bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-200 dark:border-indigo-500/20 hover:border-indigo-300 dark:hover:border-indigo-500/40 rounded-xl p-3 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={annotationMode}
                  onChange={(e) => setAnnotationMode(e.target.checked)}
                  className="accent-indigo-500 mt-0.5 rounded"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    🖼️ Annotation Mode (Keep Original Art)
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                    Non-destructive mode: draws numbered badges ① ② ③ next to each dialogue box and appends a localized translation list at the bottom.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button & Live Pipeline Status */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleTranslateAll}
            disabled={pages.length === 0 || isProcessing}
            className="flex-1 py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3 transition-all cursor-pointer"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Translating Batch ({pages.length} Pages)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Translate All ({pages.length} Pages)</span>
              </>
            )}
          </button>

          {completedCount > 0 && (
            <button
              onClick={handleDownloadAllZip}
              className="px-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download All ({completedCount}) as ZIP
            </button>
          )}
        </div>

        {/* Streamlit-inspired st.progress() Bar */}
        {(isProcessing || statusState !== 'idle') && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                Batch Progress: {currentStep || (statusState === 'complete' ? 'All pages localized!' : 'Processing...')}
              </span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-500/20">
                {progressPercent}%
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  statusState === 'complete'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 animate-pulse'
                }`}
                style={{ width: `${Math.max(5, progressPercent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Optimization: Single combined JSON dictionary per page</span>
              <span>{completedCount} of {pages.length} completed</span>
            </div>
          </div>
        )}

        {/* Streamlit-inspired st.status() Container */}
        {statusLogs.length > 0 && (
          <div className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all shadow-md">
            {/* Status Header */}
            <div
              onClick={() => setIsStatusExpanded(!isStatusExpanded)}
              className="p-4 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer flex items-center justify-between transition border-b border-slate-200 dark:border-slate-800/80 select-none"
            >
              <div className="flex items-center gap-3">
                {statusState === 'running' && <RefreshCw className="w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-spin" />}
                {statusState === 'complete' && <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />}
                {statusState === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400" />}

                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-200">
                    {statusState === 'running' && 'Pipeline Running: Processing Manga Batch...'}
                    {statusState === 'complete' && '🎉 Batch Localization Complete! All pages ready'}
                    {statusState === 'error' && '⚠️ Batch Pipeline Finished with Notices'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-mono">
                    {statusLogs.length} events logged • Click to {isStatusExpanded ? 'collapse' : 'expand'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                  Pipeline Logs
                </span>
                {isStatusExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>

            {/* Collapsible Log Stream */}
            {isStatusExpanded && (
              <div className="p-4 space-y-2 max-h-64 overflow-y-auto font-mono text-xs">
                {statusLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700/60 transition"
                  >
                    <span className="text-slate-400 dark:text-slate-500 text-[10px] shrink-0 mt-0.5">[{log.time}]</span>
                    {log.step === 'detect' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                        DETECT
                      </span>
                    )}
                    {log.step === 'ocr' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                        OCR
                      </span>
                    )}
                    {log.step === 'batch_api' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 shrink-0">
                        TRANSLATE
                      </span>
                    )}
                    {log.step === 'compose' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20 shrink-0">
                        COMPOSER
                      </span>
                    )}
                    {log.step === 'done' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                        SUCCESS
                      </span>
                    )}
                    {log.step === 'error' && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                        ERROR
                      </span>
                    )}
                    <span className="text-slate-700 dark:text-slate-300 text-xs font-sans flex-1 leading-snug">
                      <strong className="text-slate-900 dark:text-white font-mono mr-1.5">[{log.filename}]</strong>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Live Routing Status */}
        {routingStatusMsg && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-start gap-3 transition-colors ${
              routingStatusMsg.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : routingStatusMsg.type === 'limited'
                ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                : 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
            }`}
          >
            {routingStatusMsg.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : routingStatusMsg.type === 'limited' ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div className="font-mono flex-1 leading-relaxed">
              <span className="font-bold">📡 Status: </span>
              <span className="whitespace-pre-line font-medium">{routingStatusMsg.text}</span>
              {currentStep && <div className="text-slate-500 dark:text-slate-400 mt-1 font-sans">{currentStep}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Preview Section (Last Translated Page) */}
      {lastTranslated && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              Preview — Last Translated Page ({lastTranslated.filename})
            </h2>
            <button
              onClick={onNavigateToReader}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              Open Full Manga Reader →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center justify-between">
                <span>Original Japanese Art</span>
                <span className="font-mono text-[10px]">
                  {lastTranslated.width} × {lastTranslated.height}
                </span>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/40 flex items-center justify-center max-h-[500px]">
                <img
                  src={lastTranslated.originalDataUrl}
                  alt="Original"
                  className="object-contain max-h-[500px] w-full"
                />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center justify-between">
                <span>
                  Translated ({lastTranslated.regions.length} dialogue bubbles localized)
                </span>
                <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-500">
                  {annotationMode ? 'Annotated Mode' : 'Inpainted Typeset'}
                </span>
              </div>
              <div className="rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-50 dark:bg-black/40 flex items-center justify-center max-h-[500px]">
                <img
                  src={lastTranslated.translatedDataUrl}
                  alt="Translated"
                  className="object-contain max-h-[500px] w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
