from __future__ import annotations
import textwrap
import os
from PIL import Image, ImageDraw, ImageFont
from core.detector import BoundingBox
from core.translator import TranslatedRegion

# Try to find the bundled font, fall back to default
FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'fonts')
DEFAULT_FONT_PATH = os.path.join(FONT_DIR, 'cc-wild-words.ttf')

def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Load the bundled comic font, or fall back to Pillow's default."""
    try:
        if os.path.exists(DEFAULT_FONT_PATH):
            return ImageFont.truetype(DEFAULT_FONT_PATH, size)
        # Try system Arial as fallback
        return ImageFont.truetype('arial.ttf', size)
    except OSError:
        return ImageFont.load_default()

import cv2
import numpy as np
import functools

@functools.lru_cache(maxsize=1)
def get_lama():
    try:
        from simple_lama_inpainting import SimpleLama
        return SimpleLama()
    except ImportError:
        return None

def _draw_badge(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, radius: int = 13) -> None:
    """Draw a filled circle badge with a number/symbol at (x, y) centre."""
    bbox_circle = [x - radius, y - radius, x + radius, y + radius]
    draw.ellipse(bbox_circle, fill='#1a1aff', outline='white', width=2)
    font = _get_font(max(radius - 2, 8))
    lb = draw.textbbox((0, 0), label, font=font)
    tw, th = lb[2] - lb[0], lb[3] - lb[1]
    draw.text((x - tw / 2, y - th / 2), label, fill='white', font=font)


# Circled number glyphs for annotation badges (① ② ③ …)
_CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
            '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳']


def _badge_label(idx: int) -> str:
    if idx < len(_CIRCLED):
        return _CIRCLED[idx]
    return f'[{idx + 1}]'


def compose_page(
    original: Image.Image,
    regions: list[TranslatedRegion],
    bg_color: str = 'white',
    text_color: str = 'black',
    padding: int = 6,
    annotation_mode: bool = False,
) -> Image.Image:
    """
    Creates a translated version of a manga page.

    annotation_mode=False  (default): destructive mode — erases bubbles and
                           renders translations in-place.
    annotation_mode=True : non-destructive mode — original art is untouched.
                           Numbered badges are drawn next to each detected box
                           and a white margin is appended at the bottom with a
                           numbered translation list.
    """
    if annotation_mode:
        return _compose_annotation(original, regions, text_color, padding)
    else:
        return _compose_destructive(original, regions, bg_color, text_color, padding)


# ─────────────────────────────────────────────────────────────────────────────
# Non-destructive annotation mode
# ─────────────────────────────────────────────────────────────────────────────

def _compose_annotation(
    original: Image.Image,
    regions: list[TranslatedRegion],
    text_color: str = 'black',
    padding: int = 6,
) -> Image.Image:
    """Draw badges on the original and append a translation list at bottom."""
    img = original.copy().convert('RGB')
    draw = ImageDraw.Draw(img)
    W, H = img.size

    # Filter to regions with valid translations
    valid = [(i, r) for i, r in enumerate(regions)
             if r.translated_text and not r.translated_text.startswith('[')]

    # --- 1. Draw numbered badges on the original art ---
    badge_radius = max(13, int(min(W, H) * 0.018))
    for badge_idx, (orig_idx, region) in enumerate(valid):
        x0, y0, x1, y1 = region.bbox.as_tuple()
        # Place badge just outside the top-right corner of the bounding box
        bx = min(x1 + badge_radius, W - badge_radius - 1)
        by = max(y0 - badge_radius, badge_radius + 1)
        _draw_badge(draw, bx, by, _badge_label(badge_idx), radius=badge_radius)
        # Also draw a thin rectangle outline so user can see the box
        draw.rectangle([x0, y0, x1, y1], outline='#1a1aff', width=2)

    # --- 2. Build the bottom translation panel ---
    font_body = _get_font(18)
    font_header = _get_font(22)
    margin_side = 20
    line_gap = 6
    section_gap = 14

    # Compute required height for the panel
    panel_lines: list[tuple[str, bool]] = []  # (text, is_header)
    panel_lines.append(('── Translations ──', True))
    for badge_idx, (orig_idx, region) in enumerate(valid):
        label = _badge_label(badge_idx)
        full_line = f'{label}  {region.translated_text}'
        # Word-wrap each translation entry to fit the page width
        wrap_chars = max(int((W - 2 * margin_side) / 10), 30)
        wrapped = textwrap.wrap(full_line, width=wrap_chars)
        if not wrapped:
            wrapped = [full_line]
        for li, wl in enumerate(wrapped):
            panel_lines.append((wl, False))
        panel_lines.append(('', False))  # blank spacer after each entry

    # Measure total panel height
    tmp_draw = ImageDraw.Draw(Image.new('RGB', (W, 10)))
    total_panel_h = section_gap
    for text, is_header in panel_lines:
        f = font_header if is_header else font_body
        if text:
            lb = tmp_draw.textbbox((0, 0), text, font=f)
            total_panel_h += lb[3] - lb[1] + line_gap
        else:
            total_panel_h += line_gap  # blank spacer

    total_panel_h += section_gap  # bottom padding

    # --- 3. Create expanded canvas ---
    expanded = Image.new('RGB', (W, H + total_panel_h), color='white')
    expanded.paste(img, (0, 0))

    panel_draw = ImageDraw.Draw(expanded)
    # Divider line
    panel_draw.line([(0, H + 4), (W, H + 4)], fill='#1a1aff', width=2)

    cur_y = H + section_gap
    for text, is_header in panel_lines:
        f = font_header if is_header else font_body
        if text:
            fill = '#1a1aff' if is_header else text_color
            panel_draw.text((margin_side, cur_y), text, fill=fill, font=f)
            lb = panel_draw.textbbox((0, 0), text, font=f)
            cur_y += lb[3] - lb[1] + line_gap
        else:
            cur_y += line_gap

    return expanded


# ─────────────────────────────────────────────────────────────────────────────
# Destructive (classic) mode
# ─────────────────────────────────────────────────────────────────────────────

def _compose_destructive(
    original: Image.Image,
    regions: list[TranslatedRegion],
    bg_color: str = 'white',
    text_color: str = 'black',
    padding: int = 6,
) -> Image.Image:
    """
    Classic mode: erases text adaptively and renders translations in-place.
    """
    img = original.copy().convert('RGB')

    # ── Step 1: Adaptive Inpainting ──
    advanced_mask = np.zeros((img.height, img.width), dtype=np.uint8)
    need_advanced_inpaint = False

    draw = ImageDraw.Draw(img)

    for region in regions:
        text = region.translated_text
        if not text or text.startswith('['):
            continue

        bbox = region.bbox
        x0, y0, x1, y1 = bbox.as_tuple()
        category = getattr(bbox, 'category', 'standard_bubble')

        if category == 'standard_bubble':
            draw.rectangle([x0, y0, x1, y1], fill=bg_color)
        else:
            advanced_mask[y0:y1, x0:x1] = 255
            need_advanced_inpaint = True

    if need_advanced_inpaint:
        lama = get_lama()
        if lama is not None:
            mask_img = Image.fromarray(advanced_mask)
            img = lama(img, mask_img)
        else:
            bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            inpainted_bgr = cv2.inpaint(bgr, advanced_mask, inpaintRadius=3, flags=cv2.INPAINT_NS)
            img = Image.fromarray(cv2.cvtColor(inpainted_bgr, cv2.COLOR_BGR2RGB))

    # Re-initialize draw since img might have been replaced
    draw = ImageDraw.Draw(img)

    # ── Step 2: Dynamic Font Scaling & Placement ──
    for region in regions:
        bbox = region.bbox
        text = region.translated_text

        print(f"[RENDERING] Box ID: {bbox.as_tuple()}, Original: {region.original_text}, Translated: {text}")

        if not text or text.startswith('['):
            print(f"[SKIP] Box {bbox.as_tuple()} - no valid translation: {text}")
            continue

        x0, y0, x1, y1 = bbox.as_tuple()
        max_w = (x1 - x0) - 2 * padding
        max_h = (y1 - y0) - 2 * padding

        if max_w <= 0 or max_h <= 0:
            continue

        is_vertical_caption = max_h > max_w * 1.8

        max_possible_font = min(max_h, max_w) if not is_vertical_caption else int(max_w * 0.8)
        max_possible_font = min(max_possible_font, 80)
        start_font_size = max(28, max_possible_font)

        best_font = None
        best_lines = []
        line_spacing = 4

        for font_size in range(start_font_size, 8, -2):
            font = _get_font(font_size)

            if is_vertical_caption:
                wrap_width = max(int(max_w / max(font_size * 0.5, 1)), 2)
            else:
                avg_char_w = max(font_size * 0.55, 1)
                wrap_width = max(int(max_w / avg_char_w), 4)

            lines = textwrap.wrap(text, width=wrap_width)
            if not lines:
                lines = [text]

            total_h = 0
            fits = True
            for line in lines:
                line_bbox = draw.textbbox((0, 0), line, font=font)
                line_w = line_bbox[2] - line_bbox[0]
                line_h = line_bbox[3] - line_bbox[1]
                if line_w > max_w:
                    fits = False
                    break
                total_h += line_h + line_spacing

            total_h -= line_spacing

            if fits and total_h <= max_h:
                best_font = font
                best_lines = lines
                break

        if best_font is None:
            best_font = _get_font(10)
            best_lines = textwrap.wrap(text, width=max(int(max_w / 6), 4)) or [text]

        line_heights = []
        for line in best_lines:
            lb = draw.textbbox((0, 0), line, font=best_font)
            line_heights.append(lb[3] - lb[1])

        total_text_h = sum(line_heights) + line_spacing * (len(best_lines) - 1)
        cur_y = y0 + padding + max(0, (max_h - total_text_h) / 2)

        for line, lh in zip(best_lines, line_heights):
            lb = draw.textbbox((0, 0), line, font=best_font)
            line_w = lb[2] - lb[0]
            cur_x = x0 + padding + (max_w - line_w) / 2
            draw.text((cur_x, cur_y), line, fill=text_color, font=best_font)
            cur_y += lh + line_spacing

    return img

