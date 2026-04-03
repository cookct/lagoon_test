/**
 * Mobile Audio Service
 * Handles TTS fetching and playback
 */

import { DEFAULT_VOICE, DEFAULT_PROVIDER } from '../core/TTSConfig.js';

export class MobileAudio {
  constructor() {
    this.ctx = null;
    this.abortController = null;
    this.autoReadEnabled = localStorage.getItem('mobile_auto_read') === 'true';
    this.currentProvider = localStorage.getItem('mobile_tts_provider') || DEFAULT_PROVIDER;
    this.currentVoice = localStorage.getItem('mobile_tts_voice') || DEFAULT_VOICE;
    this.queue = [];
    this.isPlaying = false;
    this.currentSource = null;
    this.onPlaybackEnd = null;
    this.activeButton = null;
  }

  setActiveButton(btn) {
    if (this.activeButton) this.activeButton.classList.remove('active');
    this.activeButton = btn;
    if (btn) btn.classList.add('active');
    this.onPlaybackEnd = btn ? () => this.setActiveButton(null) : null;
  }

  // Initialize/Resume AudioContext on user gesture
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      console.log('Mobile AudioContext created');
    }
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        console.log('Mobile AudioContext resumed');
      });
    }
  }

  setAutoRead(enabled) {
    this.autoReadEnabled = enabled;
    localStorage.setItem('mobile_auto_read', enabled ? 'true' : 'false');
    if (!enabled) this.stop();
  }

  setProvider(provider) {
    this.currentProvider = provider;
    localStorage.setItem('mobile_tts_provider', provider);
  }

  setVoice(voiceId) {
    this.currentVoice = voiceId;
    localStorage.setItem('mobile_tts_voice', voiceId);
  }

  isAutoReadEnabled() {
    return this.autoReadEnabled;
  }

    async speak(text) {
      this.stop();
      if (!text || text.trim().length === 0) return;

      // Ensure AudioContext is running (can be suspended after inactivity)
      if (this.ctx && this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch(e) {}
      }

      // Chunk by paragraph; split large paragraphs into sentences only if needed
      const MAX_CHUNK = 500;
      const raw = text.split(/\n+/).map(c => c.trim()).filter(c => c.length > 0);
      const chunks = [];
      for (const para of raw) {
        if (para.length <= MAX_CHUNK) {
          chunks.push(para);
        } else {
          // Break oversized paragraph into sentence-level pieces
          const sents = para.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0);
          let current = '';
          for (const sent of sents) {
            if (current && current.length + sent.length + 1 > MAX_CHUNK) {
              chunks.push(current);
              current = sent;
            } else {
              current = current ? current + ' ' + sent : sent;
            }
          }
          if (current) chunks.push(current);
        }
      }
      if (chunks.length === 0) return;
      this.queue = chunks;
      console.log(`[TTS] ${this.currentProvider} provider: ${chunks.length} chunks`);

      // Pre-fetch first 3 sentences in parallel so audio starts as soon as #1 is ready
      // rather than waiting for #1 before even starting #2
      const warmCount = Math.min(3, this.queue.length);
      this.prefetchCache = {};
      for (let i = 0; i < warmCount; i++) {
        const t = this.queue[i];
        this.prefetchCache[t] = this.fetchChunk(t).catch(() => null);
      }

      this.processQueue();
    }

    async fetchChunk(text) {
      const cleanText = text.replace(/[*_`#]/g, '').trim();
      if (!cleanText) return null;
  
      const controller = new AbortController();
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          provider: this.currentProvider,
          voice: this.currentVoice
        }),
        signal: controller.signal
      });
  
      if (!response.ok) throw new Error(`TTS API Error: ${response.status}`);
      return await response.arrayBuffer();
    }
  
    _getPrefetch(text) {
      // Return cached prefetch promise if available, otherwise start a new fetch
      if (this.prefetchCache && this.prefetchCache[text]) {
        const p = this.prefetchCache[text];
        delete this.prefetchCache[text];
        return p;
      }
      return this.fetchChunk(text).catch(() => null);
    }

    async processQueue() {
      if (this.isPlaying || !this.ctx) return;
      if (this.queue.length === 0) {
        if (this.onPlaybackEnd) { this.onPlaybackEnd(); this.onPlaybackEnd = null; }
        return;
      }

      this.isPlaying = true;
      const chunk = this.queue.shift();

      try {
        const arrayBuffer = await this._getPrefetch(chunk);
        if (!arrayBuffer) {
          this.isPlaying = false;
          return this.processQueue();
        }

        // Ensure next chunk is already in flight
        let nextPrefetch = null;
        if (this.queue.length > 0) {
          nextPrefetch = this._getPrefetch(this.queue[0]);
          // Also warm up the one after that if not already cached
          if (this.queue.length > 1 && !(this.prefetchCache && this.prefetchCache[this.queue[1]])) {
            if (!this.prefetchCache) this.prefetchCache = {};
            this.prefetchCache[this.queue[1]] = this.fetchChunk(this.queue[1]).catch(() => null);
          }
        }
  
        this.ctx.decodeAudioData(arrayBuffer, (audioBuffer) => {
          if (!this.isPlaying) return;
  
          const source = this.ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.ctx.destination);
          
          source.onended = () => {
            this.isPlaying = false;
            this.currentSource = null;
            
            // If we had a pre-fetch, use it, otherwise call processQueue normally
            if (nextPrefetch) {
              this.handlePrefetched(nextPrefetch);
            } else {
              this.processQueue();
            }
          };
  
          this.currentSource = source;
          source.start(0);
        }, (err) => {
          console.error('[WebAudio] Decode error:', err);
          this.isPlaying = false;
          this.processQueue();
        });
  
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[WebAudio] Process error:', err);
        }
        this.isPlaying = false;
        this.processQueue();
      }
    }
  
    async handlePrefetched(prefetchPromise) {
      this.isPlaying = true;
      const chunkText = this.queue.shift(); // The text we already started fetching
  
      try {
        const arrayBuffer = await prefetchPromise;
        if (!arrayBuffer) {
          this.isPlaying = false;
          return this.processQueue();
        }
  
        // Ensure next chunk is already in flight
        let nextPrefetch = null;
        if (this.queue.length > 0) {
          nextPrefetch = this._getPrefetch(this.queue[0]);
        }
  
        this.ctx.decodeAudioData(arrayBuffer, (audioBuffer) => {
          if (!this.isPlaying) return;
          const source = this.ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.ctx.destination);
          source.onended = () => {
            this.isPlaying = false;
            if (nextPrefetch) this.handlePrefetched(nextPrefetch);
            else this.processQueue();
          };
          this.currentSource = source;
          source.start(0);
        }, () => {
          this.isPlaying = false;
          this.processQueue();
        });
      } catch (e) {
        this.isPlaying = false;
        this.processQueue();
      }
    }
  stop() {
    console.log('Stopping mobile audio...');
    this.setActiveButton(null);
    this.queue = [];
    this.prefetchCache = {};
    this.isPlaying = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch(e) {}
      this.currentSource = null;
    }
  }
}

export const audioService = new MobileAudio();
