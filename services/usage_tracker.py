from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timedelta

@dataclass
class KeyUsageStats:
    key_id: str
    key_name: str
    provider: str
    total_requests: int = 0
    total_tokens: int = 0
    rate_limit_hits: int = 0
    last_used: datetime | None = None
    is_rate_limited: bool = False
    cooldown_until: datetime | None = None

@dataclass
class RoutingEvent:
    timestamp: datetime
    key_name: str
    provider: str
    action: str          # 'request_ok', 'rate_limited', 'fallback'
    detail: str          # human-readable description
    tokens_used: int = 0

class UsageTracker:
    """Tracks per-key API usage stats. Lives in st.session_state."""
    
    def __init__(self):
        self.stats: dict[str, KeyUsageStats] = {}
        self.events: list[RoutingEvent] = []

    def ensure_key(self, key_id: str, key_name: str, provider: str):
        """Registers a key if not already tracked."""
        if key_id not in self.stats:
            self.stats[key_id] = KeyUsageStats(
                key_id=key_id,
                key_name=key_name,
                provider=provider
            )

    def record_request(self, key_id: str, tokens: int = 0):
        """Increments request count, token count, updates last_used."""
        if key_id in self.stats:
            stat = self.stats[key_id]
            stat.total_requests += 1
            stat.total_tokens += tokens
            stat.last_used = datetime.now()
            self.events.append(RoutingEvent(
                timestamp=datetime.now(),
                key_name=stat.key_name,
                provider=stat.provider,
                action='request_ok',
                detail='Successful request',
                tokens_used=tokens
            ))

    def record_rate_limit(self, key_id: str, cooldown_seconds: float = 60.0):
        """Marks key as rate-limited, sets cooldown, logs event."""
        if key_id in self.stats:
            stat = self.stats[key_id]
            stat.is_rate_limited = True
            stat.cooldown_until = datetime.now() + timedelta(seconds=cooldown_seconds)
            stat.rate_limit_hits += 1
            self.events.append(RoutingEvent(
                timestamp=datetime.now(),
                key_name=stat.key_name,
                provider=stat.provider,
                action='rate_limited',
                detail=f'Rate limited, cooldown for {cooldown_seconds}s',
                tokens_used=0
            ))

    def record_fallback(self, from_key_id: str, to_key_id: str, reason: str):
        """Adds a fallback RoutingEvent."""
        from_stat = self.stats.get(from_key_id)
        if from_stat:
            self.events.append(RoutingEvent(
                timestamp=datetime.now(),
                key_name=from_stat.key_name,
                provider=from_stat.provider,
                action='fallback',
                detail=reason,
                tokens_used=0
            ))

    def check_cooldown(self, key_id: str) -> bool:
        """Returns True if key is still in cooldown, False otherwise (clears flag if expired)."""
        if key_id in self.stats:
            stat = self.stats[key_id]
            if stat.is_rate_limited:
                if stat.cooldown_until and datetime.now() > stat.cooldown_until:
                    stat.is_rate_limited = False
                    stat.cooldown_until = None
                    return False
                return True
        return False

    def get_stats(self, key_id: str) -> KeyUsageStats | None:
        """Gets stats for a specific key."""
        return self.stats.get(key_id)

    def get_all_stats(self) -> list[KeyUsageStats]:
        """Gets all key stats."""
        return list(self.stats.values())

    def get_routing_log(self, limit: int = 50) -> list[RoutingEvent]:
        """Returns most recent events up to limit."""
        return sorted(self.events, key=lambda x: x.timestamp, reverse=True)[:limit]

    def clear(self):
        """Resets all tracking data."""
        self.stats.clear()
        self.events.clear()
