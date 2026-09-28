import { MangaPage } from '../types';

/**
 * Loads authentic sample manga pages directly from the real comic files in /sample_images.
 * No synthetic or wireframe drawings are generated.
 */
export async function fetchSampleMangaPages(): Promise<MangaPage[]> {
  try {
    const res = await fetch('/api/sample-images');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any, idx: number) => ({
          id: item.id || `sample_${idx + 1}_${Date.now()}`,
          filename: item.filename,
          originalDataUrl: item.dataUrl,
          width: item.width || 800,
          height: item.height || 1200,
          regions: [],
          status: 'pending' as const,
        }));
      }
    }
  } catch (err) {
    console.error('Failed to load authentic sample manga pages:', err);
  }
  return [];
}

/**
 * Fetches a single authentic sample page from /sample_images (defaults to page_01.png).
 */
export async function fetchSingleSamplePage(index: number = 0): Promise<MangaPage | null> {
  const pages = await fetchSampleMangaPages();
  if (pages.length > 0) {
    return pages[Math.min(index, pages.length - 1)];
  }
  return null;
}
