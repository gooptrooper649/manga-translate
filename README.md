# Manga Translator

A comprehensive manga translation system that uses advanced AI to detect, recognize, translate, and compose manga pages from Japanese to English.

## Features

### 🎯 **Advanced Text Detection**
- **Multiple Detection Backends**:
  - OpenCV morphological detection (fast, CPU-based)
  - DBNet deep learning model (accurate, requires model download)
  - Comic-text-detector (specialized for comics)
- **Smart Filtering**: Removes barcodes, metadata, and non-text artifacts
- **Line Merging**: Automatically merges adjacent vertical text boxes
- **Debug Visualization**: Green bounding boxes for verified text blocks

### 🧠 **Intelligent Translation**
- **Full-Page Batching**: Processes entire pages in single API calls for better context
- **Series Context Extraction**: Automatically detects manga series from folder names
- **Optimized Prompts**: Series-specific tone guidance for natural localization
- **Japanese Reading Order**: Sorts text top-to-bottom, right-to-left
- **Artifact Cleanup**: Filters out non-Japanese text before translation

### 🌐 **Multi-Provider Support**
- **Gemini Flash**: Google's fast AI model
- **DeepSeek**: OpenAI-compatible Chinese AI
- **OpenAI**: GPT models with custom endpoints
- **Smart Routing**: Automatic fallback between providers
- **Rate Limit Handling**: Built-in cooldown and retry logic

### 🎨 **Text Composition**
- **Speech Bubble Detection**: Categorizes text regions (bubbles, onomatopoeia, captions)
- **Text Inpainting**: Removes original Japanese text
- **Translation Rendering**: Places English text in appropriate locations
- **Style Preservation**: Maintains original manga aesthetics

## Installation

### Prerequisites
- Python 3.10 or higher
- pip package manager

### Setup

1. **Clone or download this repository**

2. **Create virtual environment**:
```bash
python -m venv .venv
.venv\Scripts\activate  # On Windows
# or
source .venv/bin/activate  # On Linux/Mac
```

3. **Install dependencies**:
```bash
pip install -r requirements.txt
```

4. **Run the application**:
```bash
streamlit run app.py
```

Or use the provided batch file:
```bash
run_manga_translator.bat
```

## Usage

### First-Time Setup

1. **Open the application** (http://localhost:8501)
2. **Navigate to API Keys page**
3. **Add your API keys**:
   - Gemini API key (for Google models)
   - DeepSeek API key (for Chinese models)
   - OpenAI API key (for GPT models)

### Translating Manga

1. **Upload & Translate Page**:
   - Upload individual manga pages (PNG, JPG, WEBP)
   - Or upload a ZIP archive containing multiple pages
   - Select detection method (OpenCV, DBNet, or CTD)
   - Click "Translate All"

2. **View Results**:
   - Check the "Manga Reader" page to view translated pages
   - Compare original and translated versions side-by-side

3. **Monitor Usage**:
   - Use "Token Tracker" to monitor API usage and costs
   - View routing logs and fallback events

### Detection Methods

- **OpenCV** (Default): Fast, CPU-based morphological detection
  - Best for: Quick processing, limited resources
  - Speed: Very fast
  - Accuracy: Good for standard manga

- **DBNet**: Deep learning model with high accuracy
  - Best for: Complex layouts, challenging text
  - Speed: Moderate (requires model download)
  - Accuracy: Excellent

- **CTD**: Comic-text-detector specialized for comics
  - Best for: Western comics, specialized layouts
  - Speed: Moderate (requires model download)
  - Accuracy: Very good for comics

## Configuration

### API Keys

Add your API keys in the "API Keys" page:
- **Gemini**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
- **DeepSeek**: Get from [DeepSeek Platform](https://platform.deepseek.com/api_keys)
- **OpenAI**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)

### Detection Settings

Adjust detection parameters:
- **Confidence Threshold**: Lower values detect more text (default: 0.3)
- **Padding**: Pixel padding around text regions (default: 10)
- **Backend**: Choose detection method based on your needs

### Translation Settings

Customize translation behavior:
- **Series Context**: Automatically extracted from folder names
- **Tone Guidance**: Soft/heartwarming for slice-of-life manga
- **Language**: Japanese to English (can be extended)

## Project Structure

```
manga-translate/
├── app.py                    # Main Streamlit application
├── requirements.txt          # Python dependencies
├── core/
│   ├── detector.py          # Text detection module
│   ├── ocr.py               # OCR recognition module
│   ├── translator.py        # Translation engine
│   ├── composer.py          # Text composition module
│   └── engine.py            # Batch processing engine
├── services/
│   ├── key_manager.py       # API key management
│   ├── token_router.py      # Smart routing between providers
│   └── usage_tracker.py     # Usage and cost tracking
├── views/
│   ├── upload.py            # Upload & translate interface
│   ├── reader.py            # Manga reader interface
│   ├── tracker.py           # Token tracking interface
│   └── api_keys.py          # API key management interface
├── models/                  # Downloaded AI models (auto-created)
├── data/                    # Translated pages storage
└── run_manga_translator.bat # Quick launcher
```

## Advanced Features

### Series Context Extraction

The system automatically extracts series names from folder paths:
- `Binchotan v01-04` → `Binchotan`
- `One Piece v01-10` → `One Piece`
- `Naruto Shippuden` → `Naruto Shippuden`

This context is injected into translation prompts for better localization.

### Smart Routing

The token router automatically:
- Selects the best available API key
- Handles rate limits with cooldown periods
- Falls back to alternative providers
- Tracks usage and costs per provider

### Artifact Cleanup

Automatic filtering of:
- Barcode patterns (ISBNs, product codes)
- Pure numbers and metadata
- Non-Japanese text artifacts
- Empty or meaningless content

### Debug Visualization

Detection process creates debug images:
- `debug_boxes.jpg` - Shows detected text regions
- Green boxes indicate merged text blocks
- Category labels show text types
- Useful for troubleshooting detection issues

## Troubleshooting

### No Text Detected

1. **Lower confidence threshold** in detection settings
2. **Try different detection backend** (DBNet for better accuracy)
3. **Check debug image** to see what's being detected
4. **Ensure images are high quality** and clear

### Translation Failures

1. **Check API keys** are valid and active
2. **Verify API quotas** haven't been exceeded
3. **Check token tracker** for rate limit events
4. **Try alternative provider** if one is rate-limited

### Model Download Issues

1. **Ensure stable internet connection**
2. **Check models folder** has write permissions
3. **Manually download models** if automatic download fails
4. **Use OpenCV backend** as fallback

### Performance Issues

1. **Use OpenCV backend** for faster processing
2. **Reduce image resolution** if processing large batches
3. **Close other applications** to free resources
4. **Consider GPU acceleration** if available

## API Reference

### Text Detection

```python
from core.detector import get_detector

# Initialize detector
detector = get_detector(backend='opencv', confidence_threshold=0.3)

# Detect text regions
bboxes = detector.detect(image)
```

### Translation

```python
from core.translator import translate_batch

# Translate text blocks
translated_texts = translate_batch(
    japanese_blocks, 
    token_router, 
    series_context="Binchotan"
)
```

### Batch Processing

```python
from core.engine import process_archive

# Process entire ZIP archive
processed_paths = process_archive(
    zip_file, 
    token_router, 
    detector_backend='opencv'
)
```

## Contributing

Contributions are welcome! Areas for improvement:
- Additional OCR languages
- More detection backends
- Enhanced composition algorithms
- Additional translation providers
- UI/UX improvements

## License

This project is provided as-is for manga translation purposes. Please respect the original manga creators' copyrights and use this tool responsibly.

## Acknowledgments

- **manga-ocr**: Japanese OCR recognition
- **manga-image-translator**: DBNet detection model
- **comic-text-detector**: Comic text detection
- **Streamlit**: Web application framework
- **OpenAI/DeepSeek/Gemini**: Translation API providers

## Support

For issues, questions, or suggestions:
- Check the troubleshooting section
- Review debug images for detection issues
- Monitor token tracker for API problems
- Ensure all dependencies are properly installed

## Version History

- **v1.0**: Initial release with basic translation pipeline
- **v1.1**: Added deep learning detection backends
- **v1.2**: Enhanced translation with series context
- **v1.3**: Improved artifact cleanup and filtering
- **v1.4**: Added smart routing and rate limit handling

---

**Note**: This tool is designed for personal manga translation and study. Always support official releases when available.