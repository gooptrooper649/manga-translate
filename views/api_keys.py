"""API Key Manager page — add, view, toggle, and delete API keys."""
from __future__ import annotations
import streamlit as st
from services.key_manager import KeyManager


def render() -> None:
    """Render the API Key Manager page."""
    st.header('⚙️ API Key Manager')
    st.write('Manage your API keys for translation services. Keys are stored locally on disk.')

    key_manager = KeyManager()

    # ── Add Key Section ──────────────────────────────────────────────────
    with st.form('add_key_form'):
        name = st.text_input('Key Name', placeholder='e.g., My Gemini Free Tier')
        provider = st.selectbox('Provider', ['gemini', 'openai'])
        api_key = st.text_input('API Key', type='password', placeholder='Paste your API key here')
        submit = st.form_submit_button('💾 Save Key')

        if submit:
            if not name or not api_key:
                st.error('Please provide both a name and an API key.')
            else:
                key_manager.add_key(name=name, provider=provider, api_key=api_key)
                st.success(f'Key "{name}" saved successfully!')
                st.rerun()

    # ── Saved Keys Section ───────────────────────────────────────────────
    st.subheader('Saved Keys')
    keys = key_manager.list_keys()

    if not keys:
        st.info('No API keys saved yet.')
    else:
        for key in keys:
            with st.container(border=True):
                col1, col2, col3 = st.columns([2, 3, 2])
                with col1:
                    badge = "🔵 Gemini" if key.provider == 'gemini' else "🟢 OpenAI"
                    status_dot = "🟢" if key.is_active else "⚫"
                    st.write(f"**{key.name}**\n\n{badge}  {status_dot} {'Active' if key.is_active else 'Inactive'}")
                with col2:
                    masked = key_manager.mask_key(key.api_key)
                    st.write(f"`{masked}`")
                with col3:
                    toggle_label = "Deactivate" if key.is_active else "Activate"
                    if st.button(toggle_label, key=f"toggle_{key.id}"):
                        key_manager.toggle_active(key.id)
                        st.rerun()
                    if st.button("🗑️ Delete", key=f"delete_{key.id}"):
                        key_manager.remove_key(key.id)
                        st.rerun()


render()
