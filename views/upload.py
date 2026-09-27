"""Upload & Translate page — upload manga pages and run the full translation pipeline."""
from __future__ import annotations
import streamlit as st
from PIL import Image
from core.detector import get_detector
from core.ocr import recognize
from core.translator import translate_batch, TranslatedRegion
from core.composer import compose_page
from services.key_manager import KeyManager
from services.token_router import TokenRouter
from services.usage_tracker import UsageTracker


def render() -> None:
    """Render the Upload & Translate page."""
    st.header('📥 Upload & Translate')

    # ── Upload Section ───────────────────────────────────────────────────
    uploaded_files = st.file_uploader(
        'Upload manga pages or a ZIP archive',
        type=['png', 'jpg', 'jpeg', 'webp', 'zip'],
        accept_multiple_files=True,
    )

    # Store uploaded images in session state
    if 'uploaded_pages' not in st.session_state:
        st.session_state.uploaded_pages = {}
        
    # We will also keep track if a zip was uploaded
    if 'uploaded_zip' not in st.session_state:
        st.session_state.uploaded_zip = None

    if uploaded_files:
        st.session_state.uploaded_pages = {}
        st.session_state.uploaded_zip = None
        
        for f in uploaded_files:
            if f.name.lower().endswith('.zip'):
                st.session_state.uploaded_zip = f
                break
            else:
                st.session_state.uploaded_pages[f.name] = Image.open(f).convert('RGB')

    if st.session_state.uploaded_zip:
        st.caption(f"📦 ZIP Archive loaded: {st.session_state.uploaded_zip.name}")
    elif st.session_state.uploaded_pages:
        st.caption(f"📄 {len(st.session_state.uploaded_pages)} page(s) loaded")

    # ── Detection Settings ────────────────────────────────────────────────
    st.divider()
    st.subheader('⚙️ Detection Settings')
    
    if 'detector_backend' not in st.session_state:
        st.session_state.detector_backend = 'ctd'  # Default to comic-text-detector ONNX
    
    detector_backend = st.selectbox(
        'Text Detection Method',
        ['ctd', 'dbnet'],  # Only neural network models - no OpenCV fallback
        index=['ctd', 'dbnet'].index(st.session_state.detector_backend),
        help='ctd: Comic-text-detector ONNX (specialized for comics, default)\ndbnet: Deep learning DBNet ONNX (accurate)'
    )
    st.session_state.detector_backend = detector_backend

    confidence_threshold = st.slider(
        'Detection Confidence Threshold',
        min_value=0.05,
        max_value=0.90,
        value=st.session_state.get('confidence_threshold', 0.15),
        step=0.05,
        help='Lower confidence threshold (e.g. 0.15) allows detecting faint or floating text over artwork.'
    )
    st.session_state.confidence_threshold = confidence_threshold

    # ── Translation Settings ──────────────────────────────────────────────
    st.divider()
    st.subheader('🌐 Translation Settings')
    
    # Initialize session state for translation settings
    if 'use_omniroute' not in st.session_state:
        st.session_state.use_omniroute = True
    if 'omniroute_url' not in st.session_state:
        st.session_state.omniroute_url = 'http://localhost:20128/v1'
    
    omniroute_toggle = st.checkbox(
        'Use OmniRoute (Structured Translation)',
        value=st.session_state.use_omniroute,
        help='Enable OmniRoute for structured JSON input/output that forces English translation'
    )
    st.session_state.use_omniroute = omniroute_toggle
    
    omniroute_url = st.text_input(
        'OmniRoute API URL',
        value=st.session_state.omniroute_url,
        help='OmniRoute API base URL for structured translation'
    )
    st.session_state.omniroute_url = omniroute_url

    # ── Annotation Mode ───────────────────────────────────────────────────
    if 'annotation_mode' not in st.session_state:
        st.session_state.annotation_mode = False

    annotation_mode = st.checkbox(
        '🖼️ Annotation Mode (Keep Original Art)',
        value=st.session_state.annotation_mode,
        help=(
            'Non-destructive mode: leaves the original artwork untouched. '
            'Draws numbered badges ① ② ③ next to each text box and appends '
            'a translation list at the bottom of the page.'
        )
    )
    st.session_state.annotation_mode = annotation_mode

    # ── Translate Button ─────────────────────────────────────────────────
    if st.button('🚀 Translate All', type='primary', use_container_width=True):
        key_manager = KeyManager()
        active_keys = key_manager.get_active_keys()

        if not st.session_state.uploaded_pages and not st.session_state.uploaded_zip:
            st.warning('Please upload some manga pages or a ZIP archive first.')
        elif not active_keys:
            st.warning('No active API keys found. Please add one in the API Keys page.')
        else:
            if 'usage_tracker' not in st.session_state:
                st.session_state.usage_tracker = UsageTracker()
            if 'translated_pages' not in st.session_state:
                st.session_state.translated_pages = {}
            if 'original_pages' not in st.session_state:
                st.session_state.original_pages = {}

            token_router = TokenRouter(key_manager, st.session_state.usage_tracker)
            detector_backend = st.session_state.get('detector_backend', 'ctd')
            
            # Placeholder for live routing updates during processing
            live_tracker_container = st.container()
            with live_tracker_container:
                st.markdown("### 📡 Live Routing Status")
                live_tracker_msg = st.empty()
                live_tracker_msg.info("Waiting to start...")
            
            def _update_live_tracker():
                events = st.session_state.usage_tracker.get_routing_log(limit=1)
                if events:
                    e = events[0]
                    emoji = "✅" if e.action == "request_ok" else "🔴" if e.action == "rate_limited" else "🔄"
                    live_tracker_msg.markdown(f"**{emoji} {e.action}** — {e.key_name} | {e.detail} | {e.tokens_used} tokens")
            
            if st.session_state.uploaded_zip:
                # Use the new local CPU engine for ZIPs
                from core.engine import process_archive
                import os
                
                try:
                    with st.spinner(f"Processing ZIP archive {st.session_state.uploaded_zip.name} ..."):
                        processed_paths = process_archive(
                            st.session_state.uploaded_zip,
                            token_router,
                            detector_backend=detector_backend,
                            progress_callback=_update_live_tracker
                        )
                except Exception as e:
                    error_msg = str(e)
                    if 'torch' in error_msg.lower() or 'pytorch' in error_msg.lower() or 'model' in error_msg.lower():
                        st.error(f"PyTorch model initialization failed: {error_msg}")
                        st.error("The deep learning model couldn't load. Please ensure PyTorch is installed and try falling back to 'opencv' backend.")
                    else:
                        st.error(f"Processing failed: {error_msg}")
                    processed_paths = []
                
                if processed_paths:
                    # Load them back into session state for the reader
                    for path in processed_paths:
                        fname = os.path.basename(path)
                        img = Image.open(path).convert('RGB')
                        st.session_state.translated_pages[fname] = img
                        # We don't have the original easily mapped in memory unless we load it too,
                        # but for the reader, providing the translated is enough.
                        st.session_state.original_pages[fname] = img
                    st.success(f"✅ Successfully processed {len(processed_paths)} pages from ZIP!")
                else:
                    st.error("Failed to process ZIP or no images found.")
            
            else:
                conf_thresh = st.session_state.get('confidence_threshold', 0.15)
                try:
                    detector = get_detector(detector_backend, confidence_threshold=conf_thresh)
                except Exception as e:
                    error_msg = str(e)
                    if 'torch' in error_msg.lower() or 'pytorch' in error_msg.lower() or 'model' in error_msg.lower():
                        st.error(f"PyTorch model initialization failed: {error_msg}")
                        st.error("The deep learning model couldn't load. Please ensure PyTorch is installed and try falling back to 'opencv' backend.")
                    else:
                        st.error(f"Detector initialization failed: {error_msg}")
                    return  # Exit the function since detector initialization failed
                
                page_items = list(st.session_state.uploaded_pages.items())
                
                print(f"[UPLOAD] Starting detection with backend: {detector_backend}, confidence_threshold: {conf_thresh}")

                for idx, (filename, img) in enumerate(page_items):
                    with st.status(f'Processing {filename} ({idx+1}/{len(page_items)})...', expanded=True) as status:
                        # Step 1: Detect
                        st.write('🔍 Detecting text bubbles...')
                        print(f"[DEBUG] Running detection on {filename}")
                        bboxes = detector.detect(img)
                        print(f"[DEBUG] Found {len(bboxes)} text boxes for {filename}")

                        # Remove conditional check for CTD backend to preserve neural network predictions
                        if not bboxes and detector_backend != 'ctd':
                            st.warning(f'⚠️ {filename} — no text detected (check debug_boxes.jpg)')
                            print(f"[WARNING] No text boxes detected for {filename}")
                            st.session_state.translated_pages[filename] = img.copy()
                            st.session_state.original_pages[filename] = img.copy()
                            status.update(label=f'⚠️ {filename} — no text detected', state='complete', expanded=False)
                            continue

                        # Step 2: OCR
                        st.write('📝 Running OCR...')
                        print(f"[DEBUG] Running OCR on {filename}")
                        text_regions = recognize(img, bboxes)
                        print(f"[DEBUG] Found {len(text_regions)} text regions after OCR")

                        if not text_regions:
                            st.warning(f'⚠️ {filename} — no text recognized')
                            print(f"[WARNING] No text regions recognized for {filename}")
                            st.session_state.translated_pages[filename] = img.copy()
                            st.session_state.original_pages[filename] = img.copy()
                            status.update(label=f'⚠️ {filename} — no text recognized', state='complete', expanded=False)
                            continue

                        # Step 3: Translate
                        st.write('🌐 Translating...')
                        print(f"[DEBUG] Starting translation for {filename}")
                        japanese_blocks = [
                            {
                                "text": region.text, 
                                "category": region.bbox.category, 
                                "coords": region.bbox.as_tuple()
                            } for region in text_regions
                        ]
                        # Extract series context from filename or use default
                        series_context = None
                        if filename:
                            # Try to extract series name from filename
                            import re
                            series_match = re.search(r'([A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+)', filename)
                            if series_match:
                                series_context = series_match.group(1)
                        
                        # Debug logging
                        print(f"[UPLOAD] Processing {filename}")
                        print(f"[UPLOAD] Found {len(text_regions)} text regions")
                        print(f"[UPLOAD] Series context: {series_context}")
                        
                        try:
                            translated_texts = translate_batch(
                                japanese_blocks, 
                                token_router, 
                                series_context=series_context,
                                use_omniroute=st.session_state.get('use_omniroute', True),
                                omniroute_url=st.session_state.get('omniroute_url', 'http://localhost:20128/v1')
                            )
                        except Exception as e:
                            print(f"[ERROR] Translation failed for {filename}: {e}")
                            print(f"[ERROR] Error type: {type(e).__name__}")
                            st.error(f'Translation failed for {filename}: {str(e)}')
                            status.update(label=f'❌ {filename} — translation failed', state='error', expanded=False)
                            raise  # Do not silently fallback to original image
                        
                        # Debug logging for translation results
                        print(f"[UPLOAD] Translation results: {len(translated_texts)} translations")
                        for original, translated in zip(text_regions, translated_texts):
                            print(f"[UPLOAD] {original.text} -> {translated}")

                        # Step 4: Compose
                        st.write('🎨 Composing translated page...')
                        print(f"[DEBUG] Starting composition and inpainting for {filename}")
                        
                        # Debug logging to verify translation mapping
                        print(f"[COMPOSE] Creating {len(text_regions)} translated regions")
                        for region, tr_text in zip(text_regions, translated_texts):
                            print(f"[COMPOSE] Region: {region.text} -> {tr_text}")
                        
                        translated_regions = [
                            TranslatedRegion(bbox=region.bbox, original_text=region.text, translated_text=tr_text)
                            for region, tr_text in zip(text_regions, translated_texts)
                        ]
                        
                        # This handles both text erasing (inpainting) and English text rendering
                        translated_image = compose_page(
                            img,
                            translated_regions,
                            annotation_mode=st.session_state.get('annotation_mode', False),
                        )
                        print(f"[DEBUG] Composition complete for {filename}")
                        print(f"[DEBUG] Translated image type: {type(translated_image)}")
                        print(f"[DEBUG] Translated image size: {translated_image.size}")
                        
                        # Verify we're using the rendered canvas, not the original
                        assert translated_image is not img, "Translated image should be a new canvas, not the original"
                        print(f"[DEBUG] Verified: translated_image is a new canvas (not original)")

                        status.update(label=f'✅ {filename} complete', state='complete', expanded=False)

                    # Explicitly verify session state assignment
                    print(f"[DEBUG] Assigning translated_image to session_state.translated_pages[{filename}]")
                    st.session_state.translated_pages[filename] = translated_image
                    st.session_state.original_pages[filename] = img.copy()
                    
                    # Verify the assignment
                    assert st.session_state.translated_pages[filename] is translated_image
                    print(f"[DEBUG] Verified: session_state.translated_pages[{filename}] is the rendered canvas")
                    print(f"[DEBUG] session_state.translated_pages[{filename}] size: {st.session_state.translated_pages[filename].size}")
                    print(f"[DEBUG] session_state.original_pages[{filename}] size: {st.session_state.original_pages[filename].size}")
                    
                    _update_live_tracker()

                st.success(f'✅ Successfully translated {len(page_items)} page(s)! Go to the **Manga Reader** to view them.')

    # ── Preview Section ──────────────────────────────────────────────────
    if st.session_state.get('translated_pages'):
        st.divider()
        st.subheader('Preview — Last Translated Page')
        last_filename = list(st.session_state.translated_pages.keys())[-1]
        col1, col2 = st.columns(2)
        with col1:
            st.image(st.session_state.original_pages[last_filename], caption='Original', use_container_width=True)
        with col2:
            st.image(st.session_state.translated_pages[last_filename], caption='Translated', use_container_width=True)


render()