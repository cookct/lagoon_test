"""
File Routes
Handles file uploads, parsing, and avatar management.
"""
import os
import io
import base64
import logging
from flask import Blueprint, request, jsonify

from config import MODEL_AVATARS_DIR, MODELS_CACHE_DIR

logger = logging.getLogger(__name__)

os.makedirs(MODELS_CACHE_DIR, exist_ok=True)

try:
    import PyPDF2
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False

try:
    from PIL import Image, ImageFilter, ImageEnhance
    PIL_SUPPORT = True
except ImportError:
    PIL_SUPPORT = False

files_bp = Blueprint('files', __name__)


@files_bp.route('/api/parse_file', methods=['POST'])
def parse_file():
    """Parse uploaded PDF or TXT file and return text content."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    filename = file.filename.lower()

    try:
        if filename.endswith('.txt'):
            content = file.read().decode('utf-8')
            return jsonify({"content": content})
        elif filename.endswith('.pdf'):
            if not PDF_SUPPORT:
                return jsonify({"error": "PDF support not installed. Run: pip install PyPDF2"}), 500

            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file.read()))
            num_pages = len(pdf_reader.pages)
            logger.info(f"Parsing PDF: {filename} ({num_pages} pages)")

            MAX_PAGES = 50
            if num_pages > MAX_PAGES:
                logger.warning(f"PDF too large ({num_pages} pages), truncating to {MAX_PAGES}")

            text_content = []
            for i in range(min(num_pages, MAX_PAGES)):
                page = pdf_reader.pages[i]
                text_content.append(page.extract_text() or '')

            content = '\n\n'.join(text_content)
            if num_pages > MAX_PAGES:
                content += f"\n\n[... PDF truncated at {MAX_PAGES} pages for performance ...]"

            return jsonify({"content": content})
        else:
            return jsonify({"error": "Unsupported file type. Use PDF or TXT."}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 500


@files_bp.route('/api/model_avatars', methods=['GET'])
def get_model_avatars():
    """Returns a list of available model avatar filenames."""
    if not os.path.exists(MODEL_AVATARS_DIR):
        return jsonify([])
    allowed_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')
    avatars = sorted([f for f in os.listdir(MODEL_AVATARS_DIR) if f.lower().endswith(allowed_extensions)])
    return jsonify(avatars)


@files_bp.route('/api/upload_avatar', methods=['POST'])
def upload_avatar():
    """Upload and optimize avatar image for crisp display at small sizes."""
    if 'avatar' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    allowed_ext = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    if not (file and '.' in file.filename and file.filename.rsplit('.', 1)[1].lower() in allowed_ext):
        return jsonify({"error": "File type not allowed"}), 400

    try:
        image_data = file.read()

        if PIL_SUPPORT:
            img = Image.open(io.BytesIO(image_data))

            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGBA')
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            width, height = img.size
            min_dim = min(width, height)
            left = (width - min_dim) // 2
            top = (height - min_dim) // 2
            img = img.crop((left, top, left + min_dim, top + min_dim))

            img = img.resize((256, 256), Image.LANCZOS)
            img = img.filter(ImageFilter.UnsharpMask(radius=0.5, percent=80, threshold=2))
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.05)

            output = io.BytesIO()
            img.save(output, format='PNG', optimize=True)
            image_data = output.getvalue()
            mimetype = 'image/png'
        else:
            mimetype = file.mimetype

        data_uri = f"data:{mimetype};base64,{base64.b64encode(image_data).decode('utf-8')}"
        return jsonify({"success": True, "path": data_uri})
    except Exception as e:
        return jsonify({"error": f"Could not process image: {str(e)}"}), 500
