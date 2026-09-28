"""Batch translation engine with Gemini API optimization.

Combines all OCR strings from a single manga page into one JSON dictionary:
    {"0": "Japanese text 1", "1": "Japanese text 2"}
and sends this single payload to the Gemini API, requesting a translated JSON
dictionary in return to minimize latency and maximize throughput.
"""
from __future__ import annotations
import json
import os
import re
from typing import Dict, Tuple, Optional
from core.security import load_and_decrypt_config

DEFAULT_MODEL = "gemini-2.5-flash"

def get_effective_api_key(api_key: Optional[str] = None) -> Optional[str]:
    """Retrieve API key from argument, encrypted config, or environment."""
    if api_key and api_key.strip():
        return api_key.strip()
    
    cfg = load_and_decrypt_config()
    if cfg and cfg.get("api_key"):
        return cfg["api_key"].strip()
        
    env_key = os.environ.get("GEMINI_API_KEY", "")
    if env_key.strip():
        return env_key.strip()
        
    return None

def translate_page_batch(
    ocr_dict: Dict[str, str],
    series_context: str = "Manga Series",
    target_language: str = "English",
    api_key: Optional[str] = None,
    model: str = DEFAULT_MODEL
) -> Tuple[Dict[str, str], int]:
    """
    Batch API Optimization:
    Translates all OCR text boxes for a single manga page in ONE single API request.

    Args:
        ocr_dict: Dict mapping box IDs to original Japanese OCR strings.
                  e.g. {"0": "おはよう！", "1": "一緒に学校に行こうよ。"}
        series_context: Manga title, premise, or character tone.
        target_language: Desired language (English, Spanish, etc.).
        api_key: Optional Gemini API key (defaults to encrypted local config).
        model: Model identifier (default: gemini-2.5-flash).

    Returns:
        (translated_dict, tokens_used)
        e.g. ({"0": "Good morning!", "1": "Let's walk to school together."}, 185)
    """
    if not ocr_dict:
        return {}, 0

    key = get_effective_api_key(api_key)

    # If no API key or demo environment, return localized simulation
    if not key or "DemoKey" in key or "AIzaSyDemo" in key:
        simulated: Dict[str, str] = {}
        for k, jp_text in ocr_dict.items():
            if "おはよう" in jp_text:
                simulated[k] = "Good morning! Beautiful weather today."
            elif "学校" in jp_text or "行こう" in jp_text:
                simulated[k] = "Totally! Let's walk to school together."
            elif "遅刻" in jp_text:
                simulated[k] = "Yeah, let's hurry so we aren't late!"
            elif "何" in jp_text:
                simulated[k] = "What...?! No way!"
            elif "ありがとう" in jp_text:
                simulated[k] = "Thank you so much!"
            else:
                simulated[k] = f"[Localized {target_language}]: {jp_text}"
        return simulated, 220

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=key)

        prompt = f"""You are an expert manga localization editor translating Japanese manga dialogue into natural, emotive {target_language}.

Series Context: "{series_context}"
Target Language: "{targetLanguage}"

CRITICAL INSTRUCTIONS:
1. Below is a JSON dictionary containing all detected dialogue bubbles, floating text, and SFX from a single manga page.
2. The keys are string indexes representing speech bubble IDs: "0", "1", "2"...
3. Translate EVERY entry into fluent, high-quality, comic-style {target_language} that fits speech balloons.
4. For sound effects or floating un-bubbled onomatopoeia, format them appropriately (e.g. *RUMBLE*, *GASP*, *WHOOSH*).
5. Preserve emotional nuances, casual speech, and honorific context when suitable.
6. Return a JSON dictionary with the EXACT SAME keys, containing the translated strings.

INPUT OCR DICTIONARY:
{json.dumps(ocr_dict, ensure_ascii=False, indent=2)}

Return ONLY valid JSON matching this schema:
{{
  "0": "Localized string for box 0",
  "1": "Localized string for box 1"
}}
"""
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )
        )

        raw_text = response.text or "{}"
        clean_text = raw_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()

        parsed: Dict[str, str] = {}
        try:
            parsed_raw = json.loads(clean_text)
            if isinstance(parsed_raw, dict):
                # Ensure all values are strings
                for k, v in parsed_raw.items():
                    parsed[str(k)] = str(v)
            else:
                raise ValueError("Parsed result is not a dict")
        except Exception:
            # Fallback JSON extraction
            match = re.search(r"\{[\s\S]*\}", clean_text)
            if match:
                raw_dict = json.loads(match.group(0))
                for k, v in raw_dict.items():
                    parsed[str(k)] = str(v)

        # Translation Fallback Cache: ensure all original keys exist, fallback to [Draft: OCR Text] if missing
        for k, raw_jp in ocr_dict.items():
            if k not in parsed or not parsed[k].strip():
                parsed[k] = f"[Draft: {raw_jp}]"

        est_tokens = max(100, int(len(clean_text) / 4) + 150)
        return parsed, est_tokens

    except Exception as e:
        print(f"[TRANSLATOR ERROR] Batch translation failed: {e}")
        # Translation Fallback Cache:
        # Save raw OCR text as [Draft: OCR Text] if the API rate-limits the user or fails.
        # This guarantees the user gets a readable output (even if untranslated) rather than a crashed application.
        fallback_draft_dict = {k: f"[Draft: {raw_jp}]" for k, raw_jp in ocr_dict.items()}
        return fallback_draft_dict, 0
