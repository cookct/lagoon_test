"""
Together.ai Video Routes
Handles Together.ai async video generation (separate from Venice).

Together API contract:
  POST https://api.together.xyz/v1/videos          -> {id, status, ...}
  GET  https://api.together.xyz/v1/videos/{job_id} -> {id, status, outputs.video_url, ...}
"""
import logging
import os
import requests
from flask import Blueprint, request, jsonify

from services.storage import get_together_api_key

logger = logging.getLogger(__name__)

together_video_bp = Blueprint('together_video', __name__)

TOGETHER_VIDEO_BASE = 'https://api.together.xyz/v1/videos'
VIDEO_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'video_cache')
os.makedirs(VIDEO_CACHE_DIR, exist_ok=True)


@together_video_bp.route('/api/together/video/queue', methods=['POST'])
def together_queue_video():
    data = request.json or {}
    api_key = get_together_api_key()
    if not api_key:
        return jsonify({"error": "Together API key not configured"}), 401

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    try:
        logger.info(f"[TogetherVideo] Queue model={data.get('model')}")
        resp = requests.post(TOGETHER_VIDEO_BASE, json=data, headers=headers, timeout=60)
        logger.info(f"[TogetherVideo] Queue response: {resp.status_code}")
        if resp.status_code != 200:
            logger.error(f"[TogetherVideo] Queue error: {resp.text[:500]}")
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        logger.exception("[TogetherVideo] Queue exception")
        return jsonify({"error": str(e)}), 500


@together_video_bp.route('/api/together/video/retrieve/<job_id>', methods=['GET'])
def together_retrieve_video(job_id):
    api_key = get_together_api_key()
    if not api_key:
        return jsonify({"error": "Together API key not configured"}), 401

    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        resp = requests.get(f"{TOGETHER_VIDEO_BASE}/{job_id}", headers=headers, timeout=30)
        if resp.status_code != 200:
            logger.error(f"[TogetherVideo] Retrieve error {resp.status_code}: {resp.text[:500]}")
            return jsonify(resp.json()), resp.status_code

        data = resp.json()
        status = data.get('status', '')

        if status == 'completed':
            video_url = (data.get('outputs') or {}).get('video_url')
            if video_url:
                model = data.get('model', 'together').replace('/', '--').replace('\\', '--')
                filename = f"{job_id}__{model}.mp4"
                path = os.path.join(VIDEO_CACHE_DIR, filename)
                if not os.path.exists(path):
                    logger.info(f"[TogetherVideo] Downloading video to {path}")
                    vid_resp = requests.get(video_url, timeout=120)
                    vid_resp.raise_for_status()
                    with open(path, 'wb') as f:
                        f.write(vid_resp.content)
                    logger.info(f"[TogetherVideo] Cached {len(vid_resp.content)} bytes")
                data['cached_url'] = f"/api/video/file/{filename}"

        return jsonify(data)
    except Exception as e:
        logger.exception("[TogetherVideo] Retrieve exception")
        return jsonify({"error": str(e)}), 500
