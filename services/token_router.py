from __future__ import annotations
from dataclasses import dataclass
from services.key_manager import KeyManager, ApiKeyEntry
from services.usage_tracker import UsageTracker

@dataclass
class RouteConfig:
    provider: str
    model: str
    level: int

class TokenRouter:
    """Selects which API key and model to use, handling rate-limit fallbacks."""
    
    HIERARCHY = [
        RouteConfig(provider='gemini', model='gemini-3.5-flash', level=1),
        RouteConfig(provider='gemini', model='gemini-3.1-flash-lite', level=2),
        RouteConfig(provider='deepseek', model='deepseek-chat', level=3) # deepseek-v3
    ]
    
    def __init__(self, key_manager: KeyManager, usage_tracker: UsageTracker):
        self._key_manager = key_manager
        self._tracker = usage_tracker
        self._provider_index: dict[str, int] = {}  # round-robin index per provider

    def get_next_route(self) -> tuple[ApiKeyEntry, RouteConfig] | tuple[None, None]:
        """Gets the next available key and model using the strict hierarchy."""
        for route in self.HIERARCHY:
            key = self._get_key_for_provider_and_route(route)
            if key:
                return key, route
                
        return None, None
        
    def _get_key_for_provider_and_route(self, route: RouteConfig) -> ApiKeyEntry | None:
        """Helper to get an available key that isn't rate-limited for this specific route's provider."""
        active_keys = self._key_manager.get_active_keys(provider=route.provider)
        if not active_keys:
            return None
            
        # We assume cooldowns are stored as <key_id>:<model> or just <key_id>.
        # If rate limit is per model, we could check f"{k.id}:{route.model}".
        # For simplicity, we check if the key itself is rate-limited.
        # Actually, let's just use the key. If it's rate-limited, we might still want to try the fallback model on the same key!
        # So let's store cooldowns with model granularity in the tracker, or just let the router check a scoped ID.
        # Let's scope it: scoped_id = f"{k.id}::{route.model}"
        
        available_keys = [k for k in active_keys if not self._tracker.check_cooldown(f"{k.id}::{route.model}")]
        if not available_keys:
            return None
            
        provider = route.provider
        if provider not in self._provider_index:
            self._provider_index[provider] = 0
            
        idx = self._provider_index[provider] % len(available_keys)
        selected_key = available_keys[idx]
        
        self._provider_index[provider] = (idx + 1) % len(available_keys)
        
        return selected_key

    def report_success(self, key: ApiKeyEntry, route: RouteConfig, tokens_used: int = 0):
        """Records a successful API call."""
        scoped_id = f"{key.id}::{route.model}"
        self._tracker.ensure_key(scoped_id, f"{key.name} ({route.model})", key.provider)
        self._tracker.record_request(scoped_id, tokens_used)

    def report_rate_limit(self, key: ApiKeyEntry, route: RouteConfig, cooldown_seconds: float = 60.0):
        """Records a rate limit hit and marks the specific key+model for cooldown."""
        scoped_id = f"{key.id}::{route.model}"
        self._tracker.ensure_key(scoped_id, f"{key.name} ({route.model})", key.provider)
        self._tracker.record_rate_limit(scoped_id, cooldown_seconds)

    def report_fallback(self, from_key: ApiKeyEntry, from_route: RouteConfig, to_key: ApiKeyEntry, to_route: RouteConfig):
        """Records a fallback event."""
        from_scoped = f"{from_key.id}::{from_route.model}"
        to_scoped = f"{to_key.id}::{to_route.model}"
        self._tracker.record_fallback(from_scoped, to_scoped, f"{from_route.model} -> {to_route.model}")
