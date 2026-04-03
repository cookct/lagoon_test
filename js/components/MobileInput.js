/**
 * Mobile Input Bar Component
 * Text input, voice toggle, and send/mic button
 */

import { geminiLiveService } from '../services/GeminiLiveService.js';

export class MobileInput {
  constructor(container, options = {}) {
    this.container = container;
    this.onSend = options.onSend || (() => {});
    this.onVoiceResponse = options.onVoiceResponse || (() => {});
    this.onVoiceStart = options.onVoiceStart || (() => {});
    this.onVoiceEnd = options.onVoiceEnd || (() => {});
    this.element = null;
    this.textarea = null;
    this.sendBtn = null;
    this.micBtn = null;
    this.isGeminiLiveEnabled = localStorage.getItem('gemini_live_enabled') === 'true';
    console.log('[MobileInput] Gemini Live enabled:', this.isGeminiLiveEnabled);
    this.isRecording = false; // Gemini Live recording
    this.isConnected = false;
    this.isSttRecording = false; // Venice ASR recording
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.silenceTimeout = null;
    this.audioContext = null;
    this.analyser = null;
    this.silenceThreshold = 15;
    this.silenceDuration = 4000;

    // Initialize MediaRecorder check
    this.initMediaRecorder();

    // Listen for Gemini Live toggle changes
    window.addEventListener('geminiLiveToggle', (e) => {
      this.isGeminiLiveEnabled = e.detail;
      // Stop any active recording when toggling
      if (this.isRecording) {
        this.stopVoiceSession();
      }
      if (this.isSttRecording) {
        this.stopSttRecording();
      }
    });
  }

  initMediaRecorder() {
    // Check if MediaRecorder and getUserMedia are available
    this.asrAvailable = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    if (this.asrAvailable) {
      console.log('[ASR] Venice ASR available via MediaRecorder');
    } else {
      console.warn('[ASR] MediaRecorder not supported in this browser');
    }
  }

  async transcribeAudio(audioBlob) {
    const formData = new FormData();
    const ext = this.audioMimeType.split('/')[1] || 'webm';
    formData.append('audio', audioBlob, `recording.${ext}`);

    const response = await fetch('/api/asr', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'ASR request failed');
    }

    const result = await response.json();
    return result.text || '';
  }

  render() {
    this.element = document.createElement('div');
    this.element.className = 'mobile-input-bar';

    // Input wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'mobile-input-wrapper';

    // Textarea
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'mobile-text-input';
    this.textarea.placeholder = 'Type a message...';
    this.textarea.rows = 1;
    this.textarea.addEventListener('input', () => this.handleInput());
    this.textarea.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Send button
    this.sendBtn = document.createElement('button');
    this.sendBtn.className = 'mobile-send-btn';
    this.sendBtn.disabled = true;
    this.sendBtn.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
      </svg>
    `;
    this.sendBtn.addEventListener('click', () => this.handleSend());

    // Single mic button - behavior changes based on Gemini Live setting
    this.micBtn = document.createElement('button');
    this.micBtn.className = 'mobile-mic-btn';
    this.micBtn.innerHTML = `
      <svg class="mic-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="currentColor"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/>
      </svg>
      <svg class="stop-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:none;">
        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
      </svg>
    `;
    this.micBtn.addEventListener('click', () => this.handleMicClick());

    // Voice status indicator
    this.voiceStatus = document.createElement('div');
    this.voiceStatus.className = 'mobile-voice-status';
    this.voiceStatus.innerHTML = '<span class="status-text">Tap mic to start</span>';

    wrapper.appendChild(this.textarea);
    wrapper.appendChild(this.voiceStatus);

    // Layout: [mic] [input wrapper] [send btn]
    this.element.appendChild(this.micBtn);
    this.element.appendChild(wrapper);
    this.element.appendChild(this.sendBtn);
    this.container.appendChild(this.element);

    // Setup Gemini Live callbacks
    this.setupGeminiLiveCallbacks();

    return this.element;
  }

  setupGeminiLiveCallbacks() {
    geminiLiveService.onConnectionChange = (connected) => {
      this.isConnected = connected;
      this.updateVoiceStatus(connected ? 'Listening...' : 'Disconnected');
      if (!connected && this.isRecording) {
        this.stopVoiceSession();
      }
    };


    geminiLiveService.onAudioResponse = (isPlaying) => {
      if (isPlaying) {
        this.updateVoiceStatus('Speaking...');
        this.micBtn.classList.add('ai-speaking');
      } else {
        this.updateVoiceStatus('Listening...');
        this.micBtn.classList.remove('ai-speaking');
      }
    };

    geminiLiveService.onError = (error) => {
      this.updateVoiceStatus(`Error: ${error}`);
      console.error('Gemini Live error:', error);
    };
  }

  updateVoiceStatus(text) {
    const statusText = this.voiceStatus.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  }

  updateMicButtonState() {
    // Update mic button appearance based on recording state
    const isAnyRecording = this.isRecording || this.isSttRecording;
    const micIcon = this.micBtn.querySelector('.mic-icon');
    const stopIcon = this.micBtn.querySelector('.stop-icon');

    if (isAnyRecording) {
      this.micBtn.classList.add('recording');
      if (micIcon) micIcon.style.display = 'none';
      if (stopIcon) stopIcon.style.display = '';
    } else {
      this.micBtn.classList.remove('recording');
      if (micIcon) micIcon.style.display = '';
      if (stopIcon) stopIcon.style.display = 'none';
    }
  }

  async handleSttMicClick() {
    if (this.isSttRecording) {
      this.stopSttRecording();
    } else {
      await this.startSttRecording();
    }
  }

  stopSttRecording() {
    // Clear silence detection
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }

    // Stop audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    // Stop recording
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    this.isSttRecording = false;
    this.updateMicButtonState();
  }

  async startSttRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Setup audio analysis for silence detection
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let lastSoundTime = Date.now();

      // Check for silence every 100ms
      this.silenceCheckInterval = setInterval(() => {
        if (!this.isSttRecording) return;

        this.analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;

        if (average > this.silenceThreshold) {
          // Sound detected, reset timer
          lastSoundTime = Date.now();
          this.textarea.placeholder = 'Listening...';
        } else {
          // Silence - check duration
          const silentFor = Date.now() - lastSoundTime;
          const remaining = Math.ceil((this.silenceDuration - silentFor) / 1000);

          if (silentFor >= this.silenceDuration) {
            // 4 seconds of silence - auto stop
            console.log('[ASR] Auto-stopping after 4s silence');
            this.stopSttRecording();
          } else if (remaining <= 3) {
            this.textarea.placeholder = `Stopping in ${remaining}...`;
          }
        }
      }, 100);

      // Determine best supported mime type
      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg'];
      let selectedMime = 'audio/webm';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      this.audioMimeType = selectedMime;
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMime });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: this.audioMimeType });
        this.audioChunks = [];

        // Only transcribe if we have audio data
        if (audioBlob.size < 1000) {
          this.textarea.value = '';
          this.textarea.placeholder = 'No speech detected';
          this.textarea.style.opacity = '1';
          setTimeout(() => {
            this.textarea.placeholder = 'Type a message...';
          }, 2000);
          return;
        }

        // Show processing state
        this.textarea.value = 'Transcribing...';
        this.textarea.style.opacity = '0.7';

        try {
          const transcript = await this.transcribeAudio(audioBlob);

          if (transcript && transcript.trim()) {
            this.textarea.value = transcript;
            this.textarea.style.opacity = '1';
            this.handleInput();
            // Auto-send after transcription
            this.handleSend();
          } else {
            this.textarea.value = '';
            this.textarea.placeholder = 'No speech detected';
            this.textarea.style.opacity = '1';
            setTimeout(() => {
              this.textarea.placeholder = 'Type a message...';
            }, 2000);
          }
        } catch (error) {
          console.error('Transcription error:', error);
          this.textarea.value = '';
          this.textarea.placeholder = 'Transcription failed';
          this.textarea.style.opacity = '1';
          setTimeout(() => {
            this.textarea.placeholder = 'Type a message...';
          }, 2000);
        }

        this.isSttRecording = false;
        this.updateMicButtonState();
      };

      this.mediaRecorder.start();
      this.isSttRecording = true;
      this.textarea.value = '';
      this.textarea.placeholder = 'Listening...';
      this.updateMicButtonState();

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.textarea.placeholder = 'Mic access denied';
      setTimeout(() => {
        this.textarea.placeholder = 'Type a message...';
      }, 2000);
    }
  }

  async handleMicClick() {
    // If Gemini Live is enabled, use real-time voice chat
    // Otherwise, use Venice ASR for speech-to-text
    if (this.isGeminiLiveEnabled) {
      if (this.isRecording) {
        await this.stopVoiceSession();
      } else {
        await this.startVoiceSession();
      }
    } else {
      if (this.isSttRecording) {
        this.stopSttRecording();
      } else {
        await this.startSttRecording();
      }
    }
  }

  async startVoiceSession() {
    try {
      this.updateVoiceStatus('Connecting...');
      this.micBtn.classList.add('connecting');

      // Get Gemini Live system prompt from localStorage
      const systemPrompt = localStorage.getItem('gemini_live_system_prompt') || '';
      geminiLiveService.setSystemPrompt(systemPrompt);

      // Get voice from localStorage
      const voice = localStorage.getItem('gemini_live_voice') || 'Kore';
      geminiLiveService.setVoice(voice);

      // Connect to Gemini Live
      await geminiLiveService.connect();

      // Start recording
      await geminiLiveService.startRecording();

      this.isRecording = true;
      this.micBtn.classList.remove('connecting');
      this.micBtn.classList.add('recording');
      this.updateMicButtonState();
      this.updateVoiceStatus('Listening...');

      this.onVoiceStart();

    } catch (error) {
      console.error('Failed to start voice session:', error);
      this.updateVoiceStatus('Error: ' + error.message);
      this.micBtn.classList.remove('connecting');
      this.isRecording = false;
    }
  }

  async stopVoiceSession() {
    this.isRecording = false;
    this.micBtn.classList.remove('recording', 'connecting', 'ai-speaking');
    this.updateMicButtonState();

    geminiLiveService.stopRecording();
    geminiLiveService.disconnect();

    this.updateVoiceStatus('Tap mic to start');
    this.onVoiceEnd();
  }

  handleInput() {
    // Auto-resize
    this.textarea.style.height = 'auto';
    this.textarea.style.height = Math.min(this.textarea.scrollHeight, 150) + 'px';

    // Enable/disable send button
    const hasText = this.textarea.value.trim().length > 0;
    this.sendBtn.disabled = !hasText;
  }

  handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  handleSend() {
    const text = this.textarea.value.trim();
    if (!text) return;

    this.onSend(text);
    this.textarea.value = '';
    this.textarea.style.height = 'auto';
    this.sendBtn.disabled = true;
  }

  focus() {
    if (this.textarea && !this.isVoiceMode) {
      this.textarea.focus();
    }
  }

  destroy() {
    // Stop voice session if active
    if (this.isRecording) {
      this.stopVoiceSession();
    }

    // Stop STT recording if active
    if (this.isSttRecording) {
      this.stopSttRecording();
    }

    // Clean up silence detection
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
    }
    if (this.audioContext) {
      this.audioContext.close();
    }

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.textarea = null;
    this.sendBtn = null;
    this.micBtn = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
  }
}
