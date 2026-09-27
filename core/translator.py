from __future__ import annotations
from dataclasses import dataclass
import json
import logging
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
import requests
from tenacity import retry, wait_random_exponential, stop_after_attempt, retry_if_exception_type

logger = logging.getLogger(__name__)

# Track context across batches
_CONTEXT_HISTORY: list[str] = []

def extract_series_context(folder_path: Optional[str] = None) -> str:
    """
    Extract series title from folder path for context injection.
    
    Args:
        folder_path: Path to manga folder (e.g., "C:\\Users\\...\\Binchotan v01-04")
    
    Returns:
        Series title for context (e.g., "Binchotan / びんちょうタン")
    """
    if not folder_path:
        return "Unknown manga series"
    
    try:
        folder_name = Path(folder_path).name
        # Extract common patterns like "Binchotan v01-04" -> "Binchotan"
        # Or Japanese names like "びんちょうタン"
        series_name = re.sub(r'\s*[vV]\d+[-–]\d+', '', folder_name)  # Remove volume numbers
        series_name = re.sub(r'\s*\[.*?\]', '', series_name)  # Remove brackets
        series_name = series_name.strip()
        
        if not series_name:
            return "Unknown manga series"
        
        return f"{series_name}"
    except Exception:
        return "Unknown manga series"

def translate_with_omniroute(ocr_blocks, manga_title, api_base_url="http://localhost:20128/v1"):
    """
    Translate using OmniRoute with structured JSON input/output that forces English translation.
    
    Args:
        ocr_blocks: List of OCR blocks with 'id' and 'text' fields
        manga_title: Series title for context
        api_base_url: OmniRoute API base URL
    
    Returns:
        Dictionary mapping IDs to English translations
    """
    # Prepare text blocks mapping so the model returns exact keys
    try:
        input_payload = {str(box["id"]): box["text"] for box in ocr_blocks}
    except KeyError as e:
        print(f"[ERROR] Missing 'id' or 'text' in OCR blocks: {e}")
        raise ValueError(f"OCR blocks must have 'id' and 'text' fields: {e}")
    
    print("--- OCR INPUT (OmniRoute) ---")
    print(input_payload)
    
    system_prompt = (
        f"You are an expert manga localizer translating the series '{manga_title}'. "
        "Your task is to translate the provided Japanese text blocks into natural, emotive, contextual English. "
        "CRITICAL RULES:\n"
        "1. Return ONLY a valid JSON object where every key matches the input key exactly, and the value is the translated English string.\n"
        "2. Do NOT echo back the Japanese text.\n"
        "3. Do not include markdown code blocks like ```json in your response, just return the raw JSON object string."
    )

    try:
        response = requests.post(
            f"{api_base_url}/chat/completions",
            json={
                "model": "auto",  # Or your specific combo/model ID configured in OmniRoute
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(input_payload, ensure_ascii=False)}
                ],
                "temperature": 0.3,
                "stream": False  # Try to force single response instead of streaming
            },
            timeout=30
        )
        
        print(f'[DEBUG] OmniRoute Status: {response.status_code}')
        print(f'[DEBUG] OmniRoute Raw Text: {response.text}')
        
        if response.status_code != 200:
            print(f"[ERROR] OmniRoute returned status: {response.status_code}")
            raise requests.exceptions.HTTPError(f"Status {response.status_code}")

        full_text = ""
        
        # Check if the response is a stream
        if "data: " in response.text:
            for line in response.text.splitlines():
                line = line.strip()
                # Ignore empty lines, metadata footers starting with colon, and the DONE marker
                if not line or line.startswith(":") or line == "data: [DONE]":
                    continue
                    
                if line.startswith("data: "):
                    chunk_str = line[6:] # Strip "data: "
                    try:
                        chunk_json = json.loads(chunk_str)
                        delta = chunk_json.get("choices", [{}])[0].get("delta", {})
                        # Only extract actual content, ignoring reasoning_content
                        if "content" in delta and delta["content"]:
                            full_text += delta["content"]
                    except json.JSONDecodeError:
                        continue
        else:
            # Fallback for standard non-streaming JSON response
            try:
                full_text = response.json()["choices"][0]["message"]["content"]
            except Exception:
                full_text = response.text

        print("--- RAW API RESPONSE (OmniRoute) ---")
        print(full_text)
        
        # Clean the reconstructed string and parse
        cleaned_content = full_text.replace("```json", "").replace("```", "").strip()
        
        print("--- PARSED ENGLISH (OmniRoute) ---")
        print(cleaned_content)
        
        try:
            return json.loads(cleaned_content)
        except json.JSONDecodeError as e:
            print(f"[ERROR] Failed to parse reconstructed JSON: {e}")
            print(f"[ERROR] Cleaned full_text: {cleaned_content}")
            raise
        
    except requests.exceptions.ConnectionError as e:
        print(f"[ERROR] OmniRoute connection failed: {e}")
        print(f"[ERROR] Make sure OmniRoute is running at {api_base_url}")
        raise
    except requests.exceptions.HTTPError as e:
        print(f"[ERROR] OmniRoute HTTP error: {e}")
        print(f"[ERROR] Response: {response.text if 'response' in locals() else 'N/A'}")
        raise
    except requests.exceptions.Timeout as e:
        print(f"[ERROR] OmniRoute request timeout: {e}")
        raise
    except Exception as e:
        print(f"[ERROR] OmniRoute translation failed: {e}")
        raise

def create_optimized_system_prompt(series_context: str = "Unknown manga series") -> str:
    """
    Create optimized system prompt with series context and tone guidance.
    
    Args:
        series_context: Series title for context injection
    
    Returns:
        Optimized system prompt for manga localization
    """
    return f"""CRITICAL: Translate the following Japanese text into English. Do not echo the original Japanese text.

You are an expert manga localizer specializing in Japanese to English translation. 

Series Context: {series_context}

CRITICAL REQUIREMENT:
You MUST translate the Japanese text into English. Do NOT return the original Japanese text. All output must be in English only.

Tone & Persona:
Localize the text into natural, emotive, slice-of-life English that matches the manga's soft/heartwarming tone. Focus on:
- Emotional authenticity over literal accuracy
- Natural character voice and personality
- Cultural nuances that resonate with English readers
- Appropriate level of formality/informality for each character

Translation Rules:
- Keep translations concise and punchy — they must fit in speech bubbles
- Preserve character emotion, intent, and subtext
- Use natural English idioms and expressions; avoid literal translations
- For sound effects (onomatopoeia), use English equivalents that convey the same feeling
- Maintain consistency with character voices throughout the page
- Consider the visual context (speech bubble size, placement) when choosing wording

Input Processing:
You will receive a JSON array of text blocks with:
- 'id': Unique identifier for each block
- 'text': Japanese text to translate
- 'category': Text type (standard_bubble, onomatopoeia, unframed_caption)
- 'coords': Bounding box coordinates (x0, y0, x1, y1)

Output Format:
Return a STRICT JSON object where the keys are the text block IDs, and the values are the localized English translations.
The response must be valid JSON only - no Markdown formatting, no code blocks, no additional text.

Example output:
{{
  "0": "Good morning!",
  "1": "Thank you!",
  "2": "See you tomorrow!"
}}

IMPORTANT:
- Return ONLY the JSON object
- Do NOT include any Markdown formatting (no ```json or ```)
- Do NOT include any explanatory text
- Ensure all values are English translations, not Japanese text
- Use the exact IDs from the input as keys"""

def cleanup_japanese_artifacts(blocks: List[dict]) -> List[dict]:
    """
    Filter out non-Japanese artifacts like barcodes, numbers, and noise.
    
    Relaxed to allow punctuation-only text (e.g., "．．．", "！") to pass through
    for translation/rendering instead of being discarded.
    
    Args:
        blocks: List of text blocks with 'text' field
    
    Returns:
        Filtered list of blocks containing text (including punctuation)
    """
    japanese_pattern = re.compile(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F]')
    barcode_pattern = re.compile(r'^[\d\s\-xX]+|ISBN[\d\s\-xX]+$')  # Barcode-like patterns including ISBN
    number_pattern = re.compile(r'^\d+$')  # Pure numbers
    # Comprehensive punctuation pattern for Japanese and English punctuation, ellipses, sound effects
    # Includes: Japanese punctuation (！？…―・), English punctuation (.!?), and common manga symbols
    punctuation_pattern = re.compile(r'^[\u3000-\u303F\uFF01-\uFF5E\u2000-\u206F\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\s\.!?，。！？…―・]+$')
    
    filtered_blocks = []
    for block in blocks:
        text = block.get('text', '').strip()
        
        # Skip empty text
        if not text:
            print(f"[CLEANUP] Skipping empty text")
            continue
        
        # Skip barcode-like patterns
        if barcode_pattern.match(text):
            print(f"[CLEANUP] Skipping barcode pattern: {text}")
            continue
        
        # Skip pure numbers
        if number_pattern.match(text):
            print(f"[CLEANUP] Skipping pure number: {text}")
            continue
        
        # Allow punctuation-only text (e.g., "．．．", "！", "...")
        # This is important for manga sound effects and emotional indicators
        if punctuation_pattern.match(text):
            print(f"[CLEANUP] Keeping punctuation-only text: {text}")
            filtered_blocks.append(block)
            continue
        
        # Keep blocks with Japanese characters or meaningful content
        if japanese_pattern.search(text) or len(text) > 0:
            print(f"[CLEANUP] Keeping text with Japanese/meaningful content: {text}")
            filtered_blocks.append(block)
    
    print(f"[CLEANUP] Original blocks: {len(blocks)}, Filtered blocks: {len(filtered_blocks)}")
    return filtered_blocks

def sort_japanese_reading_order(blocks: List[dict]) -> List[dict]:
    """
    Sort text blocks in Japanese reading order (top-to-bottom, right-to-left).
    
    Args:
        blocks: List of text blocks with 'coords' field [(x0, y0, x1, y1)]
    
    Returns:
        Sorted list of blocks in Japanese reading order
    """
    def reading_order_key(block):
        coords = block.get('coords', (0, 0, 0, 0))
        if isinstance(coords, (list, tuple)) and len(coords) >= 4:
            x0, y0, x1, y1 = coords[:4]
        else:
            x0, y0, x1, y1 = 0, 0, 0, 0
        
        # Japanese reading order: top-to-bottom, right-to-left
        # Use y-coordinate as primary sort (top to bottom)
        # Use negative x-coordinate as secondary sort (right to left)
        tolerance = 50  # Tolerance for same row
        
        return (y0 // tolerance, -x1)
    
    return sorted(blocks, key=reading_order_key)

@dataclass
class TranslatedRegion:
    bbox: 'BoundingBox'  # from core.detector
    original_text: str
    translated_text: str

def _strip_markdown_json(text: str) -> str:
    """
    Strip Markdown formatting from JSON response.
    
    Args:
        text: Raw response text that may contain Markdown
    
    Returns:
        Clean JSON string without Markdown formatting
    """
    # Find JSON content within markdown code blocks
    if '```json' in text:
        # Extract content between ```json and ```
        start = text.find('```json') + 7
        end = text.find('```', start)
        if end != -1:
            text = text[start:end].strip()
    elif '```' in text:
        # Extract content between first ``` and last ```
        start = text.find('```') + 3
        end = text.rfind('```')
        if end != -1:
            text = text[start:end].strip()
    
    # Remove any remaining markdown formatting
    text = text.replace('```json', '').replace('```', '').strip()
    
    # Try to extract JSON if there's other text around it
    # Look for patterns like { ... } or [ ... ]
    import re
    json_pattern = r'(\{.*\}|\[.*\])'
    match = re.search(json_pattern, text, re.DOTALL)
    if match:
        text = match.group(1).strip()
    
    return text

def _call_openai_compatible(api_key: str, model: str, blocks: list[dict], 
                            system_prompt: str, base_url: str | None = None) -> list[dict]:
    """Call OpenAI API (or DeepSeek via compatible endpoint) for translation."""
    from openai import OpenAI
    
    # Log OCR input
    print("--- OCR INPUT ---")
    print([block.get('text', '') for block in blocks])
    
    kwargs = {'api_key': api_key}
    if base_url:
        kwargs['base_url'] = base_url
        
    client = OpenAI(**kwargs)
    
    context_str = "Context (Previous Dialogue):\n" + "\n".join(_CONTEXT_HISTORY[-10:]) if _CONTEXT_HISTORY else "No previous context."
    
    response = client.chat.completions.create(
        model=model,
        messages=[
            {'role': 'system', 'content': f"{system_prompt}\n\n{context_str}"},
            {'role': 'user', 'content': json.dumps(blocks, ensure_ascii=False)}
        ],
        temperature=0.3,
        response_format={'type': 'json_object'}
    )
    content = response.choices[0].message.content
    
    # Log raw API response
    print("--- RAW API RESPONSE ---")
    print(content)
    
    # Strip Markdown formatting before parsing
    content = _strip_markdown_json(content)
    
    # Parse the JSON response
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing failed: {e}")
        logger.error(f"Response content: {content}")
        print(f"[ERROR] JSON parsing failed: {e}")
        print(f"[ERROR] Response content: {content}")
        raise
    
    # Log parsed English translations
    print("--- PARSED ENGLISH ---")
    print(parsed)
    
    if isinstance(parsed, list):
        return parsed
    for v in parsed.values():
        if isinstance(v, list):
            return v
    return [str(parsed)]

def _call_gemini(api_key: str, model: str, blocks: list[dict], system_prompt: str) -> list[dict]:
    """Call Google Gemini API for translation."""
    from google import genai
    client = genai.Client(api_key=api_key)
    
    # Log OCR input
    print("--- OCR INPUT ---")
    print([block.get('text', '') for block in blocks])
    
    context_str = "Context (Previous Dialogue):\n" + "\n".join(_CONTEXT_HISTORY[-10:]) if _CONTEXT_HISTORY else "No previous context."
    
    prompt = f"{system_prompt}\n\n{context_str}\n\nInput:\n{json.dumps(blocks, ensure_ascii=False)}\n\nOutput (JSON object only, no Markdown):"
    response = client.models.generate_content(
        model=model,
        contents=prompt,
    )
    
    text = response.text.strip()
    
    # Log raw API response
    print("--- RAW API RESPONSE ---")
    print(text)
    
    # Strip Markdown formatting before parsing
    text = _strip_markdown_json(text)
    
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing failed for Gemini: {e}")
        logger.error(f"Response content: {text}")
        print(f"[ERROR] JSON parsing failed: {e}")
        print(f"[ERROR] Response content: {text}")
        raise
    
    # Log parsed English translations
    print("--- PARSED ENGLISH ---")
    print(parsed)
    
    if isinstance(parsed, list):
        return parsed
    for v in parsed.values():
        if isinstance(v, list):
            return v
    return [str(parsed)]

def translate_batch(
    blocks: list[dict] | list[str],
    token_router: 'TokenRouter',
    series_context: Optional[str] = None,
    folder_path: Optional[str] = None,
    use_omniroute: bool = True,
    omniroute_url: str = "http://localhost:20128/v1",
    **kwargs
) -> list[str]:
    """
    Translates a batch of Japanese text segments to English using OmniRoute or traditional API.
    
    Enhanced Features:
    - OmniRoute structured JSON input/output for forced English translation
    - Full-page batching with Japanese reading order sorting
    - Series context extraction from folder names
    - Explicit key-value mapping to prevent Japanese echo
    - Automatic cleanup of non-Japanese artifacts
    
    Args:
        blocks: List of text blocks (dict with 'text', 'category', 'coords') or list of strings
        token_router: TokenRouter instance for API key management
        series_context: Optional series title for context injection
        folder_path: Optional folder path for automatic series context extraction
        use_omniroute: Whether to use OmniRoute (default: True)
        omniroute_url: OmniRoute API base URL
        **kwargs: Additional parameters
    
    Returns:
        List of translated strings (same length as input)
    """
    if not blocks:
        return []

    # Extract series context if not provided
    if not series_context and folder_path:
        series_context = extract_series_context(folder_path)
    elif not series_context:
        series_context = "Unknown manga series"

    # Convert list[str] to list[dict] if needed
    if isinstance(blocks[0], str):
        blocks = [{"text": t, "category": "unknown", "coords": (0, 0, 0, 0)} for t in blocks]

    # Add IDs to blocks for mapping
    for i, block in enumerate(blocks):
        if 'id' not in block:
            block['id'] = i

    # Cleanup non-Japanese artifacts
    original_blocks = blocks.copy()
    blocks = cleanup_japanese_artifacts(blocks)
    
    if not blocks:
        logger.warning("No valid text found after cleanup (including punctuation)")
        return ['[No text detected]'] * len(original_blocks)

    # Sort in Japanese reading order (top-to-bottom, right-to-left)
    blocks = sort_japanese_reading_order(blocks)

    # Use OmniRoute if enabled and available
    if use_omniroute:
        try:
            print(f"[TRANSLATION] Using OmniRoute for {len(blocks)} blocks")
            print(f"[TRANSLATION] Series context: {series_context}")
            
            # Use OmniRoute structured translation
            translations_dict = translate_with_omniroute(blocks, series_context, omniroute_url)
            
            # Map results back to original order
            final_results = []
            for original_block in original_blocks:
                original_id = original_block.get('id')
                if original_id in translations_dict:
                    final_results.append(translations_dict[original_id])
                elif str(original_id) in translations_dict:
                    final_results.append(translations_dict[str(original_id)])
                else:
                    final_results.append('[translation missing]')
            
            print(f"[TRANSLATION] OmniRoute translation complete: {len(final_results)} results")
            return final_results[:len(original_blocks)]
            
        except Exception as e:
            print(f"[WARNING] OmniRoute failed: {e}, falling back to traditional API")
            logger.warning(f"OmniRoute translation failed: {e}, falling back to traditional API")
            # Continue to traditional API fallback

    # Fallback to traditional API translation
    print(f"[TRANSLATION] Using traditional API for {len(blocks)} blocks")
    
    # Create optimized system prompt
    system_prompt = create_optimized_system_prompt(series_context)

    # Get initial route
    key_entry, route = token_router.get_next_route()
    if not key_entry:
        logger.error('No active API keys available for translation.')
        return ['[Translation failed: No active keys]'] * len(original_blocks)

    last_error = None
    
    # Max attempts equals the number of possible routes in the hierarchy (fallback)
    for attempt in range(len(token_router.HIERARCHY)):
        try:
            if route.provider == 'gemini':
                result = _call_gemini(key_entry.api_key, route.model, blocks, system_prompt)
            elif route.provider == 'deepseek':
                # DeepSeek uses an OpenAI-compatible endpoint
                result = _call_openai_compatible(
                    key_entry.api_key, 
                    route.model, 
                    blocks, 
                    system_prompt,
                    base_url="https://api.deepseek.com/v1"
                )
            elif route.provider == 'openai':
                result = _call_openai_compatible(key_entry.api_key, route.model, blocks, system_prompt)
            else:
                raise ValueError(f'Unknown provider: {route.provider}')
            
            # Handle different response formats
            # New format: JSON object with IDs as keys
            if isinstance(result, dict):
                # Map IDs to translations
                id_to_translation = {}
                for key, value in result.items():
                    try:
                        # Handle both string and integer keys
                        block_id = int(key) if key.isdigit() else key
                        id_to_translation[block_id] = str(value)
                    except (ValueError, AttributeError):
                        continue
                
                # Reconstruct results in original order
                final_results = []
                for original_block in original_blocks:
                    original_id = original_block.get('id')
                    if original_id in id_to_translation:
                        final_results.append(id_to_translation[original_id])
                    else:
                        final_results.append('[translation missing]')
                
                translated_texts = final_results
            
            # Legacy format: JSON array with objects
            elif isinstance(result, list):
                # Extract translated texts from structured response
                translated_texts = []
                for item in result:
                    if isinstance(item, dict):
                        translated_texts.append(item.get('translated_text', str(item)))
                    else:
                        translated_texts.append(str(item))
                
                # Map results back to original order
                id_to_translation = {}
                for item, translated in zip(result, translated_texts):
                    if isinstance(item, dict):
                        item_id = item.get('id')
                        if item_id is not None:
                            id_to_translation[item_id] = translated
                
                # Reconstruct results in original order
                final_results = []
                for original_block in original_blocks:
                    original_id = original_block.get('id')
                    if original_id in id_to_translation:
                        final_results.append(id_to_translation[original_id])
                    else:
                        final_results.append('[translation missing]')
                
                translated_texts = final_results
            else:
                # Fallback for unexpected format
                translated_texts = [str(result)] * len(original_blocks)
            
            # Estimate tokens
            est_tokens = sum(len(b['text']) for b in blocks) // 4 + sum(len(t) for t in translated_texts) // 4
            token_router.report_success(key_entry, route, est_tokens)
            
            # Update context history with successful translations
            for b, translated in zip(blocks, translated_texts):
                _CONTEXT_HISTORY.append(f"{b['text']} ({b.get('category', '')}) -> {translated}")
            if len(_CONTEXT_HISTORY) > 100:
                _CONTEXT_HISTORY[:] = _CONTEXT_HISTORY[-20:]
            
            return translated_texts[:len(original_blocks)]
            
        except Exception as e:
            error_str = str(e).lower()
            is_rate_limit = (
                '429' in error_str or
                'rate' in error_str or
                'quota' in error_str or
                'resource_exhausted' in error_str
            )
            
            if is_rate_limit:
                logger.warning(f'Rate limit hit on {route.model} using key {key_entry.name}: {e}')
                print(f"[RATE LIMIT] {route.model} using key {key_entry.name}: {e}")
                token_router.report_rate_limit(key_entry, route, cooldown_seconds=60.0)
                
                # Get next route to fallback to
                next_key, next_route = token_router.get_next_route()
                
                if next_key and next_route:
                    token_router.report_fallback(key_entry, route, next_key, next_route)
                    key_entry = next_key
                    route = next_route
                    last_error = e
                    continue
                else:
                    logger.error("Rate limit hit and no fallback routes available.")
                    print("[ERROR] Rate limit hit and no fallback routes available.")
                    break
            else:
                logger.error(f'API error on {route.model}: {e}')
                print(f"[ERROR] API error on {route.model}: {e}")
                print(f"[ERROR] Error type: {type(e).__name__}")
                print(f"[ERROR] Error details: {str(e)}")
                last_error = e
                # Do NOT silently fallback - raise the exception
                raise
    
    # If we get here, all attempts failed
    error_msg = f'[Translation failed: {type(last_error).__name__}]'
    print(f"[ERROR] All translation attempts failed: {error_msg}")
    raise Exception(f"Translation failed after all attempts: {error_msg}")
