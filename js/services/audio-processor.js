/**
 * Audio Worklet Processor for capturing microphone audio
 * Runs in a separate thread for low-latency audio processing
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // ~256ms at 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];

    // Accumulate samples into buffer
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.bufferIndex++] = samples[i];

      // When buffer is full, send to main thread
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({
          audio: this.buffer.slice()
        });
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
