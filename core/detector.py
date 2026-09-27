from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from PIL import Image
import numpy as np
import cv2
from typing import List, Tuple, Union

# Attempt to import Streamlit for caching; if unavailable, fall back to no‑op.
try:
    import streamlit as st
    _HAS_STREAMLIT = True
except Exception:
    _HAS_STREAMLIT = False

# Singleton for detector instance
_detector_singleton = None

@dataclass
class BoundingBox:
    x0: int
    y0: int
    x1: int
    y1: int
    category: str = "standard_bubble"

    @property
    def width(self) -> int:
        return self.x1 - self.x0

    @property
    def height(self) -> int:
        return self.y1 - self.y0

    @property
    def area(self) -> int:
        return self.width * self.height

    def crop(self, image: Image.Image) -> Image.Image:
        return image.crop((self.x0, self.y0, self.x1, self.y1))

    def as_tuple(self) -> tuple[int, int, int, int]:
        return (self.x0, self.y0, self.x1, self.y1)

class TextDetector(ABC):
    @abstractmethod
    def detect(self, image: Image.Image) -> list[BoundingBox]:
        ...

class OptimizedMangaDetector(TextDetector):
    def __init__(self, confidence_threshold: float = 0.3, padding: int = 10):
        """
        Initialize the manga-optimized text detector (legacy OpenCV-based).
        
        Args:
            confidence_threshold: Detection confidence threshold (0.0-1.0). 
                Lower values detect more/fainter text but may increase false positives.
                Default 0.3 is optimized for manga with varying text quality.
            padding: Pixel padding to add around detected text regions.
        """
        self.confidence_threshold = confidence_threshold
        self.padding = padding

    def detect(self, image: Image.Image) -> list[BoundingBox]:
        # 1. Image Preprocessing: Ensure Streamlit uploaded file is correctly converted
        # into OpenCV BGR NumPy array or Grayscale
        # Handle various input formats (PIL Image, already numpy array, etc.)
        if isinstance(image, Image.Image):
            # Convert PIL Image to RGB numpy array
            img_arr = np.array(image.convert('RGB'))
        elif isinstance(image, np.ndarray):
            # Already numpy array - ensure it's RGB
            if len(image.shape) == 2:
                # Grayscale - convert to RGB
                img_arr = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
            elif image.shape[2] == 4:
                # RGBA - convert to RGB
                img_arr = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
            elif image.shape[2] == 3:
                # Already RGB or BGR - assume RGB
                img_arr = image
            else:
                raise ValueError(f"Unsupported image shape: {image.shape}")
        else:
            raise TypeError(f"Unsupported image type: {type(image)}")
        
        # Convert to BGR for OpenCV operations
        bgr = cv2.cvtColor(img_arr, cv2.COLOR_RGB2BGR)
        # Convert to grayscale for detection
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        
        print(f"[DETECTOR] Image preprocessing complete. Shape: {img_arr.shape}, dtype: {img_arr.dtype}")

        # 2. Optimized DBNet / Morphological approach for Manga
        # Adaptive thresholding to handle screentones and varying illumination
        thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 5
        )

        # Vertical morphological close to connect vertical Japanese characters
        # Increased vertical kernel size to better connect vertical text
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 35))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, vertical_kernel)

        # Horizontal dilation to merge adjacent vertical lines in a bubble
        # Increased horizontal kernel size to better merge text in bubbles
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 3))
        dilated = cv2.dilate(closed, horizontal_kernel, iterations=1)
        
        print(f"[DETECTOR] Morphological operations complete. Vertical kernel: (3, 35), Horizontal kernel: (20, 3)")

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        boxes = []
        img_area = img_arr.shape[0] * img_arr.shape[1]
        
        # Debug image copy for visual verification
        debug_img = bgr.copy()

        for cnt in contours:
            area = cv2.contourArea(cnt)
            # Apply confidence threshold: lower threshold allows smaller/fainter text
            # With confidence=0.3, we allow text regions that are 37.5% of the default minimum area
            base_min_area = 500
            min_area = base_min_area * (self.confidence_threshold / 0.8)
            max_area = img_area * 0.8
            
            # Enhanced logging for debugging
            print(f"[DETECTOR] Contour area: {area}, min_area: {min_area}, max_area: {max_area}")
            
            if min_area < area < max_area:
                x, y, w, h = cv2.boundingRect(cnt)
                aspect_ratio = w / float(h)
                
                # Filter out extreme non-text artifacts
                # Relax aspect ratio constraints for vertical Japanese text
                if 0.05 <= aspect_ratio <= 20.0:
                    x0 = max(0, x - self.padding)
                    y0 = max(0, y - self.padding)
                    x1 = min(img_arr.shape[1], x + w + self.padding)
                    y1 = min(img_arr.shape[0], y + h + self.padding)
                    
                    # ── Categorize the detected region ──
                    crop = bgr[y0:y1, x0:x1]
                    gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                    mean_val, std_val = cv2.meanStdDev(gray_crop)
                    std_val = std_val[0][0]
                    mean_val = mean_val[0][0]
                    
                    if std_val < 30 and mean_val > 180:
                        category = "standard_bubble"
                        color = (0, 255, 0) # Green for standard
                    elif std_val > 60 or mean_val < 130:
                        category = "onomatopoeia"
                        color = (0, 0, 255) # Red for onomatopoeia
                    else:
                        category = "unframed_caption"
                        color = (255, 0, 0) # Blue for unframed
                    
                    boxes.append(BoundingBox(x0, y0, x1, y1, category=category))
                    
                    # Draw temporary debug boxes (Red bounding box around text)
                    cv2.rectangle(debug_img, (x0, y0), (x1, y1), (0, 0, 255), 2)
                    cv2.putText(debug_img, category[:4], (x0, y0 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                    
                    print(f"[DETECTOR] Added box: ({x0}, {y0}, {x1}, {y1}), category: {category}, area: {area}")

        # 3. Apply post-detection filtering
        boxes = self._filter_boxes_aspect_ratio(boxes, img_arr.shape)
        boxes = self._filter_boxes_by_area(boxes, img_arr.shape)
        
        # 4. Merge adjacent vertical text lines
        boxes = self._merge_vertical_lines(boxes)
        
        # 5. Save debug image with merged green boxes
        self._create_debug_image_with_merged_boxes(debug_img, boxes)
        
        # 6. Additional debug: Save raw detection boxes (red) before merging
        self._save_raw_debug_boxes(debug_img)

        # 6. Sort in standard Japanese reading order: Top-to-Bottom, Right-to-Left
        tolerance = 50
        boxes.sort(key=lambda b: (b.y0 // tolerance, -b.x1))
        
        # 7. Print detection summary
        print(f"[DETECTOR] Detection complete. Total boxes: {len(boxes)}")
        for i, box in enumerate(boxes):
            print(f"[DETECTOR] Box {i+1}: ({box.x0}, {box.y0}, {box.x1}, {box.y1}), category: {box.category}, size: {box.width}x{box.height}")
        
        return boxes

    def _filter_boxes_aspect_ratio(self, boxes: list[BoundingBox], img_shape: tuple) -> list[BoundingBox]:
        """Filter boxes with extreme aspect ratios."""
        filtered = []
        for box in boxes:
            aspect_ratio = box.width / max(box.height, 1)
            # Relax aspect ratio constraints for vertical Japanese text
            if 0.05 <= aspect_ratio <= 20.0:  # Filter extreme ratios
                filtered.append(box)
        return filtered

    def _filter_boxes_by_area(self, boxes: list[BoundingBox], img_shape: tuple) -> list[BoundingBox]:
        """Filter boxes that are too large (entire page graphics)."""
        h, w = img_shape[:2]
        img_area = h * w
        filtered = []
        for box in boxes:
            if box.area < img_area * 0.5:  # Less than 50% of image area
                filtered.append(box)
        return filtered

    def _merge_vertical_lines(self, boxes: list[BoundingBox]) -> list[BoundingBox]:
        """Merge adjacent vertical text boxes in the same column."""
        if not boxes:
            return boxes
        
        # Sort by position
        boxes_sorted = sorted(boxes, key=lambda b: (b.y0, -b.x1))
        
        merged_boxes = []
        current_group = [boxes_sorted[0]]
        
        for box in boxes_sorted[1:]:
            last_box = current_group[-1]
            
            # Check if boxes should be merged
            horizontal_overlap = not (box.x1 < last_box.x0 or box.x0 > last_box.x1)
            vertical_gap = box.y0 - last_box.y1
            vertical_proximity = vertical_gap < 50
            width_similarity = abs(box.width - last_box.width) < min(box.width, last_box.width) * 0.5
            
            if horizontal_overlap and vertical_proximity and width_similarity:
                current_group.append(box)
            else:
                if current_group:
                    merged_box = self._merge_box_group(current_group)
                    merged_boxes.append(merged_box)
                current_group = [box]
        
        if current_group:
            merged_box = self._merge_box_group(current_group)
            merged_boxes.append(merged_box)
        
        return merged_boxes

    def _merge_box_group(self, boxes: list) -> BoundingBox:
        """Merge a group of boxes into one."""
        if not boxes:
            return None
        
        min_x0 = min(box.x0 for box in boxes)
        min_y0 = min(box.y0 for box in boxes)
        max_x1 = max(box.x1 for box in boxes)
        max_y1 = max(box.y1 for box in boxes)
        
        categories = [box.category for box in boxes]
        most_common = max(set(categories), key=categories.count)
        
        return BoundingBox(min_x0, min_y0, max_x1, max_y1, category=most_common)

    def _create_debug_image_with_merged_boxes(self, debug_img: np.ndarray, boxes: list[BoundingBox]):
        """Create debug image with green boxes for merged text blocks."""
        for box in boxes:
            # Green boxes for merged text blocks
            cv2.rectangle(debug_img, (box.x0, box.y0), (box.x1, box.y1), (0, 255, 0), 3)
            
            # Add category label
            label = box.category[:4]
            cv2.putText(debug_img, label, (box.x0, box.y0 - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        # Save debug image
        debug_path = 'debug_boxes.jpg'
        cv2.imwrite(debug_path, debug_img)
        print(f"Debug image saved to: {debug_path}")
        print(f"Total boxes detected: {len(boxes)}")
    
    def _save_raw_debug_boxes(self, debug_img: np.ndarray):
        """Save debug image with raw red boxes before merging."""
        raw_debug_path = 'debug_boxes_raw.jpg'
        cv2.imwrite(raw_debug_path, debug_img)
        print(f"Raw debug image (red boxes) saved to: {raw_debug_path}")

class DeepLearningMangaDetector(TextDetector):
    def __init__(self, confidence_threshold: float = 0.3, padding: int = 8, 
                 model_type: str = 'dbnet', device: str = 'cpu'):
        """
        Initialize the deep learning-based manga text detector.
        
        Args:
            confidence_threshold: Detection confidence threshold (0.0-1.0).
            padding: Pixel padding to add around detected text regions.
            model_type: Type of model to use ('dbnet' or 'ctd').
            device: Device to run inference on ('cpu' or 'cuda').
        """
        self.confidence_threshold = confidence_threshold
        self.padding = padding
        self.model_type = model_type
        self.device = device
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load the deep learning model for text detection."""
        try:
            if self.model_type == 'dbnet':
                self._load_dbnet_model()
            elif self.model_type == 'ctd':
                self._load_ctd_model()
            else:
                raise ValueError(f"Unknown model type: {self.model_type}")
        except Exception as e:
            error_msg = f"Failed to load deep learning model ({self.model_type}): {e}"
            print(f"ERROR: {error_msg}")
            print("ERROR: PyTorch model initialization failed - this error will be surfaced to the UI")
            # Raise the error instead of silently falling back, so UI can display it
            raise Exception(error_msg) from e

    def _load_dbnet_model(self):
        """Load DBNet model using pre-compiled ONNX directly, bypassing PyTorch entirely."""
        try:
            from pathlib import Path
            import onnxruntime as ort
            
            onnx_path = Path('models/detect-20241225.onnx')
            models_dir = Path('models')
            models_dir.mkdir(exist_ok=True)
            
            # Check if ONNX model exists and is a valid size (> 10MB)
            if not onnx_path.exists() or onnx_path.stat().st_size < 10_000_000:
                print("Downloading pre-compiled DBNet ONNX model from raw URL (bypassing PyTorch)...")
                try:
                    self._download_model_raw(
                        "https://huggingface.co/Skepsun/manga-translator-ui-onnx/resolve/main/detect-20241225.onnx",
                        onnx_path
                    )
                except Exception as e:
                    print(f"Failed to download pre-compiled DBNet ONNX model: {e}")
                    raise Exception(f"Pre-compiled DBNet ONNX download failed: {e}") from e

            self.model = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
            if self.model is None:
                raise Exception("Failed to load ONNX model - ONNX Runtime returned None")
            
            print("DBNet ONNX model loaded successfully with ONNX Runtime")
            
        except Exception as e:
            error_msg = f"Failed to load DBNet ONNX model: {e}"
            print(f"ERROR: {error_msg}")
            raise Exception(error_msg) from e

    def _load_ctd_model(self):
        """Load comic-text-detector model using pre-compiled ONNX."""
        try:
            from pathlib import Path
            import onnxruntime as ort
            
            onnx_path = Path('models/comictextdetector.onnx')
            models_dir = Path('models')
            models_dir.mkdir(exist_ok=True)
            
            # Check if ONNX model exists and is a valid size (> 10MB)
            if not onnx_path.exists() or onnx_path.stat().st_size < 10_000_000:
                print("Downloading comic-text-detector pre-compiled ONNX model...")
                try:
                    self._download_model_raw(
                        "https://huggingface.co/HighLiuk/japanese-onnx-models/resolve/main/comictextdetector.onnx",
                        onnx_path
                    )
                except Exception as e:
                    print(f"Failed to download comic-text-detector ONNX model: {e}")
                    raise Exception(f"CTD ONNX download failed: {e}") from e

            self.model = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
            if self.model is None:
                raise Exception("Failed to load CTD ONNX model - ONNX Runtime returned None")
            
            print("Comic-text-detector ONNX model loaded successfully with ONNX Runtime")
            
        except Exception as e:
            error_msg = f"Failed to load comic-text-detector ONNX model: {e}"
            print(f"ERROR: {error_msg}")
            raise Exception(error_msg) from e

    def _create_simple_onnx_model(self, onnx_path: Path):
        """Create a simple ONNX model for text detection as fallback."""
        try:
            import torch
            import torch.nn as nn
            
            class SimpleTextDetector(nn.Module):
                def __init__(self):
                    super(SimpleTextDetector, self).__init__()
                    self.conv1 = nn.Conv2d(3, 16, kernel_size=3, padding=1, bias=False)
                    self.conv2 = nn.Conv2d(16, 1, kernel_size=1, bias=False)
                    
                def forward(self, x):
                    x_inv = 1.0 - x
                    x = torch.relu(self.conv1(x_inv))
                    x = torch.sigmoid(self.conv2(x))
                    return x
            
            model = SimpleTextDetector()
            model.eval()
            
            dummy_input = torch.zeros(1, 3, 800, 1200)
            dummy_input[0, :, 100:150, 100:500] = 0.1
            dummy_input[0, :, 300:350, 200:600] = 0.1
            dummy_input[0, :, 600:650, 150:550] = 0.1
            dummy_input[0, 0, :, :] = 0.9
            
            torch.onnx.export(
                model,
                dummy_input,
                str(onnx_path),
                export_params=True,
                opset_version=12,
                do_constant_folding=True,
                input_names=['input'],
                output_names=['output'],
                verbose=False
            )
            
            print(f"Created simple ONNX text detection model: {onnx_path}")
            
        except Exception as e:
            print(f"Failed to create simple ONNX model: {e}")
            raise

    def _download_model_raw(self, url: str, model_path: Path):
        """
        Download model weights directly, bypassing GitHub LFS wrappers.
        
        Args:
            url: URL to download from
            model_path: Path to save the model
        """
        import requests
        
        print(f"Downloading model from {url}...")
        temp_path = model_path.with_suffix('.part')
        try:
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()
            
            with open(temp_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            file_size = temp_path.stat().st_size
            print(f"Downloaded {file_size} bytes")
            
            if file_size < 1000:
                raise ValueError(f"Downloaded file is too small ({file_size} bytes), likely corrupted or a Git LFS pointer")
            
            with open(temp_path, 'rb') as f:
                header = f.read(100)
                if b'<html' in header or b'<!DOCTYPE' in header:
                    raise ValueError("Downloaded file appears to be HTML, not a valid model")
                if b'version https://git-lfs.github.com' in header:
                    raise ValueError("Downloaded file is a Git LFS pointer, not the actual model")
            
            temp_path.replace(model_path)
            print(f"Model downloaded successfully: {file_size} bytes")
                
        except Exception as e:
            print(f"Failed to download model: {e}")
            if temp_path.exists():
                temp_path.unlink()
            raise

    def detect(self, image: Image.Image) -> list[BoundingBox]:
        """Detect text regions using deep learning model with filtering and merging."""
        if self.model is None:
            error_msg = f"Deep learning model ({self.model_type}) not loaded. Initialization failed. Application cannot proceed without neural network detection."
            print(f"CRITICAL ERROR: {error_msg}")
            raise Exception(error_msg)
        
        img_arr = np.array(image.convert('RGB'))
        bgr = cv2.cvtColor(img_arr, cv2.COLOR_RGB2BGR)
        
        try:
            if self.model_type == 'dbnet':
                boxes = self._dbnet_detect(bgr)
                boxes = self._filter_boxes(boxes, bgr.shape)
                boxes = self._filter_barcodes(boxes, bgr)
                boxes = self._merge_vertical_lines_dl(boxes)
            elif self.model_type == 'ctd':
                boxes = self._ctd_detect(bgr)
                # Bypass heuristic filters for CTD - neural network confidence handles filtering
                print(f"[DEBUG] CTD bypassing heuristic filters, returning {len(boxes)} boxes directly")
            else:
                boxes = []
            
            self._create_debug_image(bgr, boxes, merged=True)
            return boxes
            
        except Exception as e:
            error_msg = f"Deep learning detection failed ({self.model_type}): {e}. Application cannot proceed without neural network detection."
            print(f"CRITICAL ERROR: {error_msg}")
            raise Exception(error_msg) from e

    def _create_debug_image(self, bgr: np.ndarray, boxes: list[BoundingBox], merged: bool = False):
        """Create debug image with bounding boxes."""
        debug_img = bgr.copy()
        
        for box in boxes:
            color = (0, 255, 0) if merged else (0, 0, 255)
            thickness = 3 if merged else 2
            cv2.rectangle(debug_img, (box.x0, box.y0), (box.x1, box.y1), color, thickness)
            label = box.category[:4]
            cv2.putText(debug_img, label, (box.x0, box.y0 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
        
        debug_path = 'debug_boxes.jpg'
        cv2.imwrite(debug_path, debug_img)
        print(f"Debug image saved to: {debug_path}")
        print(f"Total boxes detected: {len(boxes)}")
        
        if not merged:
            raw_debug_path = 'debug_boxes_raw.jpg'
            cv2.imwrite(raw_debug_path, debug_img)
            print(f"Raw debug image (red boxes) saved to: {raw_debug_path}")

    def _get_model_input_size(self, default_h: int = 1024, default_w: int = 1024) -> Tuple[int, int]:
        """Safely parse input height and width from ONNX model input shape handling dynamic string dimensions."""
        try:
            input_shape = self.model.get_inputs()[0].shape
            print(f"[DEBUG] Model input shape: {input_shape}")
            
            # Handle different input shape formats
            if len(input_shape) == 4:
                # Format: (batch, channels, height, width) or (batch, height, width, channels)
                # Try to identify which dimension is height/width
                if input_shape[2] > input_shape[3]:
                    # Likely (batch, channels, height, width) with height > width
                    h_dim = input_shape[2]
                    w_dim = input_shape[3]
                else:
                    # Likely (batch, height, width, channels) or (batch, channels, height, width)
                    h_dim = input_shape[2]
                    w_dim = input_shape[3]
            elif len(input_shape) == 3:
                # Format: (channels, height, width) or (height, width, channels)
                h_dim = input_shape[1] if input_shape[1] > input_shape[2] else input_shape[1]
                w_dim = input_shape[2] if input_shape[2] > input_shape[1] else input_shape[2]
            else:
                return default_h, default_w
            
            h = int(h_dim) if isinstance(h_dim, (int, float)) and h_dim > 0 else default_h
            w = int(w_dim) if isinstance(w_dim, (int, float)) and w_dim > 0 else default_w
            print(f"[DEBUG] Parsed model input size: {h}x{w}")
            return h, w
        except Exception as e:
            print(f"[DEBUG] Failed to parse model input size: {e}, using defaults")
            return default_h, default_w

    def _dbnet_detect(self, bgr: np.ndarray) -> list[BoundingBox]:
        """Detect text using DBNet model with ONNX Runtime."""
        try:
            # Determine target model input size (may be dynamic)
            model_height, model_width = self._get_model_input_size(default_h=1024, default_w=1024)
            orig_h, orig_w = bgr.shape[:2]

            # Pad image so that dimensions are multiples of 32 (common DBNet requirement)
            pad_h = (32 - (orig_h % 32)) % 32
            pad_w = (32 - (orig_w % 32)) % 32
            pad_h = max(pad_h, 0)
            pad_w = max(pad_w, 0)
            if pad_h != 0 or pad_w != 0:
                # Use numpy.pad which works with multi‑channel images
                bgr = np.pad(bgr, ((0, pad_h), (0, pad_w), (0, 0)), mode='constant', constant_values=0)
                print(f"[DEBUG] Applied DBNet padding via numpy.pad: bottom={pad_h}, right={pad_w}")

            # Resize to model input size expected by ONNX (stretch to fit)
            img_rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
            std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
            img_rgb = (img_rgb - mean) / std
            img_resized = cv2.resize(img_rgb, (model_width, model_height))
            blob = img_resized.transpose(2, 0, 1)[np.newaxis, :, :, :]
            print(f"[DEBUG] DBNet Input Tensor - min: {blob.min():.4f}, max: {blob.max():.4f}")

            input_name = self.model.get_inputs()[0].name
            outputs = self.model.run(None, {input_name: blob})

            if isinstance(outputs, list) and len(outputs) > 0:
                db = outputs[0] if len(outputs) > 0 else None
                mask = outputs[1] if len(outputs) > 1 else None
            else:
                db = outputs
                mask = None

            if hasattr(db, 'cpu'):
                db = db.cpu().numpy()
            if mask is not None and hasattr(mask, 'cpu'):
                mask = mask.cpu().numpy()

            # Post-process using original image dimensions
            boxes = self._postprocess_dbnet(
                db[0] if len(db.shape) > 2 else db,
                mask[0] if mask is not None and len(mask.shape) > 2 else None,
                bgr.shape,
                (model_width, model_height)
            )
            return boxes

        except Exception as e:
            error_msg = f"DBNet detection failed: {e}"
            print(f"ERROR: {error_msg}")
            raise Exception(error_msg) from e

    def _ctd_detect(self, bgr: np.ndarray) -> list[BoundingBox]:
        """Detect text using comic-text-detector with ONNX Runtime."""
        try:
            if self.model is None:
                raise Exception("CTD model is None - loading failed")

            # Image dimensions and model input size
            h, w = bgr.shape[:2]
            model_height, model_width = self._get_model_input_size(default_h=1024, default_w=1024)

            # 1. Convert BGR to RGB and resize to model input dimensions
            img_rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            img_resized = cv2.resize(img_rgb, (model_width, model_height))
            # 2. Convert to float32 and normalize to [0, 1]
            img_float = img_resized.astype(np.float32) / 255.0
            # 3. No ImageNet normalization for CTD model
            # 4. Transpose to CHW format
            img_transposed = np.transpose(img_float, (2, 0, 1))
            # 5. Expand dims for batch size 1
            blob = np.expand_dims(img_transposed, axis=0)
            # Debug tensor statistics
            print(f"[DEBUG] CTD Input Tensor - min: {blob.min():.4f}, max: {blob.max():.4f}")

            # Run inference with ONNX Runtime
            input_name = self.model.get_inputs()[0].name
            output_names = [out.name for out in self.model.get_outputs()]
            print(f"[DEBUG] Output names: {output_names}")
            
            # Run inference and get all outputs
            outputs = self.model.run(output_names, {input_name: blob})
            
            # Create output dictionary
            output_dict = dict(zip(output_names, outputs))
            
            # Use 'blk' output for bounding boxes (object detection)
            if 'blk' in output_dict:
                blk_output = output_dict['blk']
                print(f"[DEBUG] Using 'blk' output for detection: {blk_output.shape}")
                boxes = self._postprocess_ctd(blk_output, bgr.shape, (model_width, model_height))
                # Skip all post-detection filtering for CTD - return raw NMS results
                print(f"[DEBUG] CTD returning {len(boxes)} raw boxes from NMS without additional filtering")
            else:
                print(f"[WARNING] 'blk' output not found, available outputs: {output_names}")
                raise Exception("Required 'blk' output not found in CTD model")
        
            return boxes
            
        except Exception as e:
            print(f"[ERROR] CTD detection failed: {e}")
            import traceback
            traceback.print_exc()
            raise Exception(f"CTD detection failed: {e}") from e

    def _postprocess_dbnet(self, db: np.ndarray, mask: np.ndarray, 
                          img_shape: Tuple[int, int, int],
                          model_size: Tuple[int, int] = None) -> list[BoundingBox]:
        """Post-process DBNet outputs to bounding boxes."""
        h, w = img_shape[:2]
        boxes = []
        
        # Ensure DBNet probability map is 2-D (handle possible channel dimension)
        db = np.squeeze(db)
        # If still 3-D (e.g., (C, H, W)), take the first channel as the probability map
        if db.ndim == 3:
            db = db[0]
        if db.ndim != 2:
            raise ValueError(f"DBNet probability map has unexpected shape {db.shape}")
        # Threshold the probability map
        thresh = (db > self.confidence_threshold).astype(np.uint8) * 255
        # Find contours on the binary mask
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 100:  # Filter very small regions
                continue
                
            x, y, w_box, h_box = cv2.boundingRect(cnt)
            
            # Scale back to original image size if model size was provided
            if model_size:
                model_width, model_height = model_size
                scale_x = w / model_width
                scale_y = h / model_height
                
                x0 = max(0, int(x * scale_x) - self.padding)
                y0 = max(0, int(y * scale_y) - self.padding)
                x1 = min(w, int((x + w_box) * scale_x) + self.padding)
                y1 = min(h, int((y + h_box) * scale_y) + self.padding)
            else:
                # No scaling needed
                x0 = max(0, x - self.padding)
                y0 = max(0, y - self.padding)
                x1 = min(w, x + w_box + self.padding)
                y1 = min(h, y + h_box + self.padding)
            
            boxes.append(BoundingBox(x0, y0, x1, y1))
        
        return boxes

    def _postprocess_ctd(self, outputs: np.ndarray, 
                        img_shape: Tuple[int, int, int],
                        model_size: Tuple[int, int] = None,
                        confidence_threshold: float = None) -> list[BoundingBox]:
        """Post-process CTD ONNX object detection outputs to bounding boxes."""
        h, w = img_shape[:2]
        boxes = []
        
        # Use provided threshold or fall back to instance threshold
        if confidence_threshold is None:
            confidence_threshold = self.confidence_threshold
        
        try:
            # Handle ONNX output format - object detection tensor (1, num_anchors, 7)
            print(f"[DEBUG] CTD output shape: {outputs.shape}")
            print(f"[DEBUG] CTD output dtype: {outputs.dtype}")
            
            # Squeeze batch dimension if present
            if len(outputs.shape) == 3 and outputs.shape[0] == 1:
                outputs = outputs[0]  # Remove batch dimension, shape becomes (num_anchors, 7)
            
            # Expected shape: (num_anchors, 7) where each row is [cx, cy, w, h, confidence, class, ...]
            if len(outputs.shape) == 2 and outputs.shape[1] >= 5:
                preds = outputs  # Shape: (num_anchors, 7)
                nms_boxes = []
                confidences = []
                
                # Calculate scaling ratios
                if model_size:
                    model_width, model_height = model_size
                    scale_x = w / model_width
                    scale_y = h / model_height
                else:
                    scale_x = 1.0
                    scale_y = 1.0
                
                # 1. Extract raw boxes and confidences
                for row in preds:
                    conf = float(row[4])  # Object confidence score
                    if conf > confidence_threshold:  # Minimum confidence threshold
                        cx, cy, box_w, box_h = row[0:4]
                        
                        # Convert center coords to top-left coords
                        x = int((cx - box_w / 2) * scale_x)
                        y = int((cy - box_h / 2) * scale_y)
                        
                        nms_boxes.append([x, y, int(box_w * scale_x), int(box_h * scale_y)])
                        confidences.append(conf)
                
                print(f"[DEBUG] Found {len(nms_boxes)} boxes above confidence threshold")
                
                # 2. Filter overlapping boxes using NMS
                final_boxes = []
                if nms_boxes:
                    indices = cv2.dnn.NMSBoxes(nms_boxes, confidences, score_threshold=confidence_threshold, nms_threshold=0.45)
                    if len(indices) > 0:
                        for i in indices.flatten():
                            x, y, box_w, box_h = nms_boxes[i]
                            # Convert to xmin, ymin, xmax, ymax for the application's TextRegion wrapper
                            x0 = max(0, x - self.padding)
                            y0 = max(0, y - self.padding)
                            x1 = min(w, x + box_w + self.padding)
                            y1 = min(h, y + box_h + self.padding)
                            final_boxes.append(BoundingBox(x0, y0, x1, y1))
                
                print(f"[DEBUG] Final CTD boxes after NMS: {len(final_boxes)}")
                boxes = final_boxes
            
            else:
                print(f"[WARNING] Unknown CTD output shape: {outputs.shape}")
                print(f"[WARNING] Expected (num_anchors, 7) for object detection")
                
        except Exception as e:
            print(f"[ERROR] CTD post-processing failed: {e}")
            print(f"[ERROR] Output shape: {outputs.shape if hasattr(outputs, 'shape') else 'N/A'}")
            import traceback
            traceback.print_exc()
        
        return boxes

    def _filter_boxes(self, boxes: list[BoundingBox], img_shape: Tuple[int, int, int]) -> list[BoundingBox]:
        """
        Filter detected bounding boxes using geometric and spatial heuristics.
        
        Args:
            boxes: List of detected bounding boxes
            img_shape: Image shape (height, width, channels)
        
        Returns:
            Filtered list of bounding boxes
        """
        h, w = img_shape[:2]
        img_area = h * w
        filtered_boxes = []
        
        for box in boxes:
            # Filter by aspect ratio (ignore extreme ratios that might be page graphics)
            aspect_ratio = box.width / max(box.height, 1)
            # Relax aspect ratio constraints for vertical Japanese text
            if aspect_ratio < 0.05 or aspect_ratio > 20.0:
                continue
            
            # Filter by area (ignore very large boxes that might be entire illustrations)
            box_area = box.area
            if box_area > img_area * 0.5:  # More than 50% of image area
                continue
            
            # Filter by minimum size
            if box_area < 100:  # Too small
                continue
            
            filtered_boxes.append(box)
        
        return filtered_boxes

    def _detect_barcode(self, image_region: np.ndarray) -> bool:
        """
        Detect if a region contains a barcode based on edge density.
        
        Args:
            image_region: Image region to check
        
        Returns:
            True if barcode-like pattern detected
        """
        # Convert to grayscale
        if len(image_region.shape) == 3:
            gray = cv2.cvtColor(image_region, cv2.COLOR_BGR2GRAY)
        else:
            gray = image_region
        
        # Apply Sobel edge detection
        sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        # Calculate edge density
        edge_magnitude = np.sqrt(sobel_x**2 + sobel_y**2)
        edge_density = np.mean(edge_magnitude)
        
        # High edge density suggests barcode
        return edge_density > 50

    def _filter_barcodes(self, boxes: list[BoundingBox], bgr: np.ndarray) -> list[BoundingBox]:
        """
        Filter out barcode areas and publisher metadata zones.
        
        Args:
            boxes: List of detected bounding boxes
            bgr: BGR image
        
        Returns:
            Filtered list without barcode regions
        """
        filtered_boxes = []
        
        for box in boxes:
            # Extract region
            region = bgr[box.y0:box.y1, box.x0:box.x1]
            
            # Check if region looks like barcode
            if self._detect_barcode(region):
                continue  # Skip barcode regions
            
            filtered_boxes.append(box)
        
        return filtered_boxes

    def _merge_vertical_lines_dl(self, boxes: list[BoundingBox]) -> list[BoundingBox]:
        """Merge adjacent vertical text boxes in the same column (DL version)."""
        if not boxes:
            return boxes
        
        # Sort by position
        boxes_sorted = sorted(boxes, key=lambda b: (b.y0, -b.x1))
        
        merged_boxes = []
        current_group = [boxes_sorted[0]]
        
        for box in boxes_sorted[1:]:
            last_box = current_group[-1]
            
            # Check if boxes should be merged
            horizontal_overlap = not (box.x1 < last_box.x0 or box.x0 > last_box.x1)
            vertical_gap = box.y0 - last_box.y1
            vertical_proximity = vertical_gap < 50
            width_similarity = abs(box.width - last_box.width) < min(box.width, last_box.width) * 0.5
            
            if horizontal_overlap and vertical_proximity and width_similarity:
                current_group.append(box)
            else:
                if current_group:
                    merged_box = self._merge_box_group_dl(current_group)
                    merged_boxes.append(merged_box)
                current_group = [box]
        
        if current_group:
            merged_box = self._merge_box_group_dl(current_group)
            merged_boxes.append(merged_box)
        
        return merged_boxes

    def _merge_box_group_dl(self, boxes: list) -> BoundingBox:
        """Merge a group of boxes into one (DL version)."""
        if not boxes:
            return None
        
        min_x0 = min(box.x0 for box in boxes)
        min_y0 = min(box.y0 for box in boxes)
        max_x1 = max(box.x1 for box in boxes)
        max_y1 = max(box.y1 for box in boxes)
        
        categories = [box.category for box in boxes]
        most_common = max(set(categories), key=categories.count)
        
        return BoundingBox(min_x0, min_y0, max_x1, max_y1, category=most_common)

# Streamlit-aware cached detector factory (see get_detector below)

def get_detector(backend: str = 'ctd', **kwargs) -> TextDetector:
    """
    Get a text detector instance, with Streamlit-aware caching.

    Args:
        backend: Detector backend name ('ctd', 'dbnet')
            - 'ctd': Comic-text-detector ONNX model (specialized for comics, default)
            - 'dbnet': Deep learning DBNet ONNX model (accurate)
        **kwargs: Additional arguments passed to the detector constructor.
            confidence_threshold: Detection confidence (default: 0.3)
            padding: Pixel padding around detected regions (default: 8 for CTD)
            device: Device for deep learning models ('cpu' or 'cuda', default: 'cpu')

    Returns:
        TextDetector instance configured for manga text detection

    Note:
        OpenCV morphological fallback has been removed. Application requires neural network detection.
    """
    if 'confidence_threshold' not in kwargs:
        kwargs['confidence_threshold'] = 0.3
    if backend == 'ctd' and 'padding' not in kwargs:
        kwargs['padding'] = 8
    if backend not in ['dbnet', 'ctd']:
        raise ValueError(f"Unknown detector backend: {backend}. "
                         f"Supported backends: 'ctd', 'dbnet' (neural network only - no OpenCV fallback)")
    def _create():
        print("Creating detector instance")
        return DeepLearningMangaDetector(model_type=backend, **kwargs)
    if _HAS_STREAMLIT:
        @st.cache_resource(show_spinner=False)
        def _cached():
            return _create()
        return _cached()
    else:
        global _detector_singleton
        if _detector_singleton is None:
            _detector_singleton = _create()
        return _detector_singleton
