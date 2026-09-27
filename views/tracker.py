"""Live Token & Routing Tracker page — real-time API usage and routing events."""
from __future__ import annotations
import streamlit as st
from datetime import datetime
from services.usage_tracker import UsageTracker


def render() -> None:
    """Render the Live Token & Routing Tracker page."""
    st.header('📊 Live Token & Routing Tracker')

    if 'usage_tracker' not in st.session_state:
        st.session_state.usage_tracker = UsageTracker()

    tracker: UsageTracker = st.session_state.usage_tracker

    # ── Key Status Section ───────────────────────────────────────────────
    st.subheader('Key Status')
    stats = tracker.get_all_stats()

    if not stats:
        st.info('No API activity yet. Process some manga pages first!')
    else:
        cols = st.columns(min(3, len(stats)))
        for i, stat in enumerate(stats):
            with cols[i % len(cols)]:
                with st.container(border=True):
                    provider_icon = "🔵" if stat.provider == "gemini" else "🟢"
                    st.markdown(f"**{stat.key_name}** {provider_icon} {stat.provider.title()}")
                    
                    m1, m2 = st.columns(2)
                    m1.metric('Requests', stat.total_requests)
                    m2.metric('Tokens Used', stat.total_tokens)

                    # Status badge
                    if stat.is_rate_limited and stat.cooldown_until:
                        remaining = (stat.cooldown_until - datetime.now()).total_seconds()
                        if remaining > 0:
                            st.write(f"🟡 Cooldown ({int(remaining)}s remaining)")
                        else:
                            st.write("🟢 Active")
                    elif stat.rate_limit_hits > 0:
                        st.write(f"🔴 Rate-Limited ({stat.rate_limit_hits} hits)")
                    else:
                        st.write("🟢 Active")

                    # Progress bar: rate limit hits vs total requests
                    if stat.total_requests > 0:
                        ratio = min(1.0, stat.rate_limit_hits / stat.total_requests)
                        st.progress(ratio, text=f"Rate limit ratio: {ratio:.0%}")

    # ── Routing Log Section ──────────────────────────────────────────────
    st.subheader('Routing Log')
    events = tracker.get_routing_log(limit=50)

    if not events:
        st.info('No routing events recorded yet.')
    else:
        log_data = []
        for e in events:
            emoji = "✅" if e.action == "request_ok" else "🔴" if e.action == "rate_limited" else "🔄"
            log_data.append({
                "Time": e.timestamp.strftime("%H:%M:%S"),
                "Key Name": e.key_name,
                "Action": f"{emoji} {e.action}",
                "Detail": e.detail,
                "Tokens": e.tokens_used,
            })
        st.dataframe(log_data, use_container_width=True)

    if st.button('🔄 Refresh'):
        st.rerun()


render()
