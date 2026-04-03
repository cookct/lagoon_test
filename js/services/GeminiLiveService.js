/**
 * Gemini Live Service - simplified to match new_project
 */

class GeminiLiveService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isRecording = false;
    this.audioContext = null;
    this.micContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.isListening = true;
    this.systemPrompt = '';
    this.voice = 'Kore';

    this.onConnectionChange = null;
    this.onAudioResponse = null;
    this.onError = null;

    this.audioBuffer = [];
    this.isPlaying = false;
    this.turnComplete = true;
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt || '';
  }

  setVoice(voice) {
    this.voice = voice || 'Kore';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = io();

      this.socket.on('connect', () => {
        console.log('Socket connected, starting with prompt:', this.systemPrompt?.slice(0, 50), 'voice:', this.voice);
        this.socket.emit('start', { system_prompt: this.systemPrompt, voice: this.voice });
      });

      this.socket.on('status', (data) => {
        if (data.connected) {
          console.log('Gemini connected');
          this.isConnected = true;
          if (this.onConnectionChange) this.onConnectionChange(true);
          resolve();
        }
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected');
        this.isConnected = false;
        if (this.onConnectionChange) this.onConnectionChange(false);
      });

      this.socket.on('error', (data) => {
        console.error('Error:', data.message);
        if (this.onError) this.onError(data.message);
        reject(new Error(data.message));
      });

      this.socket.on('audio', (data) => {
        this.turnComplete = false;
        this._handleAudio(data.data);
      });

      this.socket.on('turn_complete', () => {
        console.log('Turn complete');
        this.turnComplete = true;
        if (this.audioBuffer.length > 0 && !this.isPlaying) {
          this._flushAudio();
        }
      });

      setTimeout(() => {
        if (!this.isConnected) reject(new Error('Timeout'));
      }, 15000);
    });
  }

  _handleAudio(base64Data) {
    if (!this.audioContext) return;

    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const int16 = new Int16Array(bytes.buffer);

    for (let i = 0; i < int16.length; i++) {
      this.audioBuffer.push(int16[i] / 32768.0);
    }

    this.isListening = false;
    if (this.onAudioResponse) this.onAudioResponse(true);

    if (this.audioBuffer.length > 12000 && !this.isPlaying) {
      this._flushAudio();
    }
  }

  _flushAudio() {
    if (this.audioBuffer.length === 0) {
      // If turn not complete, keep waiting for more audio
      if (!this.turnComplete) {
        setTimeout(() => this._flushAudio(), 150);
        return;
      }
      this.isPlaying = false;
      if (this.onAudioResponse) this.onAudioResponse(false);
      this.isListening = true;
      return;
    }

    this.isPlaying = true;
    const samples = new Float32Array(this.audioBuffer);
    this.audioBuffer = [];

    const buffer = this.audioContext.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.onended = () => {
      // Longer delay to let more chunks arrive
      setTimeout(() => this._flushAudio(), 100);
    };
    source.start();
  }

  sendText(text) {
    if (this.socket && this.isConnected) {
      console.log('Sending text:', text);
      this.socket.emit('text', text);
    }
  }

  async startRecording() {
    if (this.isRecording) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });

    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.micContext = new AudioContext({ sampleRate: 16000 });

    await this.audioContext.resume();
    await this.micContext.resume();

    const source = this.micContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.micContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isListening) return;

      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);

      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
      }

      const uint8 = new Uint8Array(int16.buffer);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      this.socket.emit('audio', 'data:audio/pcm;base64,' + btoa(binary));
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.micContext.destination);

    this.isRecording = true;
    this.isListening = true;
  }

  stopRecording() {
    this.isRecording = false;
    this.isListening = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }

    if (this.micContext) {
      this.micContext.close();
      this.micContext = null;
    }
  }

  disconnect() {
    this.stopRecording();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.audioBuffer = [];
    this.isPlaying = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const geminiLiveService = new GeminiLiveService();
export { GeminiLiveService };

// Expose for console testing
window.geminiLive = geminiLiveService;
