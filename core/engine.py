from __future__ import annotations
import os
import zipfile
import tempfile
import shutil
from pathlib import Path
from PIL import Image
import logging

from core.detector import get_detector
from core.ocr import recognize
from core.translator import translate_batch, TranslatedRegion, extract_series_context
from core.composer import compose_page
from services.token_router import TokenRouter

logger = logging.getLogger(__name__)

SUPPORTED_EXTS = {'.png', '.jpg', '.jpeg', '.webp'}

def process_archive(
    input_file,  # can be a file path or a file-like object (e.g., from st.file_uploader)
    token_router: TokenRouter,
    detector_backend: str = 'ctd',  # Default to comic-text-detector ONNX
    output_base_dir: str = 'output',
    progress_callback = None
) -> list[str]:
    """
    Local CPU Engine:
    Accepts a ZIP file or directory path, recreates the internal subfolder structure, 
    sorts images sequentially, and processes each image through the pipeline.
    Saves final images to a temporary local output folder.
    Returns a list of paths to the processed output images.
    """
    output_base = Path(output_base_dir)
    output_base.mkdir(parents=True, exist_ok=True)
    
    # Create a unique temporary directory for this batch
    batch_dir = tempfile.mkdtemp(prefix="manga_batch_", dir=output_base)
    extract_dir = Path(batch_dir) / "original"
    out_dir = Path(batch_dir) / "translated"
    extract_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    processed_files = []
    
    # 1. Extract ZIP or copy directory
    if hasattr(input_file, 'read') or (isinstance(input_file, (str, Path)) and str(input_file).lower().endswith('.zip')):
        # It's a ZIP file or file-like object
        with zipfile.ZipFile(input_file, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
    elif isinstance(input_file, (str, Path)) and Path(input_file).is_dir():
        # It's a directory, copy its contents
        shutil.copytree(input_file, extract_dir, dirs_exist_ok=True)
    else:
        raise ValueError("Input must be a ZIP file path, an uploaded ZIP file-like object, or a directory path.")

    # 2. Find all images and maintain subfolder structure
    image_paths = []
    for root, _, files in os.walk(extract_dir):
        for file in files:
            ext = Path(file).suffix.lower()
            if ext in SUPPORTED_EXTS:
                image_paths.append(Path(root) / file)
                
    # 3. Sort sequentially (alphabetically handles chapter/page numbers usually)
    image_paths.sort()
    
    if not image_paths:
        logger.warning("No supported images found in the uploaded archive.")
        return []

    # Use the confidence threshold from the UI (default 0.15 if not set)
    confidence = st.session_state.get('confidence_threshold', 0.15)
    detector = get_detector(backend=detector_backend, confidence_threshold=confidence, device='cpu')
    print(f"[ENGINE] Starting detection with backend: {detector_backend}, confidence_threshold: {confidence}")
    
    print(f"[ENGINE] Starting detection with backend: {detector_backend}, confidence_threshold: 0.15")

    # 4. Process each image
    for img_path in image_paths:
        try:
            rel_path = img_path.relative_to(extract_dir)
            target_out_path = out_dir / rel_path
            
            # Ensure subfolder exists in output
            target_out_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Open Image
            img = Image.open(img_path).convert('RGB')
            
            # Detect
            print(f"[DEBUG] Running detection on {img_path.name}")
            bboxes = detector.detect(img)
            print(f"[DEBUG] Found {len(bboxes)} text boxes for {img_path.name}")
            
            # Remove conditional check for CTD backend to preserve neural network predictions
            if not bboxes and detector_backend != 'ctd':
                print(f"[WARNING] No text boxes detected for {img_path.name}")
                img.save(target_out_path)
                processed_files.append(str(target_out_path))
                continue
                
            # OCR (Local CPU via manga-ocr)
            print(f"[DEBUG] Running OCR on {img_path.name}")
            text_regions = recognize(img, bboxes)
            print(f"[DEBUG] Found {len(text_regions)} text regions after OCR")
            
            if not text_regions:
                print(f"[WARNING] No text regions recognized for {img_path.name}")
                img.save(target_out_path)
                processed_files.append(str(target_out_path))
                continue
                
            # Translate (LLM routing module)
            print(f"[DEBUG] Starting translation for {img_path.name}")
            japanese_blocks = [
                {
                    "text": r.text, 
                    "category": r.bbox.category, 
                    "coords": r.bbox.as_tuple()
                } for r in text_regions
            ]
            # Extract series context from path
            series_context = extract_series_context(str(img_path))
            
            # Debug logging
            print(f"[ENGINE] Processing {img_path.name}")
            print(f"[ENGINE] Found {len(text_regions)} text regions")
            print(f"[ENGINE] Series context: {series_context}")
            
            try:
                translated_texts = translate_batch(
                    japanese_blocks, 
                    token_router, 
                    series_context=series_context,
                    use_omniroute=True,
                    omniroute_url="http://localhost:20128/v1"
                )
            except Exception as e:
                print(f"[ERROR] Translation failed for {img_path.name}: {e}")
                print(f"[ERROR] Error type: {type(e).__name__}")
                raise  # Do not swallow translation errors
            
            # Debug logging for translation results
            print(f"[ENGINE] Translation results: {len(translated_texts)} translations")
            for original, translated in zip(text_regions, translated_texts):
                print(f"[ENGINE] {original.text} -> {translated}")
            
            # Compose & Inpaint (This handles both text erasing and rendering)
            print(f"[DEBUG] Starting composition and inpainting for {img_path.name}")
            translated_regions = [
                TranslatedRegion(
                    bbox=region.bbox,
                    original_text=region.text,
                    translated_text=tr_text,
                )
                for region, tr_text in zip(text_regions, translated_texts)
            ]
            translated_image = compose_page(img, translated_regions)
            print(f"[DEBUG] Composition complete for {img_path.name}")
            
            # Save final image
            print(f"[DEBUG] Saving translated image to {target_out_path}")
            translated_image.save(target_out_path)
            print(f"[DEBUG] Successfully saved translated image")
            processed_files.append(str(target_out_path))
            
            if progress_callback:
                progress_callback()
                
        except Exception as e:
            logger.error(f"Failed to process {img_path}: {e}")
            # Save original as fallback if pipeline fails
            shutil.copy2(img_path, target_out_path)
            processed_files.append(str(target_out_path))

    return processed_files
