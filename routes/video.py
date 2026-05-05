"""
Video Routes
Handles Venice video generation requests.

Venice API contract (see Venice_Video_Generation.txt):
  POST /video/queue     -> {model, queue_id, [download_url]}
  POST /video/retrieve  -> JSON (processing/timing) OR video/mp4 binary
  POST /video/complete  -> cleanup
"""
import logging
import os
import subprocess
import uuid
import requests
from flask import Blueprint, request, jsonify, send_from_directory
from config import VENICE_API_BASE
from services.storage import get_api_key

logger = logging.getLogger(__name__)

# Optional: import the balance event emitter from chat if available
try:
    from routes.chat import emit_balance_event
except ImportError:
    emit_balance_event = None
video_bp = Blueprint('video', __name__)

VIDEO_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'video_cache')
os.makedirs(VIDEO_CACHE_DIR, exist_ok=True)


@video_bp.route('/api/video/queue', methods=['POST'])
def queue_video():
    data = request.json or {}
    api_key = get_api_key()
    if not api_key:
        return jsonify({"success": False, "error": "Venice API key not found"}), 401

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    # Log headers (mask API key)
    safe_headers = {k: '***MASKED***' if 'Authorization' in k else v for k, v in headers.items()}
    logger.info(f"[Video] Headers: {safe_headers}")
    try:
        url = f"{VENICE_API_BASE}/video/queue"
        logger.info(f"[Video] Queue -> {url} model={data.get('model')}")
        resp = requests.post(url, json=data, headers=headers, timeout=60)
        
        # Extract balance from response headers
        balance_usd = resp.headers.get('x-venice-balance-usd')
        
        if resp.status_code == 200:
            result = resp.json()
            # Include balance in response for frontend to persist
            if balance_usd:
                result['_balance'] = balance_usd
            return jsonify(result)
        logger.error(f"[Video] Queue failed: {resp.status_code} {resp.text[:500]}")
        return jsonify({
            "success": False,
            "error": f"Venice API Error: {resp.status_code}",
            "details": resp.text
        }), resp.status_code
    except Exception as e:
        logger.exception("[Video] Queue exception")
        return jsonify({"success": False, "error": str(e)}), 500


@video_bp.route('/api/video/retrieve', methods=['POST'])
def retrieve_video():
    """Poll Venice /video/retrieve. Returns JSON with status + timing, or
    {status: COMPLETED, video_url: /api/video/file/<name>} after caching the mp4."""
    data = request.json or {}
    model = data.get('model')
    queue_id = data.get('queue_id')

    if not model or not queue_id:
        return jsonify({"success": False, "error": "model and queue_id required"}), 400

    api_key = get_api_key()
    if not api_key:
        return jsonify({"success": False, "error": "Venice API key not found"}), 401

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": model, "queue_id": queue_id}

    # Log headers (mask API key)
    safe_headers = {k: '***MASKED***' if 'Authorization' in k else v for k, v in headers.items()}
    logger.info(f"[Video] Retrieve Headers: {safe_headers}")

    try:
        url = f"{VENICE_API_BASE}/video/retrieve"
        resp = requests.post(url, json=payload, headers=headers, timeout=120)

        if resp.status_code == 404:
            # Job may still be propagating — frontend will retry
            return jsonify({"status": "PENDING"}), 200

        if resp.status_code != 200:
            logger.error(f"[Video] Retrieve failed: {resp.status_code} {resp.text[:500]}")
            return jsonify({
                "success": False,
                "error": f"Venice API Error: {resp.status_code}",
                "details": resp.text
            }), resp.status_code

        content_type = resp.headers.get('Content-Type', '')
        
        # Extract balance from response headers
        balance_usd = resp.headers.get('x-venice-balance-usd')

        if 'video/mp4' in content_type:
            # Embed model ID in filename for avatar/logo lookup on load
            # Format: {queue_id}__{model_id}.mp4
            safe_model = model.replace('/', '--').replace('\\', '--')
            filename = f"{queue_id}__{safe_model}.mp4"
            path = os.path.join(VIDEO_CACHE_DIR, filename)
            with open(path, 'wb') as f:
                f.write(resp.content)
            logger.info(f"[Video] Cached {len(resp.content)} bytes to {path}")
            result = {
                "status": "COMPLETED",
                "video_url": f"/api/video/file/{filename}"
            }
            if balance_usd:
                result['_balance'] = balance_usd
            return jsonify(result)

        # JSON body: processing or completed-with-download_url
        body = resp.json()
        # Include balance in response for frontend to persist
        if balance_usd:
            body['_balance'] = balance_usd
        return jsonify(body)

    except Exception as e:
        logger.exception("[Video] Retrieve exception")
        return jsonify({"success": False, "error": str(e)}), 500


@video_bp.route('/api/video/file/<path:filename>', methods=['GET'])
def serve_video_file(filename):
    return send_from_directory(VIDEO_CACHE_DIR, filename, mimetype='video/mp4')


@video_bp.route('/api/video/files', methods=['GET'])
def list_video_files():
    try:
        files = []
        for name in os.listdir(VIDEO_CACHE_DIR):
            if not name.endswith('.mp4'):
                continue
            path = os.path.join(VIDEO_CACHE_DIR, name)
            stat = os.stat(path)
            
            # Parse model from filename: {queue_id}__{model_id}.mp4
            model = None
            base = name[:-4]  # strip .mp4
            if '__' in base:
                parts = base.split('__', 1)
                if len(parts) == 2:
                    # Restore slashes in model ID
                    model = parts[1].replace('--', '/')
            
            files.append({
                'filename': name,
                'size': stat.st_size,
                'mtime': stat.st_mtime,
                'model': model
            })
        files.sort(key=lambda f: f['mtime'], reverse=True)
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@video_bp.route('/api/video/file/<path:filename>', methods=['DELETE'])
def delete_video_file(filename):
    path = os.path.join(VIDEO_CACHE_DIR, os.path.basename(filename))
    if not os.path.exists(path):
        return jsonify({'success': False, 'error': 'File not found'}), 404
    try:
        os.remove(path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@video_bp.route('/api/video/quote', methods=['POST'])
def quote_video():
    data = request.json or {}
    api_key = get_api_key()
    if not api_key:
        return jsonify({"success": False, "error": "Venice API key not found"}), 401
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    quote_payload = {k: data[k] for k in ('model', 'duration', 'resolution', 'aspect_ratio', 'audio') if k in data}
    try:
        resp = requests.post(f"{VENICE_API_BASE}/video/quote", json=quote_payload, headers=headers, timeout=15)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        logger.exception("[Video] Quote exception")
        return jsonify({"error": str(e)}), 500


@video_bp.route('/api/video/create_gif', methods=['POST'])
def create_gif():
    data = request.json or {}
    video_filename = data.get('video_filename', '').strip()
    output_dir = data.get('output_dir', '').strip()
    output_name = data.get('output_name', 'output').strip()

    if not video_filename or not output_dir:
        return jsonify({"success": False, "error": "video_filename and output_dir required"}), 400

    video_path = os.path.join(VIDEO_CACHE_DIR, os.path.basename(video_filename))
    if not os.path.exists(video_path):
        return jsonify({"success": False, "error": "Cached video not found"}), 404

    output_dir = os.path.expanduser(output_dir)
    frames_dir = os.path.join(output_dir, f"{output_name}_frames")
    gif_path = os.path.join(output_dir, f"{output_name}.gif")

    try:
        os.makedirs(frames_dir, exist_ok=True)

        # Green-screen key + frame extraction
        frames_cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", "colorkey=0x00ff00:0.3:0.1",
            os.path.join(frames_dir, "frame_%04d.png")
        ]
        result = subprocess.run(frames_cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors='replace')[-500:])

        # Two-pass palette GIF with transparency
        gif_cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-filter_complex",
            (
                "colorkey=0x00ff00:0.3:0.1,"
                "split[s0][s1];"
                "[s0]palettegen=stats_mode=full:max_colors=256:reserve_transparent=1[p];"
                "[s1][p]paletteuse=dither=none:alpha_threshold=64[out]"
            ),
            "-map", "[out]",
            "-loop", "-1",
            gif_path
        ]
        result = subprocess.run(gif_cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors='replace')[-500:])

        logger.info(f"[Video] GIF created: {gif_path}, frames: {frames_dir}")
        return jsonify({"success": True, "gif_path": gif_path, "frames_dir": frames_dir})

    except Exception as e:
        logger.exception("[Video] GIF creation failed")
        return jsonify({"success": False, "error": str(e)}), 500


@video_bp.route('/api/video/create_apng', methods=['POST'])
def create_apng():
    data = request.json or {}
    video_filename = data.get('video_filename', '').strip()
    output_dir = data.get('output_dir', '').strip()
    output_name = data.get('output_name', 'output').strip()

    if not video_filename or not output_dir:
        return jsonify({"success": False, "error": "video_filename and output_dir required"}), 400

    video_path = os.path.join(VIDEO_CACHE_DIR, os.path.basename(video_filename))
    if not os.path.exists(video_path):
        return jsonify({"success": False, "error": "Cached video not found"}), 404

    output_dir = os.path.expanduser(output_dir)
    frames_dir = os.path.join(output_dir, f"{output_name}_frames")
    apng_path = os.path.join(output_dir, f"{output_name}.apng")

    try:
        os.makedirs(frames_dir, exist_ok=True)

        # Green-screen key + frame extraction
        frames_cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", "colorkey=0x00ff00:0.3:0.1",
            os.path.join(frames_dir, "frame_%04d.png")
        ]
        result = subprocess.run(frames_cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors='replace')[-500:])

        # APNG with transparency
        apng_cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", "colorkey=0x00ff00:0.3:0.1",
            "-f", "apng",
            "-plays", "0",
            apng_path
        ]
        result = subprocess.run(apng_cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors='replace')[-500:])

        logger.info(f"[Video] APNG created: {apng_path}, frames: {frames_dir}")
        return jsonify({"success": True, "apng_path": apng_path, "frames_dir": frames_dir})

    except Exception as e:
        logger.exception("[Video] APNG creation failed")
        return jsonify({"success": False, "error": str(e)}), 500


@video_bp.route('/api/video/create_webm', methods=['POST'])
def create_webm():
    data = request.json or {}
    video_filename = data.get('video_filename', '').strip()
    output_dir = data.get('output_dir', '').strip()
    output_name = data.get('output_name', 'output').strip()

    if not video_filename or not output_dir:
        return jsonify({"success": False, "error": "video_filename and output_dir required"}), 400

    video_path = os.path.join(VIDEO_CACHE_DIR, os.path.basename(video_filename))
    if not os.path.exists(video_path):
        return jsonify({"success": False, "error": "Cached video not found"}), 404

    output_dir = os.path.expanduser(output_dir)
    webm_path = os.path.join(output_dir, f"{output_name}.webm")

    try:
        os.makedirs(output_dir, exist_ok=True)

        # Green-screen key → VP9 WebM with alpha channel
        webm_cmd = [
            "ffmpeg", "-y", "-i", video_path,
            "-vf", "colorkey=0x00ff00:0.3:0.1",
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-auto-alt-ref", "0",
            "-b:v", "0", "-crf", "18",
            webm_path
        ]
        result = subprocess.run(webm_cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors='replace')[-500:])

        logger.info(f"[Video] WebM created: {webm_path}")
        return jsonify({"success": True, "webm_path": webm_path})

    except Exception as e:
        logger.exception("[Video] WebM creation failed")
        return jsonify({"success": False, "error": str(e)}), 500


@video_bp.route('/api/video/browse', methods=['GET'])
def browse_filesystem():
    raw_path = request.args.get('path', '~').strip() or '~'
    filter_type = request.args.get('filter', 'dirs')  # 'dirs' | 'webm'

    home = os.path.expanduser('~')
    path = os.path.expanduser(raw_path)
    path = os.path.realpath(path)

    # Restrict to home or video_cache
    if not path.startswith(home) and not path.startswith(VIDEO_CACHE_DIR):
        path = home
    if not os.path.isdir(path):
        path = os.path.dirname(path)
        if not os.path.isdir(path):
            path = home

    entries = []
    try:
        for name in sorted(os.listdir(path), key=lambda n: (not os.path.isdir(os.path.join(path, n)), n.lower())):
            if name.startswith('.'):
                continue
            full = os.path.join(path, name)
            is_dir = os.path.isdir(full)
            if is_dir:
                entries.append({'name': name, 'is_dir': True, 'path': full})
            elif filter_type == 'webm' and name.lower().endswith('.webm'):
                entries.append({'name': name, 'is_dir': False, 'path': full})
    except PermissionError:
        pass

    real_home = os.path.realpath(home)
    parent = os.path.dirname(path) if os.path.realpath(path) != real_home else None

    return jsonify({'path': path, 'parent': parent, 'entries': entries})


@video_bp.route('/api/video/extract_frames', methods=['POST'])
def extract_frames():
    data = request.json or {}
    webm_path = os.path.expanduser(data.get('webm_path', '').strip())
    output_dir = os.path.expanduser(data.get('output_dir', '').strip())
    fps = int(data.get('fps', 24)) or 24

    if not webm_path or not output_dir:
        return jsonify({"success": False, "error": "webm_path and output_dir required"}), 400

    home = os.path.expanduser('~')
    real_webm = os.path.realpath(webm_path)
    if not real_webm.startswith(home) and not real_webm.startswith(VIDEO_CACHE_DIR):
        return jsonify({"success": False, "error": "Path outside allowed directories"}), 403
    if not os.path.isfile(webm_path):
        return jsonify({"success": False, "error": "WebM file not found"}), 404

    base_name = os.path.splitext(os.path.basename(webm_path))[0]
    frames_dir = os.path.join(output_dir, f"{base_name}_frames")

    try:
        os.makedirs(frames_dir, exist_ok=True)

        cmd = [
            "ffmpeg", "-y", "-i", webm_path,
            "-vf", f"fps={fps}",
            os.path.join(frames_dir, "frame_%04d.png")
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors='replace')[-500:])

        frame_count = len([f for f in os.listdir(frames_dir) if f.lower().endswith('.png')])
        logger.info(f"[Video] Extracted {frame_count} frames to {frames_dir}")
        return jsonify({"success": True, "frames_dir": frames_dir, "frame_count": frame_count})

    except Exception as e:
        logger.exception("[Video] Frame extraction failed")
        return jsonify({"success": False, "error": str(e)}), 500


@video_bp.route('/api/video/frames_to_webm', methods=['POST'])
def frames_to_webm():
    import glob as _glob
    import tempfile
    data = request.json or {}
    frames_dir = os.path.expanduser(data.get('frames_dir', '').strip())
    output_dir = os.path.expanduser(data.get('output_dir', '').strip())
    output_name = data.get('output_name', 'output').strip()
    fps = int(data.get('fps', 24)) or 24

    if not frames_dir or not output_dir or not output_name:
        return jsonify({"success": False, "error": "frames_dir, output_dir, and output_name required"}), 400

    home = os.path.expanduser('~')
    if not os.path.realpath(frames_dir).startswith(home):
        return jsonify({"success": False, "error": "Path outside home directory"}), 403
    if not os.path.isdir(frames_dir):
        return jsonify({"success": False, "error": "Frames directory not found"}), 404

    frames = sorted([f for f in os.listdir(frames_dir) if f.lower().endswith('.png')])
    if not frames:
        return jsonify({"success": False, "error": "No PNG frames found in directory"}), 400

    webm_path = os.path.join(output_dir, f"{output_name}.webm")

    # Build concat file — works with any naming pattern
    list_fd, list_file = tempfile.mkstemp(suffix='.txt')
    try:
        os.makedirs(output_dir, exist_ok=True)

        with os.fdopen(list_fd, 'w') as f:
            for frame in frames:
                f.write(f"file '{os.path.join(frames_dir, frame)}'\n")

        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-f", "concat", "-safe", "0",
            "-i", list_file,
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-auto-alt-ref", "0",
            "-b:v", "0", "-crf", "18",
            webm_path
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode(errors='replace')[-500:])

        logger.info(f"[Video] WebM from frames: {webm_path} ({len(frames)} frames @ {fps}fps)")
        return jsonify({"success": True, "webm_path": webm_path})

    except Exception as e:
        logger.exception("[Video] Frames to WebM failed")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        try:
            os.unlink(list_file)
        except OSError:
            pass


@video_bp.route('/api/balance', methods=['GET'])
def get_balance():
    """Fetch current Venice balance from the billing API."""
    api_key = get_api_key()
    if not api_key:
        return jsonify({"success": False, "error": "Venice API key not found"}), 401

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        resp = requests.get(f"{VENICE_API_BASE}/billing/balance", headers=headers, timeout=10)
        data = resp.json()
        usd = data.get("balances", {}).get("usd")
        if usd is not None:
            return jsonify({"success": True, "balance": f"{float(usd) * 10:.2f}"})
        return jsonify({"success": False, "error": "Balance not found in response"}), 500
    except Exception as e:
        logger.exception("[Video] Balance fetch exception")
        return jsonify({"success": False, "error": str(e)}), 500
