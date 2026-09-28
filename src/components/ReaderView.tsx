import React, { useState } from 'react';
import { MangaPage } from '../types';
import {
  BookOpen,
  LayoutGrid,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  Sparkles,
  Info,
  Maximize2,
  FileCheck2,
} from 'lucide-react';
import JSZip from 'jszip';
import { fetchSampleMangaPages } from '../utils/sampleManga';
import { composePage } from '../utils/canvasComposer';
import { TranslatedRegion } from '../types';

interface Props {
  pages: MangaPage[];
  setPages?: React.Dispatch<React.SetStateAction<MangaPage[]>>;
  onUploadMore: () => void;
}

export const ReaderView: React.FC<Props> = ({ pages, setPages, onUploadMore }) => {
  const [viewMode, setViewMode] = useState<'reader' | 'gallery'>('reader');
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [splitSliderPos, setSplitSliderPos] = useState<number>(50); // 0 to 100%
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [isSideBySide, setIsSideBySide] = useState<boolean>(false);
  const [selectedBubbleId, setSelectedBubbleId] = useState<number | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState<boolean>(false);

  const handleLoadAll8SamplePagesInReader = async () => {
    setIsLoadingSamples(true);
    try {
      const sampleList = await fetchSampleMangaPages();
      const updatedList: MangaPage[] = [];

      for (let i = 0; i < sampleList.length; i++) {
        const page = sampleList[i];
        const res = await fetch('/api/detect-and-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: page.originalDataUrl,
            filename: page.filename,
            seriesContext: 'Manga Series',
            targetLanguage: 'English',
            annotationMode: false,
            confidenceThreshold: 0.15,
            width: page.width,
            height: page.height,
          }),
        });

        const data = await res.json().catch(() => ({}));
        const regions: TranslatedRegion[] = data.regions || [];

        const imgElement = new Image();
        imgElement.src = page.originalDataUrl;
        await new Promise((r) => (imgElement.onload = r));

        const canvasUrl = await composePage(imgElement, regions, {
          annotationMode: false,
          bgColor: '#ffffff',
          textColor: '#000000',
        });

        updatedList.push({
          ...page,
          status: 'completed',
          regions,
          translatedDataUrl: canvasUrl,
          tokensUsed: data.tokensUsed || 280,
        });
      }

      if (setPages) {
        setPages(updatedList);
      }
      setCurrentPageIndex(0);
    } catch (err) {
      console.warn('Failed to load sample pages in reader:', err);
    } finally {
      setIsLoadingSamples(false);
    }
  };

  // Available pages with translation or at least original
  const readyPages = pages.filter((p) => p.status === 'completed' || p.translatedDataUrl);

  if (readyPages.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mx-auto">
          <BookOpen className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">No Translated Pages in Reader</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
            Load all 8 sample manga chapter pages instantly, or upload and translate custom files.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleLoadAll8SamplePagesInReader}
            disabled={isLoadingSamples}
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 disabled:opacity-50 text-white text-sm transition shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-200" />
            {isLoadingSamples ? 'Localizing 8 Pages...' : '✨ Load All 8 Sample Manga Pages'}
          </button>
          <button
            onClick={onUploadMore}
            className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm border border-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            Go to Upload & Translate →
          </button>
        </div>
      </div>
    );
  }

  const activePage = readyPages[Math.min(currentPageIndex, readyPages.length - 1)];

  // Single page download helper
  const handleDownloadSingle = (page: MangaPage, useOriginal: boolean = false) => {
    const url = useOriginal ? page.originalDataUrl : (page.translatedDataUrl || page.originalDataUrl);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${useOriginal ? 'original' : 'translated'}_${page.filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Batch ZIP download helper
  const handleDownloadAllZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < readyPages.length; i++) {
        const page = readyPages[i];
        const dataUrl = page.translatedDataUrl || page.originalDataUrl;
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        zip.file(`translated_${page.filename.replace(/\.[^/.]+$/, '')}.png`, base64Data, { base64: true });
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'manga_translated_batch.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to create ZIP batch:', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header & View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Manga Reader
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {readyPages.length} localized chapter pages ready for viewing and export
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 flex items-center">
            <button
              onClick={() => setViewMode('reader')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'reader'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Reader
            </button>
            <button
              onClick={() => setViewMode('gallery')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'gallery'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Gallery
            </button>
          </div>

          <button
            onClick={handleLoadAll8SamplePagesInReader}
            disabled={isLoadingSamples}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            title="Load & test all 8 sample manga chapter pages"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-300" />
            {isLoadingSamples ? 'Localizing...' : 'Load 8 Samples'}
          </button>

          <button
            onClick={handleDownloadAllZip}
            disabled={isZipping}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-2 transition cursor-pointer shadow-sm"
          >
            <Download className="w-4 h-4" />
            {isZipping ? 'Generating ZIP...' : 'Download All (ZIP)'}
          </button>
        </div>
      </div>

      {/* ── Gallery View ─────────────────────────────────────────────── */}
      {viewMode === 'gallery' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {readyPages.map((page, idx) => (
            <div
              key={page.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all flex flex-col group shadow-md"
            >
              <div className="relative aspect-[3/4] bg-slate-100 dark:bg-black/40 overflow-hidden">
                <img
                  src={page.translatedDataUrl || page.originalDataUrl}
                  alt={page.filename}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-mono text-slate-200">
                  Page {idx + 1}
                </div>
                {page.regions && page.regions.length > 0 && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-indigo-600/80 backdrop-blur-sm text-[10px] font-medium text-white">
                    {page.regions.length} bubbles
                  </div>
                )}
              </div>

              <div className="p-3.5 flex flex-col justify-between flex-1 space-y-3">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate" title={page.filename}>
                  {page.filename}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => {
                      setCurrentPageIndex(idx);
                      setViewMode('reader');
                    }}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Read
                  </button>

                  <button
                    onClick={() => handleDownloadSingle(page, false)}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    DL
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Reader View ─────────────────────────────────────────────── */
        <div className="space-y-6">
          {/* Navigation Controls Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <button
              onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentPageIndex === 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev Page
            </button>

            <div className="text-center">
              <span className="text-base font-bold text-slate-900 dark:text-white">
                Page {currentPageIndex + 1}{' '}
                <span className="text-slate-400 font-normal">of {readyPages.length}</span>
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">{activePage.filename}</p>
            </div>

            <button
              onClick={() => setCurrentPageIndex((prev) => Math.min(readyPages.length - 1, prev + 1))}
              disabled={currentPageIndex === readyPages.length - 1}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              Next Page
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View Mode & Comparison Controls */}
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 text-xs shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Side-by-Side Mode Toggle */}
              <button
                onClick={() => {
                  setIsSideBySide((prev) => !prev);
                  if (!isSideBySide) setIsSplitMode(false);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  isSideBySide
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Side-by-Side Mode
              </button>

              {/* Before/After Split Comparison Slider Toggle */}
              <button
                onClick={() => {
                  setIsSplitMode((prev) => !prev);
                  if (!isSplitMode) setIsSideBySide(false);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  isSplitMode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Split Wipe Slider
              </button>

              {/* Original/Translated Toggle (Single view) */}
              {!isSideBySide && !isSplitMode && (
                <button
                  onClick={() => setShowOriginal((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    showOriginal
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  {showOriginal ? 'Showing: Original Japanese' : 'Showing: Translated'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadSingle(activePage, false)}
                className="px-3 py-1.5 rounded-lg font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Page PNG
              </button>
            </div>
          </div>

          {/* Split Mode Slider bar if active */}
          {isSplitMode && (
            <div className="bg-white dark:bg-slate-900 border border-indigo-500/30 rounded-xl p-3 flex items-center gap-4 shadow-xs">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 shrink-0">Original (Left)</span>
              <input
                type="range"
                min="0"
                max="100"
                value={splitSliderPos}
                onChange={(e) => setSplitSliderPos(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">Translated (Right)</span>
            </div>
          )}

          {/* Main Manga Canvas Display */}
          {isSideBySide ? (
            /* Side-by-Side Comparison Mode (2 Columns) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-lg">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span>🇯🇵 Original Japanese Art</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {activePage.width} × {activePage.height}
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-2 min-h-[500px] max-h-[750px]">
                  <img
                    src={activePage.originalDataUrl}
                    alt="Original Manga Page"
                    className="object-contain max-h-[730px] w-auto max-w-full rounded"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span>🇬🇧 Localized Manga Page</span>
                  <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                    {activePage.regions.length} Bubbles Localized
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-black/60 border border-emerald-500/20 flex items-center justify-center p-2 min-h-[500px] max-h-[750px]">
                  <img
                    src={activePage.translatedDataUrl || activePage.originalDataUrl}
                    alt="Localized Manga Page"
                    className="object-contain max-h-[730px] w-auto max-w-full rounded"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Single Canvas Display or Split Wipe */
            <div className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-slate-800 flex justify-center items-center min-h-[600px] max-h-[880px] p-2">
              {isSplitMode ? (
                // Split Comparison Container
                <div className="relative max-h-[850px] overflow-hidden select-none">
                  {/* Right / Base Image: Translated */}
                  <img
                    src={activePage.translatedDataUrl || activePage.originalDataUrl}
                    alt="Translated"
                    className="object-contain max-h-[850px] w-auto max-w-full block"
                  />

                  {/* Left Clipped Image: Original */}
                  <div
                    className="absolute inset-0 overflow-hidden pointer-events-none"
                    style={{ width: `${splitSliderPos}%` }}
                  >
                    <img
                      src={activePage.originalDataUrl}
                      alt="Original"
                      className="object-contain max-h-[850px] w-auto max-w-none block"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left' }}
                    />
                  </div>

                  {/* Divider Line */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-indigo-500 pointer-events-none shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                    style={{ left: `${splitSliderPos}%` }}
                  >
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center -ml-2.5 top-1/2 -mt-3 absolute shadow-md border border-white">
                      ↔
                    </div>
                  </div>
                </div>
              ) : (
                // Normal Single Mode
                <div className="relative max-h-[850px] flex items-center justify-center">
                  <img
                    src={
                      showOriginal
                        ? activePage.originalDataUrl
                        : (activePage.translatedDataUrl || activePage.originalDataUrl)
                    }
                    alt={activePage.filename}
                    className="object-contain max-h-[850px] w-auto max-w-full rounded-lg"
                  />

                  {/* Interactive Speech Bubble Click Overlays if regions exist */}
                  {!showOriginal &&
                    activePage.regions &&
                    activePage.regions.map((reg) => {
                      // Calculate relative % coords
                      const leftPct = (reg.bbox.x0 / activePage.width) * 100;
                      const topPct = (reg.bbox.y0 / activePage.height) * 100;
                      const widthPct = ((reg.bbox.x1 - reg.bbox.x0) / activePage.width) * 100;
                      const heightPct = ((reg.bbox.y1 - reg.bbox.y0) / activePage.height) * 100;

                      const isSelected = selectedBubbleId === reg.id;

                      return (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => setSelectedBubbleId(isSelected ? null : reg.id)}
                          className={`absolute border rounded transition-all cursor-pointer ${
                            isSelected
                              ? 'border-indigo-400 bg-indigo-500/20 ring-2 ring-indigo-400'
                              : 'border-transparent hover:border-indigo-400/60 hover:bg-indigo-500/10'
                          }`}
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            height: `${heightPct}%`,
                          }}
                          title={`Click to inspect bubble ${reg.id}`}
                        />
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Dedicated Export Engine Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                💾 Export Engine (Processed Pages)
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                High-resolution PNG or full chapter in-memory ZIP package
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => handleDownloadSingle(activePage, false)}
                className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2.5 transition text-xs font-semibold cursor-pointer"
              >
                <FileCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Download Single Page ({activePage.filename})
              </button>

              <button
                onClick={handleDownloadAllZip}
                disabled={isZipping}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2.5 transition text-xs font-bold cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                <Download className="w-4 h-4" />
                {isZipping ? 'Bundling Volume in Memory...' : `Download Full Volume (${readyPages.length} Pages ZIP)`}
              </button>
            </div>
          </div>

          {/* Dialogue Bubble Inspector Section */}
          {activePage.regions && activePage.regions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Dialogue Inspector ({activePage.regions.length} Detected Regions)
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Click any dialogue box above or list item below to highlight
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                {activePage.regions.map((reg, idx) => {
                  const isSelected = selectedBubbleId === reg.id;
                  return (
                    <div
                      key={reg.id}
                      onClick={() => setSelectedBubbleId(isSelected ? null : reg.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between space-y-1.5 ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-400 dark:border-indigo-500 text-slate-900 dark:text-white'
                          : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">Region #{idx + 1}</span>
                        <span className="text-slate-400 dark:text-slate-500 uppercase">{reg.bbox.category}</span>
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">"{reg.translatedText}"</p>
                      {reg.originalText && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans italic">
                          JP: {reg.originalText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
