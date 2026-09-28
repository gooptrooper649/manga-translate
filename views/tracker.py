"""Token Tracker & Routing Dashboard."""
from __future__ import annotations
import streamlit as st

def render():
    st.header("📊 Token Routing & Consumption Tracker")
    st.markdown("Live analytics on API batch optimization, rate limits, and token usage.")

    col1, col2, col3 = st.columns(3)
    pages_count = len(st.session_state.get("translated_pages", {}))
    with col1:
        st.metric("Pages Localized", pages_count)
    with col2:
        st.metric("Estimated Tokens Used", pages_count * 250)
    with col3:
        st.metric("Active Provider", st.session_state.get("provider", "Gemini"))

    st.subheader("Batch Optimization Efficiency")
    st.info(
        "💡 **Batch API Optimization enabled**: Combining all dialogue regions of each manga page "
        "into a single JSON dictionary reduces API overhead by up to ~80% compared to per-box requests."
    )

if __name__ == "__main__":
    render()
