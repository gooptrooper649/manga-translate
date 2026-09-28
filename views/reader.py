"""Manga Reader UI with seamless page flipping, Side-by-Side mode, and in-memory ZIP export."""
from __future__ import annotations
import io
import zipfile
from pathlib import Path
from typing import Dict, Any
from PIL import Image
import streamlit as st

def bundle_volume_to_zip(pages_dict: Dict[str, Any]) -> bytes:
    """
    Bundles all processed PIL.Image objects in session_state into a newly created
    .zip file in memory using Python's zipfile and io.BytesIO().
    """
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, (filename, page_data) in enumerate(pages_dict.items()):
            img = page_data.get("image")
            if img:
                img_bytes_io = io.BytesIO()
                img.save(img_bytes_io, format="PNG")
                clean_stem = Path(filename).stem
                archive_filename = f"{idx + 1:03d}_translated_{clean_stem}.png"
                zf.writestr(archive_filename, img_bytes_io.getvalue())
    zip_buffer.seek(0)
    return zip_buffer.getvalue()

def render():
    st.header("📖 Manga Reader & Chapter Export")
    st.markdown("Read localized manga volumes with seamless page navigation, side-by-side comparison, and high-res chapter export.")

    # Check for processed pages in session_state
    if "translated_pages" not in st.session_state:
        st.session_state["translated_pages"] = {}

    pages_dict = st.session_state["translated_pages"]

    # Empty State
    if not pages_dict:
        st.info("ℹ️ No processed manga pages found in current session. Upload and translate manga pages in the **Upload & Translate** tab to read them here.")
        sample_dir = Path("sample_images")
        if sample_dir.exists():
            sample_files = sorted(list(sample_dir.glob("page_*.png")))
            if sample_files and st.button("📂 Load Authentic Sample Pages for Viewing"):
                loaded = {}
                for sfile in sample_files:
                    try:
                        pimg = Image.open(sfile).convert("RGB")
                        loaded[sfile.name] = {
                            "filename": sfile.name,
                            "image": pimg,
                            "original_image": pimg,
                            "regions": []
                        }
                    except Exception as err:
                        st.warning(f"Could not load {sfile.name}: {err}")
                st.session_state["translated_pages"] = loaded
                st.session_state["reader_page_index"] = 0
                st.success(f"Loaded {len(loaded)} sample pages.")
                st.rerun()
        return

    page_names = list(pages_dict.keys())
    total_pages = len(page_names)

    # Initialize current reader index in session state
    if "reader_page_index" not in st.session_state:
        st.session_state["reader_page_index"] = 0

    # Ensure index bounds
    st.session_state["reader_page_index"] = max(0, min(st.session_state["reader_page_index"], total_pages - 1))
    curr_idx = st.session_state["reader_page_index"]
    curr_page_name = page_names[curr_idx]
    curr_page_data = pages_dict[curr_page_name]

    # Reader Top Navigation Controls Bar
    st.markdown("---")
    col_prev, col_info, col_next = st.columns([1, 2, 1])

    with col_prev:
        prev_disabled = (curr_idx == 0)
        if st.button("◀ Previous Page", disabled=prev_disabled, use_container_width=True):
            st.session_state["reader_page_index"] -= 1
            st.rerun()

    with col_info:
        selected_idx = st.selectbox(
            "Jump to Page",
            options=range(total_pages),
            format_func=lambda i: f"Page {i + 1} / {total_pages} ({page_names[i]})",
            index=curr_idx,
            label_visibility="collapsed",
        )
        if selected_idx != curr_idx:
            st.session_state["reader_page_index"] = selected_idx
            st.rerun()

    with col_next:
        next_disabled = (curr_idx == total_pages - 1)
        if st.button("Next Page ▶", disabled=next_disabled, use_container_width=True):
            st.session_state["reader_page_index"] += 1
            st.rerun()

    st.markdown(f"**Current Page:** `{curr_page_name}` (Page {curr_idx + 1} of {total_pages})")

    # View Mode Options
    col_mode, col_export = st.columns([2, 1])
    with col_mode:
        side_by_side = st.checkbox("Side-by-Side Comparison (Original vs Translated)", value=False)
        show_original_only = st.checkbox("Show Original Scan Only", value=False)

    with col_export:
        zip_bytes = bundle_volume_to_zip(pages_dict)
        st.download_button(
            label="📦 Download Complete Volume (.zip)",
            data=zip_bytes,
            file_name="localized_manga_volume.zip",
            mime="application/zip",
            use_container_width=True,
            type="primary",
        )

    # Render Active Page
    st.markdown("---")
    orig_img = curr_page_data.get("original_image")
    trans_img = curr_page_data.get("image")

    if side_by_side and orig_img and trans_img:
        c1, c2 = st.columns(2)
        with c1:
            st.caption("Original Japanese Scan")
            st.image(orig_img, use_container_width=True)
        with c2:
            st.caption("Localized & Typeset Scan")
            st.image(trans_img, use_container_width=True)
    elif show_original_only and orig_img:
        st.caption("Original Japanese Scan")
        st.image(orig_img, use_container_width=True)
    elif trans_img:
        st.caption("Localized & Typeset Scan")
        st.image(trans_img, use_container_width=True)
    elif orig_img:
        st.caption("Original Japanese Scan")
        st.image(orig_img, use_container_width=True)
    else:
        st.warning("No image data available for this page.")

    # Dialogue transcript / inspector
    regions = curr_page_data.get("regions", [])
    if regions:
        with st.expander(f"💬 Detected Dialogue & Translations ({len(regions)} bubbles)", expanded=False):
            for r in regions:
                st.markdown(f"**Bubble #{r.get('id', 0) + 1}**")
                st.text(f"JP: {r.get('japanese', '')}")
                st.text(f"EN: {r.get('translation', '')}")
                st.markdown("---")
