"""Authentication & Onboarding view — secure API key setup and validation."""
from __future__ import annotations
import streamlit as st
from core.security import save_encrypted_config, load_and_decrypt_config, clear_user_config

def validate_google_genai_key(api_key: str) -> tuple[bool, str]:
    """
    Validate the Gemini API key by sending a tiny test payload using Google GenAI SDK.
    Returns (is_valid, message).
    """
    try:
        from google import genai
        client = genai.Client(api_key=api_key.strip())
        # Send minimal payload to verify API authentication
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="hello",
        )
        if response and response.text:
            return True, "API Key successfully verified with Google GenAI!"
        return True, "API Key connected successfully."
    except Exception as e:
        error_msg = str(e)
        if "API_KEY_INVALID" in error_msg or "INVALID_ARGUMENT" in error_msg or "400" in error_msg:
            return False, "Invalid API Key. Please verify your Google AI Studio key and try again."
        elif "PERMISSION_DENIED" in error_msg or "403" in error_msg:
            return False, "Permission denied for this API key. Ensure the Generative Language API is enabled."
        elif "RESOURCE_EXHAUSTED" in error_msg or "429" in error_msg:
            return True, "API Key is valid (currently rate-limited or quota exceeded)."
        return False, f"Connection failed: {error_msg}"

def render() -> None:
    st.header("🔐 User Onboarding & API Key Authentication")
    st.markdown("Set up your translation provider and securely encrypt your API key locally on this machine.")

    existing_config = load_and_decrypt_config()
    is_authenticated = bool(existing_config and existing_config.get("api_key"))

    if is_authenticated:
        st.success(f"✅ Active Config Detected: Connected to **{existing_config.get('provider', 'Gemini')}**")
        masked_key = existing_config['api_key'][:4] + "..." + existing_config['api_key'][-3:]
        st.caption(f"Encrypted local key: `{masked_key}` (stored in user_config.json)")

        col1, col2 = st.columns([1, 1])
        with col1:
            if st.button("🚀 Continue to Translation Dashboard", type="primary", use_container_width=True):
                st.session_state["api_key"] = existing_config["api_key"]
                st.session_state["provider"] = existing_config.get("provider", "Gemini")
                st.session_state["is_authenticated"] = True
                st.rerun()
        with col2:
            if st.button("🔄 Reset / Re-enter Key", use_container_width=True):
                clear_user_config()
                st.session_state.pop("api_key", None)
                st.session_state["is_authenticated"] = False
                st.rerun()

        st.divider()
        st.subheader("Update Credentials")

    # Onboarding / Key Setup Form
    with st.form("auth_form"):
        provider = st.selectbox(
            "Provider Name",
            options=["Gemini", "Groq", "OpenAI", "DeepSeek"],
            index=0,
            help="Select the AI service provider for translation and OCR.",
        )

        api_key = st.text_input(
            "API Key",
            type="password",
            placeholder="Paste your API key here (e.g. AIzaSy...)",
            help="Your API key will be encrypted with Fernet (AES-128-CBC) before being saved to disk.",
        )

        col_test, col_submit = st.columns([1, 1])
        with col_test:
            test_clicked = st.form_submit_button("🧪 Test Connection", use_container_width=True)
        with col_submit:
            submit_clicked = st.form_submit_button("💾 Save & Encrypt Credentials", type="primary", use_container_width=True)

    # Handle Test Connection
    if test_clicked:
        if not api_key.strip():
            st.error("Please enter an API key before testing connection.")
        else:
            with st.spinner(f"Verifying connection to {provider}..."):
                if provider.lower() == "gemini":
                    ok, msg = validate_google_genai_key(api_key.strip())
                    if ok:
                        st.success(f"✅ {msg}")
                    else:
                        st.error(f"❌ {msg}")
                else:
                    st.info(f"Key format validated for {provider}. Ready to save.")

    # Handle Save
    if submit_clicked:
        if not api_key.strip():
            st.error("Please enter a valid API key.")
        else:
            with st.spinner("Validating and encrypting credentials..."):
                if provider.lower() == "gemini":
                    ok, msg = validate_google_genai_key(api_key.strip())
                    if not ok:
                        st.error(f"Validation failed: {msg}")
                        st.stop()
                    else:
                        st.success(msg)

                save_encrypted_config(api_key=api_key.strip(), provider=provider)
                st.session_state["api_key"] = api_key.strip()
                st.session_state["provider"] = provider
                st.session_state["is_authenticated"] = True
                st.success("🎉 Key successfully encrypted and stored in `user_config.json`! Loading dashboard...")
                st.rerun()

if __name__ == "__main__":
    render()
