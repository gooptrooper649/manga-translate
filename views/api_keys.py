"""API Keys & Security Management view."""
from __future__ import annotations
import streamlit as st
from core.security import load_and_decrypt_config, clear_user_config

def render():
    st.header("⚙️ API Key & Provider Configuration")
    
    cfg = load_and_decrypt_config()
    if cfg and cfg.get("api_key"):
        st.success(f"🔐 Local Encrypted Config Active: **{cfg.get('provider', 'Gemini')}**")
        masked = cfg["api_key"][:4] + "••••" + cfg["api_key"][-3:]
        st.markdown(f"- **Encrypted File**: `user_config.json`")
        st.markdown(f"- **Masked Key**: `{masked}`")
        st.markdown(f"- **Cipher**: Fernet (AES-128-CBC + HMAC-SHA256)")
        
        if st.button("🚪 Clear Credentials"):
            clear_user_config()
            st.session_state.pop("api_key", None)
            st.session_state["is_authenticated"] = False
            st.success("Credentials cleared. Reloading...")
            st.rerun()
    else:
        st.warning("No credentials currently saved. Please visit the login screen.")

if __name__ == "__main__":
    render()
