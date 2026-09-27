import streamlit as st
import sys
from pathlib import Path

# Add project root to path to allow importing from core and services
sys.path.append(str(Path(__file__).parent))

def main():
    st.set_page_config(page_title="Manga Translator", page_icon="📖", layout="wide")

    pages = [
        st.Page("views/upload.py", title="Upload & Translate", icon="📥"),
        st.Page("views/reader.py", title="Manga Reader", icon="📖"),
        st.Page("views/tracker.py", title="Token Tracker", icon="📊"),
        st.Page("views/api_keys.py", title="API Keys", icon="⚙️")
    ]
    
    pg = st.navigation(pages)

    st.sidebar.title("📖 Manga Translator")
    st.sidebar.markdown("---")
    
    active_keys_count = 0
    try:
        from services.key_manager import KeyManager
        km = KeyManager()
        keys = km.list_keys()
        active_keys_count = sum(1 for k in keys if k.is_active)
    except Exception:
        pass

    st.sidebar.metric("Active API Keys", active_keys_count)
    
    translated_pages = st.session_state.get('translated_pages', {})
    st.sidebar.metric("Translated Pages", len(translated_pages))
    
    st.sidebar.caption("Local • No Login Required")
    
    pg.run()

if __name__ == "__main__":
    main()
