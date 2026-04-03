"""
Gemini Live - exact copy from working new_project
"""

import asyncio
import base64
import threading
import queue
import warnings

from flask import request

warnings.filterwarnings("ignore", module="google.genai")

from google import genai
from google.genai import types
from services.storage import get_google_api_key

sessions = {}
MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"


def register_gemini_live(socketio):
    print("[Gemini] Registering handlers", flush=True)

    @socketio.on('connect')
    def handle_connect():
        sid = request.sid
        print(f"[Client connected: {sid}]", flush=True)

    @socketio.on('start')
    def handle_start(data):
        sid = request.sid
        system_prompt = data.get('system_prompt', '')
        voice = data.get('voice', 'Kore')
        print(f"[Starting session for {sid}, prompt len: {len(system_prompt)}, voice: {voice}]", flush=True)
        thread = threading.Thread(target=start_gemini_session, args=(socketio, sid, system_prompt, voice))
        thread.daemon = True
        thread.start()

    @socketio.on('disconnect')
    def handle_disconnect():
        print(f"[Client disconnected: {request.sid}]", flush=True)
        if request.sid in sessions:
            sessions[request.sid]['running'] = False
            del sessions[request.sid]

    @socketio.on('audio')
    def handle_audio(data):
        sid = request.sid
        if sid in sessions and sessions[sid].get('queue'):
            sessions[sid]['queue'].put(('audio', data))

    @socketio.on('text')
    def handle_text(data):
        sid = request.sid
        print(f"[Text from {sid}: {data}]", flush=True)
        if sid in sessions and sessions[sid].get('queue'):
            sessions[sid]['queue'].put(('text', data))


def start_gemini_session(socketio, sid, system_prompt='', voice='Kore'):
    sessions[sid] = {
        'running': True,
        'queue': queue.Queue()
    }

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(gemini_loop(socketio, sid, system_prompt, voice))
    except Exception as e:
        print(f"[Session error: {e}]", flush=True)
        import traceback
        traceback.print_exc()
    finally:
        loop.close()
        if sid in sessions:
            del sessions[sid]


async def gemini_loop(socketio, sid, system_prompt='', voice='Kore'):
    api_key = get_google_api_key()
    if not api_key:
        socketio.emit('error', {'message': 'No API key'}, room=sid)
        return

    client = genai.Client(api_key=api_key)

    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
            )
        )
    )

    if system_prompt:
        config.system_instruction = types.Content(
            parts=[types.Part(text=system_prompt)]
        )
        print(f"[Using system prompt: {system_prompt[:50]}...]", flush=True)

    print(f"[Connecting to Gemini...]", flush=True)

    try:
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            print(f"[Gemini connected for {sid}]", flush=True)
            socketio.emit('status', {'connected': True}, room=sid)

            # Send initial greeting to make Gemini talk first
            await session.send_client_content(
                turns=types.Content(
                    role="user",
                    parts=[types.Part(text="Say a brief hello.")]
                ),
                turn_complete=True
            )

            # Run handlers
            await asyncio.gather(
                handle_input(sid, session),
                handle_output(socketio, sid, session)
            )

    except Exception as e:
        print(f"[Gemini error: {e}]", flush=True)
        import traceback
        traceback.print_exc()
        socketio.emit('error', {'message': str(e)}, room=sid)


async def handle_input(sid, session):
    if sid not in sessions:
        return
    q = sessions[sid]['queue']

    while sid in sessions and sessions[sid]['running']:
        try:
            msg_type, data = q.get_nowait()
        except:
            await asyncio.sleep(0.05)
            continue

        try:
            if msg_type == 'audio':
                if ',' in data:
                    data = data.split(',')[1]
                audio_bytes = base64.b64decode(data)
                await session.send_realtime_input(
                    media=types.Blob(data=audio_bytes, mime_type="audio/pcm")
                )
            elif msg_type == 'text':
                print(f"[Sending text to Gemini: {data}]", flush=True)
                await session.send_client_content(
                    turns=types.Content(role="user", parts=[types.Part(text=data)]),
                    turn_complete=True
                )
        except Exception as e:
            print(f"[Input error: {e}]", flush=True)
            break


async def handle_output(socketio, sid, session):
    audio_chunk_count = 0

    while sid in sessions and sessions[sid]['running']:
        try:
            async for response in session.receive():
                if response.data:
                    audio_chunk_count += 1
                    audio_b64 = base64.b64encode(response.data).decode('utf-8')
                    socketio.emit('audio', {'data': audio_b64}, room=sid)

                if response.text:
                    print(f"[Gemini: {response.text[:50]}...]", flush=True)

                if response.server_content and response.server_content.turn_complete:
                    print(f"[Turn complete, sent {audio_chunk_count} audio chunks]", flush=True)
                    audio_chunk_count = 0
                    socketio.emit('turn_complete', {}, room=sid)

        except Exception as e:
            print(f"[Output error: {e}]", flush=True)
            break
