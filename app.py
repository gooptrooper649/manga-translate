import streamlit as st
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent))

from core.security import load_and_decrypt_config, has_user_config

def main():
    st.set_page_config(page_title="Manga Translator", page_icon="📖", layout="wide")

    # Session State Initialization: Check for encrypted config file
    if "api_key" not in st.session_state:
        config = load_and_decrypt_config()
        if config and config.get("api_key"):
            st.session_state["api_key"] = config["api_key"]
            st.session_state["provider"] = config.get("provider", "Gemini")
            st.session_state["is_authenticated"] = True
        else:
            st.session_state["api_key"] = None
            st.session_state["provider"] = None
            st.session_state["is_authenticated"] = False

    # Route based on authentication state
    if not st.session_state.get("is_authenticated") or not st.session_state.get("api_key"):
        # Not onboarded yet: Route to Auth/Login screen
        auth_page = st.Page("views/auth.py", title="Login & Onboarding", icon="🔐")
        pg = st.navigation([auth_page])
        pg.run()
        return

    # User is authenticated: Route to main translation dashboard
    pages = [
        st.Page("views/upload.py", title="Upload & Translate", icon="📥"),
        st.Page("views/reader.py", title="Manga Reader", icon="📖"),
        st.Page("views/tracker.py", title="Token Tracker", icon="📊"),
        st.Page("views/api_keys.py", title="API Keys", icon="⚙️"),
        st.Page("views/auth.py", title="Account / Re-authenticate", icon="🔐"),
    ]
    
    pg = st.navigation(pages)

    st.sidebar.title("📖 Manga Translator")
    st.sidebar.markdown("---")
    
    # Provider badge & status
    provider_name = st.session_state.get("provider", "Gemini")
    st.sidebar.markdown(f"**Connected Provider**: `{provider_name}`")
    st.sidebar.caption("Encrypted local config loaded (Fernet AES)")
    
    translated_pages = st.session_state.get('translated_pages', {})
    st.sidebar.metric("Translated Pages", len(translated_pages))
    
    if st.sidebar.button("🚪 Log out & Clear Key"):
        from core.security import clear_user_config
        clear_user_config()
        st.session_state.pop("api_key", None)
        st.session_state["is_authenticated"] = False
        st.rerun()

    pg.run()

if __name__ == "__main__":
    main()
