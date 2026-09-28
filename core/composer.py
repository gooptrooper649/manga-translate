"""Manga page composition engine with Fail-Safe Inpainting and Non-Interruptive Footer Annotation Mode.
"""
from __future__ import annotations
import textwrap
from typing import List, Optional
from PIL import Image, ImageDraw, ImageFont
from core.detector import BoundingBox

CIRCLED_GLYPHS = [
    '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
    '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
    '㉑', '㉒', '㉓', '㉔', '㉕', '㉖', '㉗', '㉘', '㉙', '㉚'
]

def _badge_label(index: int) -> str:
    if index < len(CIRCLED_GLYPHS):
        return CIRCLED_GLYPHS[index]
    return f"[{index + 1}]"

def _is_invalid_translation(text: Optional[str]) -> bool:
    """
    Fail-safe check: return True if translation is empty, timed out, or contains an error.
    Used to skip destructive inpainting so original manga art is never replaced by a blank box.
    NOTE: [Draft: ...] fallback text is explicitly preserved as readable draft output.
    """
    if not text:
        return True
    cleaned = text.strip()
    if not cleaned:
        return True
    # Allow draft fallback text through to guarantee readable output
    if cleaned.startswith("[Draft:"):
        return False
    if cleaned.startswith("[") and cleaned.endswith("]"):
        return True
    lower = cleaned.lower()
    error_keywords = [
        "error", "timeout", "timed out", "failed", "translation missing",
        "rate limit", "no text detected", "exception"
    ]
    return any(keyword in lower for keyword in error_keywords)

class TranslatedRegion:
    def __init__(self, bbox: BoundingBox, original_text: str = "", translated_text: str = ""):
        self.bbox = bbox
        self.original_text = original_text
        self.translated_text = translated_text


def _get_font(size: int = 14) -> ImageFont.ImageFont:
    """Load default or truetype font safely."""
    try:
        return ImageFont.load_default()
    except Exception:
        return ImageFont.load_default()


def compose_page(
    original: Image.Image,
    regions: List[TranslatedRegion],
    annotation_mode: bool = False,
    bg_color: str = "white",
    text_color: str = "black",
    padding: int = 6,
) -> Image.Image:
    """
    Renders translated manga page.

    Args:
        original: PIL Image of the original manga page
        regions: list of TranslatedRegion objects
        annotation_mode: If True, uses 'Footer Annotation Mode' (non-destructive).
                         If False, uses 'Replace Text' mode with Fail-Safe inpainting.
    """
    if annotation_mode:
        return compose_footer_annotation(original, regions, padding=padding)
    else:
        return compose_destructive_failsafe(original, regions, bg_color=bg_color, text_color=text_color, padding=padding)


def compose_footer_annotation(
    original: Image.Image,
    regions: List[TranslatedRegion],
    padding: int = 8,
) -> Image.Image:
    """
    Non-Interruptive Footer Annotation Mode:
    1. Leaves original art completely untouched (no erasing/inpainting).
    2. Draws high-contrast numbered circles (①, ②, etc.) next to each detected Japanese text block.
    3. Calculates vertical space needed for English translations.
    4. Expands canvas downwards with a crisp white banner footer.
    5. Renders numbered English translations in a neat, left-aligned column inside the footer.
    """
    base_img = original.convert("RGB")
    W, H = base_img.size

    # Filter out empty regions
    valid_regions: List[Tuple[int, TranslatedRegion]] = [
        (idx, r) for idx, r in enumerate(regions) if r.translated_text and r.translated_text.strip()
    ]

    # Calculate vertical space needed for footer translations
    line_height = 26
    header_height = 50
    footer_bottom_pad = 30
    needed_footer_h = header_height + (len(valid_regions) * line_height) + footer_bottom_pad
    footer_height = max(140, needed_footer_h)

    # Canvas expansion: Expand image canvas downwards by adding a white banner
    new_canvas = Image.new("RGB", (W, H + footer_height), color="#ffffff")
    new_canvas.paste(base_img, (0, 0))

    draw = ImageDraw.Draw(new_canvas)

    # 1. Draw high-contrast numbered badges on the original manga art
    badge_radius = max(12, int(min(W, H) * 0.018))

    for badge_idx, (orig_idx, region) in enumerate(valid_regions):
        box = region.bbox
        label = _badge_label(badge_idx)

        # Position at top-right corner of detected text block
        bx = min(W - badge_radius - 2, max(badge_radius + 2, box.x1 - 2))
        by = max(badge_radius + 2, min(H - badge_radius - 2, box.y0 + 2))

        # Badge: High-contrast royal blue circle with clean white border
        draw.ellipse(
            [bx - badge_radius, by - badge_radius, bx + badge_radius, by + badge_radius],
            fill="#2563eb",
            outline="#ffffff",
            width=2,
        )

        # Draw label
        font = _get_font(max(10, badge_radius))
        draw.text((bx - 4, by - 6), label, fill="#ffffff", font=font)

        # Subtle dashed-style indicator for text block
        draw.rectangle([box.x0, box.y0, box.x1, box.y1], outline="#3b82f6", width=1)

    # 2. Draw neat, left-aligned column inside the expanded footer
    # Footer divider line
    draw.line([(0, H), (W, H)], fill="#cbd5e1", width=2)

    # Footer Title
    title_font = _get_font(15)
    draw.text((24, H + 14), "📖 Localized Dialogue & Floating Text Translations", fill="#0f172a", font=title_font)

    current_y = H + 44
    entry_font = _get_font(13)

    for badge_idx, (orig_idx, region) in enumerate(valid_regions):
        label = _badge_label(badge_idx)
        trans_text = region.translated_text.strip()
        orig_text = region.original_text.strip() if region.original_text else ""

        # Formatted entry: ① "English translation" (JP: original)
        badge_prefix = f"{label}  "
        content_text = f'"{trans_text}"'
        if orig_text:
            content_text += f"   (JP: {orig_text})"

        draw.text((24, current_y), badge_prefix, fill="#2563eb", font=entry_font)
        draw.text((54, current_y), content_text, fill="#1e293b", font=entry_font)
        current_y += line_height

    return new_canvas


def compose_destructive_failsafe(
    original: Image.Image,
    regions: List[TranslatedRegion],
    bg_color: str = "white",
    text_color: str = "black",
    padding: int = 6,
) -> Image.Image:
    """
    'Replace Text' mode with Fail-Safe Inpainting:
    If translated_text is empty, times out, or contains an error string, the inpainting
    step is completely skipped so the original art is never replaced by a blank white box.
    """
    img = original.convert("RGB").copy()
    draw = ImageDraw.Draw(img)

    for region in regions:
        # FAIL-SAFE CHECK:
        # If translation is empty, timed out, or contains an error string,
        # completely SKIP inpainting so artwork is preserved intact!
        if _is_invalid_translation(region.translated_text):
            continue

        box = region.bbox
        x0, y0, x1, y1 = box.x0, box.y0, box.x1, box.y1
        bw = max(10, x1 - x0)
        bh = max(10, y1 - y0)

        # Inpaint speech bubble / character area
        draw.rounded_rectangle([x0, y0, x1, y1], radius=min(12, bw // 4, bh // 4), fill=bg_color, outline="#e2e8f0", width=1)

        # Typeset English translation
        text = region.translated_text.strip()
        inner_w = max(10, bw - padding * 2)
        inner_h = max(10, bh - padding * 2)

        font = _get_font(13)
        # Approximate wrap
        chars_per_line = max(4, inner_w // 8)
        wrapped_lines = textwrap.wrap(text, width=chars_per_line)

        total_text_h = len(wrapped_lines) * 16
        start_y = y0 + padding + max(0, (inner_h - total_text_h) // 2)

        for line in wrapped_lines:
            draw.text((x0 + padding, start_y), line, fill=text_color, font=font)
            start_y += 16

    return img
