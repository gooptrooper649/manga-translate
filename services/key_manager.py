from __future__ import annotations
import json
import os
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from filelock import FileLock

@dataclass
class ApiKeyEntry:
    id: str              # uuid4
    name: str            # user-assigned custom name
    provider: str        # 'openai' | 'gemini' | 'deepseek'
    api_key: str         # the actual token
    is_active: bool      # whether this key is enabled
    created_at: str      # ISO format datetime string

class KeyManager:
    """Manages API keys stored in a local JSON file."""
    
    def __init__(self, filepath: str = 'data/api_keys.json'):
        self.filepath = filepath
        self.lockpath = f"{filepath}.lock"
        os.makedirs(os.path.dirname(os.path.abspath(self.filepath)), exist_ok=True)
        if not os.path.exists(self.filepath):
            with open(self.filepath, 'w', encoding='utf-8') as f:
                json.dump([], f)

    def _load(self) -> list[ApiKeyEntry]:
        """Reads and parses the JSON file safely."""
        with FileLock(self.lockpath):
            with open(self.filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return [ApiKeyEntry(**item) for item in data]

    def _save(self, keys: list[ApiKeyEntry]):
        """Writes the list back to JSON safely."""
        with FileLock(self.lockpath):
            with open(self.filepath, 'w', encoding='utf-8') as f:
                json.dump([asdict(k) for k in keys], f, indent=4)

    def add_key(self, name: str, provider: str, api_key: str) -> ApiKeyEntry:
        """Creates a new entry with uuid4 id and current timestamp."""
        keys = self._load()
        entry = ApiKeyEntry(
            id=str(uuid.uuid4()),
            name=name,
            provider=provider,
            api_key=api_key,
            is_active=True,
            created_at=datetime.utcnow().isoformat()
        )
        keys.append(entry)
        self._save(keys)
        return entry

    def remove_key(self, key_id: str) -> bool:
        """Removes by id, saves, returns True if found."""
        keys = self._load()
        new_keys = [k for k in keys if k.id != key_id]
        if len(keys) != len(new_keys):
            self._save(new_keys)
            return True
        return False

    def list_keys(self) -> list[ApiKeyEntry]:
        """Returns all keys."""
        return self._load()

    def get_active_keys(self, provider: str | None = None) -> list[ApiKeyEntry]:
        """Returns active keys, optionally filtered by provider."""
        keys = self._load()
        if provider:
            return [k for k in keys if k.is_active and k.provider == provider]
        return [k for k in keys if k.is_active]

    def toggle_active(self, key_id: str) -> bool:
        """Flips is_active, saves, returns new state."""
        keys = self._load()
        for k in keys:
            if k.id == key_id:
                k.is_active = not k.is_active
                self._save(keys)
                return k.is_active
        return False

    def mask_key(self, api_key: str) -> str:
        """Returns first 4 chars + '...' + last 2 chars."""
        if len(api_key) <= 6:
            return "***"
        return f"{api_key[:4]}...{api_key[-2:]}"
