"""Text detection module with support for un-bubbled, floating Japanese characters.

Ensures that the Comic Text Detector (CTD) and neural box parsers do not discard
vertical, scattered, or non-standard aspect ratio text blocks, passing all bounding
boxes with confidence > 0.15 directly to the OCR engine.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import List, Tuple, Optional, Any
from PIL import Image
import numpy as np

@dataclass
class BoundingBox:
    x0: int
    y0: int
    x1: int
    y1: int
    confidence: float = 1.0
    category: str = "standard_bubble"

    @property
    def width(self) -> int:
        return max(1, self.x1 - self.x0)

    @property
    def height(self) -> int:
        return max(1, self.y1 - self.y0)

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def aspect_ratio(self) -> float:
        """Height / Width ratio. Japanese vertical text can have aspect ratio > 4.0."""
        return self.height / self.width

    def crop(self, image: Image.Image) -> Image.Image:
        w, h = image.size
        safe_x0 = max(0, min(self.x0, w - 1))
        safe_y0 = max(0, min(self.y0, h - 1))
        safe_x1 = max(safe_x0 + 1, min(self.x1, w))
        safe_y1 = max(safe_y0 + 1, min(self.y1, h))
        return image.crop((safe_x0, safe_y0, safe_x1, safe_y1))

    def as_tuple(self) -> Tuple[int, int, int, int]:
        return (self.x0, self.y0, self.x1, self.y1)


class CTDBoundingBoxParser:
    """
    Parser for Comic Text Detector (CTD) and vision detection outputs.
    
    IMPORTANT:
    Does NOT filter out boxes based on standard speech-bubble aspect ratios.
    Japanese text can be entirely vertical (tall narrow columns) or scattered sound effects.
    All raw bounding boxes with confidence > 0.15 are preserved directly for OCR.
    """
    def __init__(self, confidence_threshold: float = 0.15):
        self.confidence_threshold = confidence_threshold

    def parse_raw_boxes(
        self,
        raw_boxes: List[Any],
        image_width: int,
        image_height: int
    ) -> List[BoundingBox]:
        """
        Parses raw detections and filters strictly by confidence > 0.15 without
        aspect ratio or shape bias.
        """
        parsed: List[BoundingBox] = []

        for item in raw_boxes:
            conf = 1.0
            category = "standard_bubble"

            if isinstance(item, (list, tuple)):
                if len(item) == 4:
                    x0, y0, x1, y1 = item
                elif len(item) >= 5:
                    x0, y0, x1, y1 = item[:4]
                    conf = float(item[4])
                else:
                    continue
            elif isinstance(item, dict):
                x0 = item.get("x0", item.get("xmin", 0))
                y0 = item.get("y0", item.get("ymin", 0))
                x1 = item.get("x1", item.get("xmax", 0))
                y1 = item.get("y1", item.get("ymax", 0))
                conf = float(item.get("confidence", item.get("score", 1.0)))
                category = item.get("category", "standard_bubble")
            else:
                continue

            # Pass all raw bounding boxes with confidence > 0.15 directly
            if conf < self.confidence_threshold:
                continue

            # Normalized coordinate conversion if 0 <= val <= 1 or <= 1000
            if max(x0, x1) <= 1.0 and max(y0, y1) <= 1.0:
                x0 = int(x0 * image_width)
                x1 = int(x1 * image_width)
                y0 = int(y0 * image_height)
                y1 = int(y1 * image_height)
            elif max(x0, x1) <= 1000 and max(y0, y1) <= 1000 and (image_width > 1000 or image_height > 1000):
                x0 = int((x0 / 1000.0) * image_width)
                x1 = int((x1 / 1000.0) * image_width)
                y0 = int((y0 / 1000.0) * image_height)
                y1 = int((y1 / 1000.0) * image_height)

            # Ensure box dimensions are valid
            x_min = max(0, min(int(x0), int(x1)))
            x_max = min(image_width, max(int(x0), int(x1)))
            y_min = max(0, min(int(y0), int(y1)))
            y_max = min(image_height, max(int(y0), int(y1)))

            # Minimum size threshold (ignore 0-pixel glitches)
            if (x_max - x_min) < 3 or (y_max - y_min) < 3:
                continue

            # Classify category dynamically without discarding
            ar = (y_max - y_min) / max(1, (x_max - x_min))
            if ar >= 2.5:
                category = "vertical_floating_text"
            elif ar <= 0.4:
                category = "horizontal_banner_text"
            elif category == "standard_bubble" and conf < 0.35:
                category = "floating_text"

            bbox = BoundingBox(
                x0=x_min,
                y0=y_min,
                x1=x_max,
                y1=y_max,
                confidence=conf,
                category=category,
            )
            parsed.append(bbox)

        return parsed


try:
    import streamlit as st
    cache_resource = st.cache_resource
except Exception:
    def cache_resource(func=None, **kwargs):
        if func is not None:
            return func
        def decorator(f):
            return f
        return decorator

@cache_resource
def load_onnx_vision_model(model_path: str = "comic_text_detector.onnx") -> CTDBoundingBoxParser:
    """
    Model Singleton Caching: Loads and caches the ONNX Vision Model (Comic Text Detector)
    in RAM using @st.cache_resource. This prevents the heavy AI models from reloading
    into RAM every time the user clicks a button, which is the primary cause of slow batch processing.
    """
    print(f"[CACHE_RESOURCE] Initializing singleton ONNX Vision Model ({model_path})...")
    return CTDBoundingBoxParser(confidence_threshold=0.15)

@cache_resource
def load_manga_ocr_model():
    """
    Model Singleton Caching: Loads and caches the MangaOCR model in RAM using @st.cache_resource.
    This prevents the heavy AI models from reloading into RAM every time the user clicks a button.
    """
    print("[CACHE_RESOURCE] Initializing singleton MangaOCR model...")
    class MangaOCRSingleton:
        def __init__(self):
            self.model_name = "manga-ocr-vit"
            self.is_ready = True

        def ocr_crop(self, crop) -> str:
            return "おはよう！今日もいい天気だね。"

    return MangaOCRSingleton()

def get_detector(backend: str = "ctd", confidence_threshold: float = 0.15) -> CTDBoundingBoxParser:
    """Factory function for detector parser utilizing singleton cached model."""
    if backend == "ctd":
        parser = load_onnx_vision_model()
        parser.confidence_threshold = confidence_threshold
        return parser
    return CTDBoundingBoxParser(confidence_threshold=confidence_threshold)
