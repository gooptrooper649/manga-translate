"""Upload & Batch Translation view with Streamlit file router, st.progress, and st.status."""
from __future__ import annotations
import io
import zipfile
import streamlit as st
from PIL import Image

from core.engine import BatchTranslationEngine
from core.security import load_and_decrypt_config

def render():
    st.header("📥 Upload & Batch Translation Pipeline")
    st.markdown(
        "Upload single manga pages, multiple image files, or complete `.zip` archives. "
        "The high-performance pipeline combines page OCR into a single Gemini batch API call for maximum speed."
    )

    # Sidebar / Settings
    with st.expander("⚙️ Pipeline Configuration & Detection Parameters", expanded=True):
        col1, col2, col3 = st.columns([1.5, 1, 1])
        with col1:
            series_context = st.text_input(
                "Series Context / Persona",
                value="Shonen Comedy Adventure",
                help="Contextual background provided to Gemini to ensure consistent localization."
            )
        with col2:
            target_language = st.selectbox(
                "Target Language",
                options=["English", "Spanish", "French", "German", "Portuguese", "Italian"],
                index=0
            )
        with col3:
            confidence_threshold = st.slider(
                "Confidence Threshold",
                min_value=0.05,
                max_value=0.90,
                value=0.15,
                step=0.05,
                help="Raw bounding box threshold > 0.15 captures floating vertical characters and SFX."
            )

        annotation_mode = st.toggle(
            "🖼️ Non-Interruptive Footer Annotation Mode",
            value=False,
            help="If enabled, leaves original art untouched, draws ① ② ③ badges on text blocks, and expands canvas downwards with a neat English translation footer."
        )

    # File Router: Accepts .jpg, .jpeg, .png, and .zip files
    uploaded_files = st.file_uploader(
        "Upload Manga Pages or ZIP Archive",
        type=["jpg", "jpeg", "png", "zip"],
        accept_multiple_files=True,
        help="Upload single or multiple .jpg/.png images, or a .zip archive containing manga pages."
    )

    if not uploaded_files:
        st.info("👆 Please upload one or more `.jpg`, `.png`, or `.zip` files to begin batch localization.")
        return

    # Check whether user uploaded a ZIP archive
    has_zip = any(f.name.lower().endswith(".zip") for f in uploaded_files)
    if has_zip:
        st.info(f"📦 Detected ZIP archive upload. The engine will unpack and extract all images sequentially to a temporary directory.")

    col_btn, _ = st.columns([1, 2])
    with col_btn:
        start_processing = st.button("🚀 Start High-Performance Batch Translation", type="primary", use_container_width=True)

    if start_processing:
        config = load_and_decrypt_config()
        api_key = config.get("api_key") if config else None

        engine = BatchTranslationEngine(
            confidence_threshold=confidence_threshold,
            annotation_mode=annotation_mode,
            series_context=series_context,
            target_language=target_language,
            api_key=api_key,
        )

        # Progress tracking using Streamlit's st.progress() bar and st.status() container
        progress_bar = st.progress(0.0, text="Initializing high-performance batch pipeline...")
        status_container = st.status("🚀 Starting Batch Translation Pipeline...", expanded=True)

        completed_pages = []

        try:
            with status_container:
                # Check if first file is a ZIP
                is_zip_archive = uploaded_files[0].name.lower().endswith(".zip")
                files_to_process = uploaded_files if not is_zip_archive else [uploaded_files[0]]

                gen = engine.process_files_generator(files_to_process, is_zip=is_zip_archive)

                current_file_name = ""
                for step_info in gen:
                    # Update progress bar
                    progress_bar.progress(
                        min(1.0, max(0.0, step_info.percent)),
                        text=f"Processing {step_info.filename} ({step_info.current_index}/{step_info.total_files})"
                    )

                    # Update status container with step descriptions
                    if step_info.status_step == "extracting":
                        st.write(f"📦 **Archive Extractor**: {step_info.message}")
                    elif step_info.status_step == "detecting":
                        st.write(f"🔍 **Detector**: [{step_info.filename}] Running Comic Text Detection (preserving vertical & floating text)...")
                    elif step_info.status_step == "ocr":
                        st.write(f"📝 **OCR Engine**: [{step_info.filename}] Extracting Japanese dialogue blocks...")
                    elif step_info.status_step == "translating_api":
                        st.write(f"⚡ **Batch API Optimization**: [{step_info.filename}] Sending single JSON dictionary payload to Gemini API...")
                    elif step_info.status_step == "completed":
                        st.write(f"✅ **Composition Complete**: [{step_info.filename}] Translated canvas ready!")
                        if step_info.result_image:
                            completed_pages.append({
                                "filename": step_info.filename,
                                "image": step_info.result_image,
                                "original_image": step_info.original_image,
                                "regions": step_info.regions or [],
                            })

                status_container.update(
                    label=f"🎉 Batch Localization Complete! ({len(completed_pages)} pages localized)",
                    state="complete",
                    expanded=False
                )
                progress_bar.progress(1.0, text="All pages successfully processed!")

            # Store in session state for Manga Reader
            if "translated_pages" not in st.session_state:
                st.session_state["translated_pages"] = {}

            for page in completed_pages:
                st.session_state["translated_pages"][page["filename"]] = page

            st.success(f"Successfully processed and localized {len(completed_pages)} manga page(s)!")

        except Exception as e:
            status_container.update(label=f"❌ Error occurred during batch processing", state="error")
            st.error(f"Processing error: {str(e)}")

    # Display gallery if pages exist
    if "translated_pages" in st.session_state and st.session_state["translated_pages"]:
        st.divider()
        st.subheader("📖 Localized Manga Pages")

        pages_dict = st.session_state["translated_pages"]
        page_names = list(pages_dict.keys())

        # Download All as ZIP button
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w") as zf:
            for name, pdata in pages_dict.items():
                img = pdata["image"]
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format="PNG")
                zf.writestr(f"translated_{name}.png", img_byte_arr.getvalue())

        st.download_button(
            label=f"📥 Download All {len(pages_dict)} Pages (ZIP)",
            data=zip_buf.getvalue(),
            file_name="translated_manga_batch.zip",
            mime="application/zip",
            use_container_width=False,
        )

        selected_page = st.selectbox("Select Page to Preview", options=page_names, index=0)
        if selected_page:
            pinfo = pages_dict[selected_page]
            st.image(pinfo["image"], caption=f"Localized: {selected_page}", use_container_width=True)

if __name__ == "__main__":
    render()
