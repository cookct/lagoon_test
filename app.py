"""
Lagoon V1 - Chat Application
Main entry point.
"""
import os
import logging
from flask import Flask, render_template, send_from_directory, make_response
from flask_socketio import SocketIO

from config import CHATS_DIR, CONFIG_DIR, MODEL_AVATARS_DIR, MAX_CONTENT_LENGTH

# --- Flask App Initialization ---
app = Flask(__name__, template_folder='.')
# Console logging only (no file output)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s: %(message)s'
)
app.logger.setLevel(logging.INFO)
logging.getLogger('httpx').setLevel(logging.WARNING)
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
app.config['SECRET_KEY'] = 'lagoon-secret-key'
app.config['TEMPLATES_AUTO_RELOAD'] = True  # Disable template caching

# --- SocketIO for Gemini Live ---
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- Register Blueprints ---
from routes import configs_bp, chats_bp, system_prompts_bp, files_bp, chat_bp, macros_bp, models_bp, anchors_bp, custom_endpoints_bp
from services import installed_models as _im; _im.load()  # seed installed_models.json if missing

app.register_blueprint(configs_bp)
app.register_blueprint(chats_bp)
app.register_blueprint(system_prompts_bp)
app.register_blueprint(files_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(macros_bp)
app.register_blueprint(models_bp)
app.register_blueprint(anchors_bp)
app.register_blueprint(custom_endpoints_bp)

# --- Register Gemini Live Socket.IO handlers ---
from routes.gemini_live import register_gemini_live
print("[App] Registering Gemini Live handlers...", flush=True)
register_gemini_live(socketio)
print("[App] Gemini Live handlers registered", flush=True)


# --- Frontend Routes ---
@app.route('/')
def index():
    response = make_response(render_template('index.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/images/<path:filename>')
def serve_images(filename):
    return send_from_directory('images', filename)


@app.route('/<path:filename>')
def serve_static_files(filename):
    response = send_from_directory('.', filename)
    # No caching for JS/HTML files during development
    if filename.endswith('.js') or filename.endswith('.html'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


# --- Main Entry Point ---
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Lagoon')
    parser.add_argument('--port', type=int, default=5007, help='Port to listen on (default: 5007)')
    args = parser.parse_args()

    for directory in [CHATS_DIR, CONFIG_DIR, MODEL_AVATARS_DIR]:
        if not os.path.exists(directory):
            os.makedirs(directory)

    # Check for SSL certificates for HTTPS (required for microphone access)
    cert_file = os.path.join(os.path.dirname(__file__), 'cert.pem')
    key_file = os.path.join(os.path.dirname(__file__), 'key.pem')

    if os.path.exists(cert_file) and os.path.exists(key_file):
        print(f"Starting HTTPS server on https://0.0.0.0:{args.port}")
        print("Note: Accept the self-signed certificate warning in your browser")
        socketio.run(
            app,
            host='0.0.0.0',
            port=args.port,
            debug=False,  # Disable debug for better SSL websocket handling
            allow_unsafe_werkzeug=True,
            ssl_context=(cert_file, key_file)
        )
    else:
        print("SSL certificates not found. Running HTTP server (mic access won't work on mobile).")
        print("Run 'python generate_certs.py' to generate certificates for HTTPS.")
        socketio.run(
            app,
            host='0.0.0.0',
            port=args.port,
            debug=False,
            allow_unsafe_werkzeug=True
        )
