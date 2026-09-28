from __future__ import annotations
import os
import json
from pathlib import Path
from cryptography.fernet import Fernet

KEY_FILE = Path(".secret.key")
DEFAULT_CONFIG_PATH = Path("user_config.json")

def get_or_create_cipher() -> Fernet:
    """Load existing Fernet key or generate and persist a new local secret key."""
    if not KEY_FILE.exists():
        secret_key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(secret_key)
    else:
        with open(KEY_FILE, "rb") as f:
            secret_key = f.read().strip()
    return Fernet(secret_key)

def has_user_config(config_path: str | Path = DEFAULT_CONFIG_PATH) -> bool:
    """Check if the user configuration file exists and has content."""
    path = Path(config_path)
    return path.exists() and path.stat().st_size > 0

def save_encrypted_config(api_key: str, provider: str, config_path: str | Path = DEFAULT_CONFIG_PATH) -> dict:
    """
    Encrypt the API key using Fernet and save it to user_config.json.
    """
    cipher = get_or_create_cipher()
    encrypted_bytes = cipher.encrypt(api_key.strip().encode("utf-8"))
    
    data = {
        "provider": provider.strip(),
        "encrypted_key": encrypted_bytes.decode("utf-8"),
    }
    
    path = Path(config_path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        
    return data

def load_and_decrypt_config(config_path: str | Path = DEFAULT_CONFIG_PATH) -> dict | None:
    """
    Load user_config.json, decrypt the API key, and return a dictionary with
    'provider' and 'api_key'. Returns None if file does not exist or decryption fails.
    """
    path = Path(config_path)
    if not path.exists():
        return None
    
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        encrypted_key_str = data.get("encrypted_key")
        if not encrypted_key_str:
            return None
            
        cipher = get_or_create_cipher()
        decrypted_bytes = cipher.decrypt(encrypted_key_str.encode("utf-8"))
        decrypted_key = decrypted_bytes.decode("utf-8")
        
        return {
            "provider": data.get("provider", "Gemini"),
            "api_key": decrypted_key,
        }
    except Exception as e:
        print(f"[SECURITY ERROR] Failed to decrypt user config: {e}")
        return None

def clear_user_config(config_path: str | Path = DEFAULT_CONFIG_PATH) -> bool:
    """Delete the user configuration file."""
    path = Path(config_path)
    if path.exists():
        path.unlink()
        return True
    return False
