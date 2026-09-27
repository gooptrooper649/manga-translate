"""Manga Reader page — gallery/reader view with individual and batch download from local output."""
from __future__ import annotations
import io
import os
import zipfile
import streamlit as st
from pathlib import Path
from PIL import Image

def _image_to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    """Convert a PIL Image to bytes."""
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()

def render() -> None:
    """Render the Manga Reader page."""
    st.header('📖 Manga Reader')

    # Load from the backend output folder sequentially
    output_dir = Path("output/translated")
    image_paths = []
    
    if output_dir.exists():
        for root, _, files in os.walk(output_dir):
            for file in files:
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    image_paths.append(Path(root) / file)
                    
    image_paths.sort()
    
    # Also grab any session state pages not in the output directory
    session_translated = st.session_state.get('translated_pages', {})
    session_original = st.session_state.get('original_pages', {})
    
    if not image_paths and not session_translated:
        st.info('No translated pages found. Upload and translate manga pages first!')
        return

    # Combine file paths and session state images
    # For simplicity in reader, we will just use file paths if available.
    # But to support the in-memory upload flow without breaking it, we merge them.
    # We will prioritize file paths.
    all_items = []
    for p in image_paths:
        all_items.append({"name": p.name, "path": p, "img": None})
        
    for name, img in session_translated.items():
        if not any(item["name"] == name for item in all_items):
            all_items.append({"name": name, "path": None, "img": img})

    if 'reader_page_index' not in st.session_state:
        st.session_state.reader_page_index = 0

    view_mode = st.radio('View', ['Gallery', 'Reader'], horizontal=True)

    # Helper to load image
    def load_image(item):
        if item["img"] is not None:
            return item["img"]
        return Image.open(item["path"]).convert("RGB")

    # ── Gallery Mode ─────────────────────────────────────────────────────
    if view_mode == 'Gallery':
        cols_per_row = 4
        for row_start in range(0, len(all_items), cols_per_row):
            row_items = all_items[row_start : row_start + cols_per_row]
            cols = st.columns(len(row_items))
            for col, item in zip(cols, row_items):
                with col:
                    img = load_image(item)
                    st.image(img, caption=item["name"], use_container_width=True)
                    
                    # Dedicated download button next to each individual image
                    btn_cols = st.columns(2)
                    with btn_cols[0]:
                        if st.button("📖 Read", key=f"read_{item['name']}"):
                            st.session_state.reader_page_index = all_items.index(item)
                            st.rerun()
                    with btn_cols[1]:
                        st.download_button(
                            label="⬇️ DL",
                            data=_image_to_bytes(img),
                            file_name=f"translated_{item['name']}",
                            mime="image/png",
                            key=f"dl_{item['name']}"
                        )

    # ── Reader Mode ──────────────────────────────────────────────────────
    else:
        idx = st.session_state.reader_page_index
        if idx >= len(all_items):
            idx = 0
            st.session_state.reader_page_index = 0

        item = all_items[idx]
        img = load_image(item)
        filename = item["name"]

        # Navigation
        nav1, nav2, nav3 = st.columns([1, 2, 1])
        with nav1:
            if st.button('⬅️ Prev', disabled=(idx == 0), use_container_width=True):
                st.session_state.reader_page_index -= 1
                st.rerun()
        with nav2:
            st.markdown(
                f"<h4 style='text-align: center'>Page {idx + 1} of {len(all_items)}</h4>",
                unsafe_allow_html=True,
            )
        with nav3:
            if st.button('Next ➡️', disabled=(idx == len(all_items) - 1), use_container_width=True):
                st.session_state.reader_page_index += 1
                st.rerun()

        # Original/Translated toggle
        show_original = st.toggle('Show Original', key='show_original')
        display_img = session_original.get(filename, img) if show_original else img
        st.image(display_img, use_container_width=True, caption=f"{'Original' if show_original else 'Translated'} — {filename}")

        # Dedicated download button next to individual image
        st.download_button(
            label=f"⬇️ Download This Page",
            data=_image_to_bytes(display_img),
            file_name=f"{'orig' if show_original else 'translated'}_{filename}",
            mime="image/png",
        )

    # ── Batch Download Section ───────────────────────────────────────────
    st.divider()
    st.subheader('📦 Download All')

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in all_items:
            img = load_image(item)
            # If path exists, use its relative path for the zip structure
            if item["path"]:
                rel_path = item["path"].relative_to(output_dir)
                zf.writestr(str(rel_path), _image_to_bytes(img))
            else:
                zf.writestr(f"translated_{item['name']}", _image_to_bytes(img))

    st.download_button(
        label='📦 Download All Translated Pages (ZIP)',
        data=zip_buf.getvalue(),
        file_name='manga_translated_batch.zip',
        mime='application/zip',
        use_container_width=True,
    )

render()
