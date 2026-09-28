import { TranslatedRegion } from '../types';

const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
  '㉑', '㉒', '㉓', '㉔', '㉕', '㉖', '㉗', '㉘', '㉙', '㉚'
];

/**
 * Fail-Safe Check: Returns true if translation is empty, timed out, or contains an error string.
 * If true, destructive inpainting is completely skipped so original art is never replaced by a blank box.
 */
export function isInvalidTranslation(text?: string): boolean {
  if (!text) return true;
  const cleaned = text.trim();
  if (!cleaned) return true;
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) return true;

  const lower = cleaned.toLowerCase();
  const errorKeywords = [
    'error',
    'timeout',
    'timed out',
    'failed',
    'translation missing',
    'rate limit',
    'no text detected',
    'exception',
    'cannot translate'
  ];

  return errorKeywords.some((kw) => lower.includes(kw));
}

export async function composePage(
  image: HTMLImageElement,
  regions: TranslatedRegion[],
  options: {
    annotationMode?: boolean;
    bgColor?: string;
    textColor?: string;
    padding?: number;
  } = {}
): Promise<string> {
  const { annotationMode = false, bgColor = '#ffffff', textColor = '#000000', padding = 6 } = options;

  if (annotationMode) {
    return composeFooterAnnotation(image, regions, padding);
  } else {
    return composeDestructiveFailSafe(image, regions, bgColor, textColor, padding);
  }
}

/**
 * 'Replace Text' mode with Fail-Safe Inpainting:
 * If translated_text is empty, times out, or contains an error string,
 * the inpainting step is completely skipped so original art is never replaced by a blank white box.
 */
function composeDestructiveFailSafe(
  image: HTMLImageElement,
  regions: TranslatedRegion[],
  bgColor: string,
  textColor: string,
  padding: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return image.src;

  // Draw original base image first
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // Render each bubble only if it has a valid translation
  for (const region of regions) {
    // FAIL-SAFE INPAINTING:
    // If translation is invalid, empty, timed out, or contains an error string,
    // skip inpainting entirely to preserve the original art!
    if (isInvalidTranslation(region.translatedText)) {
      continue;
    }

    const { x0, y0, x1, y1 } = region.bbox;
    const boxW = Math.max(16, x1 - x0);
    const boxH = Math.max(16, y1 - y0);

    // Inpaint / erase bubble content cleanly matching speech bubble interior
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    // Use oval or rounded shape fitting the bubble contour
    const isOval = (region.bbox.category === 'standard_bubble') && (boxW > 40 && boxH > 40);
    if (isOval) {
      // Elliptical inpainting for round manga speech bubbles
      const cx = x0 + boxW / 2;
      const cy = y0 + boxH / 2;
      const rx = (boxW / 2) * 0.95;
      const ry = (boxH / 2) * 0.95;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else {
      const radius = Math.min(12, boxW / 4, boxH / 4);
      ctx.roundRect(x0, y0, boxW, boxH, radius);
    }
    ctx.fill();

    // Render formatted English text in authentic manga comic style
    const text = region.translatedText.trim();
    const innerW = boxW - padding * 2;
    const innerH = boxH - padding * 2;

    if (innerW > 10 && innerH > 10) {
      // Calculate best fitting font size dynamically
      let fontSize = Math.min(24, Math.max(10, Math.floor(innerH / 3.8)));
      let lines: string[] = [];

      while (fontSize >= 8) {
        ctx.font = `bold ${fontSize}px "Comic Sans MS", "Bangers", "Anime Ace", "Arial Rounded MT Bold", system-ui, sans-serif`;
        lines = wrapText(ctx, text, innerW);
        const totalTextHeight = lines.length * (fontSize * 1.25);
        if (totalTextHeight <= innerH || fontSize === 8) {
          break;
        }
        fontSize -= 1;
      }

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lineHeight = fontSize * 1.28;
      const totalBlockH = lines.length * lineHeight;
      let startY = y0 + (boxH - totalBlockH) / 2 + lineHeight / 2;
      const centerX = x0 + boxW / 2;

      for (const line of lines) {
        ctx.fillText(line, centerX, startY);
        startY += lineHeight;
      }
    }

    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}

/**
 * Non-Interruptive Footer Annotation Mode:
 * 1. Does not inpaint or erase the original image artwork.
 * 2. Draws high-contrast numbered circles (①, ②, etc.) next to each detected Japanese text block on the original manga page.
 * 3. Calculates vertical space needed for English translations.
 * 4. Expands the image canvas downwards by adding a white banner.
 * 5. Renders the numbered English translations in a neat, left-aligned column inside this footer.
 */
function composeFooterAnnotation(
  image: HTMLImageElement,
  regions: TranslatedRegion[],
  padding: number
): string {
  const baseW = image.naturalWidth || image.width;
  const baseH = image.naturalHeight || image.height;

  // Filter to regions that have text
  const validRegions = regions.filter((r) => r.translatedText && r.translatedText.trim());

  // Calculate vertical space needed for the English translations
  const lineH = 28;
  const headerH = 50;
  const bottomPad = 30;
  const neededFooterH = headerH + (validRegions.length * lineH) + bottomPad;
  const footerHeight = Math.max(140, neededFooterH);

  // Canvas Expansion: expand canvas downwards with a crisp white banner
  const canvas = document.createElement('canvas');
  canvas.width = baseW;
  canvas.height = baseH + footerHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return image.src;

  // Draw original image on top (completely untouched)
  ctx.drawImage(image, 0, 0, baseW, baseH);

  // Badge radius scaled gracefully
  const badgeRadius = Math.max(13, Math.floor(Math.min(baseW, baseH) * 0.018));

  // 1. Draw high-contrast numbered badges on original manga art
  validRegions.forEach((region, idx) => {
    const { x0, y0, x1, y1 } = region.bbox;
    const badgeLabel = idx < CIRCLED_NUMBERS.length ? CIRCLED_NUMBERS[idx] : `[${idx + 1}]`;

    // Position badge at top-right corner of text block
    const badgeX = Math.min(baseW - badgeRadius - 4, Math.max(badgeRadius + 4, x1 - 4));
    const badgeY = Math.max(badgeRadius + 4, Math.min(baseH - badgeRadius - 4, y0 + 4));

    ctx.save();
    // High-contrast circle (Royal Blue with crisp white border)
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // High-contrast white glyph
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(11, badgeRadius)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeLabel, badgeX, badgeY + 1);

    // Subtle high-contrast outline highlighting detected block (allows floating text to be clearly identified)
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  });

  // 2. Render clean white banner footer
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, baseH, baseW, footerHeight);

  // Divider line
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, baseH);
  ctx.lineTo(baseW, baseH);
  ctx.stroke();

  // Footer Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('📖 Dialogue & Floating Character Localization (Footer Annotation Mode)', 24, baseH + 16);

  // Render numbered translations in a neat, left-aligned column
  let curY = baseH + 46;
  validRegions.forEach((region, idx) => {
    const badgeLabel = idx < CIRCLED_NUMBERS.length ? CIRCLED_NUMBERS[idx] : `[${idx + 1}]`;

    // High contrast number
    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${badgeLabel} `, 28, curY);

    // English translation
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px system-ui, sans-serif';
    const translationText = `"${region.translatedText}"`;
    ctx.fillText(translationText, 56, curY);

    // Original Japanese text reference
    if (region.originalText) {
      const transMetrics = ctx.measureText(translationText);
      ctx.fillStyle = '#64748b';
      ctx.font = 'italic 12px system-ui, sans-serif';
      ctx.fillText(` (JP: ${region.originalText})`, 62 + transMetrics.width, curY);
    }

    curY += lineH;
  });

  ctx.restore();

  return canvas.toDataURL('image/png');
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}
