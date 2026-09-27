from __future__ import annotations
from dataclasses import dataclass
from PIL import Image
try:
    import streamlit as st
except ImportError:
    class _DummySessionState(dict):
        def get(self, key, default=None):
            return default
    class _DummySt:
        session_state = _DummySessionState()
    st = _DummySt()
from core.detector import BoundingBox

@dataclass
class TextRegion:
    bbox: BoundingBox
    text: str  # Recognized Japanese text

_mocr_instance = None

def get_ocr_engine():
    """Singleton MangaOcr instance with fallback if manga_ocr is unavailable."""
    global _mocr_instance
    if _mocr_instance is None:
        try:
            from manga_ocr import MangaOcr
            _mocr_instance = MangaOcr(force_cpu=True)
        except Exception as e:
            # Fallback dummy OCR that returns empty string
            class _DummyMangaOcr:
                def __call__(self, image):
                    return ""
            _mocr_instance = _DummyMangaOcr()
            print(f"[WARNING] manga_ocr not available, using dummy OCR. Reason: {e}")
    return _mocr_instance

def recognize(image: Image.Image, bboxes: list[BoundingBox]) -> list[TextRegion]:
    """Crops each bounding box from the image and runs OCR.
    Cropping is performed in parallel using ThreadPoolExecutor to improve throughput.
    OCR execution remains sequential to avoid potential thread‑safety issues with MangaOcr.
    """
    mocr = get_ocr_engine()
    # Parallel cropping of bounding boxes
    from concurrent.futures import ThreadPoolExecutor
    def _crop(bbox: BoundingBox) -> Image.Image:
        # Crop the bounding box
        crop_img = bbox.crop(image)
        # Convert to grayscale for contrast enhancement
        gray = crop_img.convert('L')
        # Apply mild contrast enhancement
        from PIL import ImageEnhance
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.5)
        # Convert back to RGB for OCR engine compatibility
        result = enhanced.convert('RGB')
        # Upscale very small crops to improve OCR accuracy
        if result.width < 64 or result.height < 64:
            import cv2
            import numpy as np
            np_img = np.array(result)
            # Scale up proportionally to at least 64 pixels on each dimension
            target_w = max(64, result.width * 2)
            target_h = max(64, result.height * 2)
            upscaled = cv2.resize(np_img, (target_w, target_h), interpolation=cv2.INTER_CUBIC)
            result = Image.fromarray(upscaled)
        return result
    with ThreadPoolExecutor() as executor:
        crops = list(executor.map(_crop, bboxes))
    regions: list[TextRegion] = []
    for idx, (bbox, crop) in enumerate(zip(bboxes, crops)):
        raw_text = mocr(crop)
        print(f'[DEBUG] RAW OCR BOX {idx}: {raw_text}')
        if crop.width < 10 or crop.height < 10:
            continue
        if raw_text and raw_text.strip():
            regions.append(TextRegion(bbox=bbox, text=raw_text.strip()))
    return regions
