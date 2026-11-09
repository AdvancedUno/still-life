/**
 * sensors.js
 * The guard's eyes (motion from your webcam) and ears (loudness from your microphone).
 * Frames and sound are analyzed in the browser and thrown away; nothing is recorded.
 */

const FRAME_WIDTH = 64;
const FRAME_HEIGHT = 48;
const SAMPLE_INTERVAL_MS = 66; // About 15 motion checks per second is plenty.
const PIXEL_CHANGE = 26; // Brightness change (0–255) that counts as "this pixel moved".
const MOTION_THRESHOLD_RANGE = [0.015, 0.2];
const MOTION_SPAN = 0.12; // How far past the threshold counts as "definitely moving".
const NOISE_MARGIN_DB = 15;
const NOISE_THRESHOLD_RANGE = [-58, -18];
const NOISE_SPAN_DB = 18;

export class SensorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SensorError';
  }
}

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));

function canUseMedia() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/** Calls `read` once per animation frame for `durationMs` and collects the results. */
function collectSamples(read, durationMs) {
  return new Promise((resolve) => {
    const samples = [];
    const startedAt = performance.now();
    const step = (now) => {
      samples.push(read(now));
      if (now - startedAt < durationMs) {
        requestAnimationFrame(step);
      } else {
        resolve(samples);
      }
    };
    requestAnimationFrame(step);
  });
}

/** A friendly explanation for why a camera or microphone didn't start. */
export function mediaErrorMessage(error, device) {
  if (error instanceof SensorError) {
    return `This browser can’t share your ${device} here. Camera and microphone access need a secure (https) page.`;
  }
  switch (error?.name) {
    case 'NotSupportedError':
      return `This browser can’t share your ${device} on this page.`;
    case 'NotAllowedError':
    case 'SecurityError':
      return `Access to your ${device} was blocked. You can allow it from the icon in the address bar, then try again.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `No ${device} was found on this device.`;
    case 'NotReadableError':
    case 'AbortError':
      return `Your ${device} is busy in another app. Close that app, then try again.`;
    default:
      return `Your ${device} couldn’t start.`;
  }
}

/** Measures how much of the webcam image changes from one frame to the next. */
export class MotionSensor {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = FRAME_WIDTH;
    this.canvas.height = FRAME_HEIGHT;
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.current = new Float32Array(FRAME_WIDTH * FRAME_HEIGHT);
    this.previous = new Float32Array(FRAME_WIDTH * FRAME_HEIGHT);
    this.previousMean = 0;
    this.hasPrevious = false;
    this.level = 0;
    this.threshold = 0.04;
    this.lastSampleAt = 0;
  }

  get isOn() {
    return this.stream !== null;
  }

  /** 0 at or below the threshold, rising to 1 when you're clearly moving. */
  get excess() {
    return clamp((this.level - this.threshold) / MOTION_SPAN, [0, 1]);
  }

  /** 0–1 reading for meters, with the threshold sitting at the halfway mark. */
  get reading() {
    return clamp(this.level / (this.threshold * 2), [0, 1]);
  }

  async start() {
    if (!canUseMedia()) throw new SensorError('Media devices are unavailable.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false,
    });
    this.stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => this.stop());
    });
  }

  /** Shows the camera in a <video> element and reads frames from it. Resolves once frames arrive. */
  watchThrough(video) {
    this.video = video;
    this.hasPrevious = false;
    if (video.srcObject !== this.stream) video.srcObject = this.stream;

    const ready = video.readyState >= 2
      ? Promise.resolve()
      : new Promise((resolve) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        setTimeout(resolve, 3000);
      });
    video.play().catch(() => {
      // Autoplay of a muted camera feed is allowed; if it's interrupted, the next play() call recovers.
    });
    return ready;
  }

  sample(now = performance.now()) {
    if (!this.isOn || !this.video || this.video.readyState < 2) return this.level;
    if (now - this.lastSampleAt < SAMPLE_INTERVAL_MS) return this.level;
    this.lastSampleAt = now;

    this.context.drawImage(this.video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const { data } = this.context.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const pixelCount = FRAME_WIDTH * FRAME_HEIGHT;

    let total = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const offset = pixel * 4;
      const brightness = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      this.current[pixel] = brightness;
      total += brightness;
    }
    const mean = total / pixelCount;

    if (this.hasPrevious) {
      // Subtract the change in overall brightness so screen glow and auto-exposure don't count as motion.
      const shift = mean - this.previousMean;
      let changed = 0;
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (Math.abs(this.current[pixel] - this.previous[pixel] - shift) > PIXEL_CHANGE) changed += 1;
      }
      this.level = this.level * 0.5 + (changed / pixelCount) * 0.5;
    }

    [this.previous, this.current] = [this.current, this.previous];
    this.previousMean = mean;
    this.hasPrevious = true;
    return this.level;
  }

  /** Learns how "still" looks in this room, so normal camera noise doesn't count as moving. */
  async calibrate(durationMs) {
    this.level = 0;
    const samples = await collectSamples((now) => this.sample(now), durationMs);
    this.threshold = clamp(percentile(samples, 0.9) * 2 + 0.01, MOTION_THRESHOLD_RANGE);
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.level = 0;
    this.hasPrevious = false;
  }
}

/** Measures microphone loudness in decibels relative to the room's normal noise. */
export class NoiseSensor {
  constructor() {
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.buffer = null;
    this.levelDb = -100;
    this.floorDb = -70;
    this.thresholdDb = -50;
  }

  get isOn() {
    return this.stream !== null;
  }

  get excess() {
    return clamp((this.levelDb - this.thresholdDb) / NOISE_SPAN_DB, [0, 1]);
  }

  get reading() {
    const span = Math.max(1, (this.thresholdDb - this.floorDb) * 2);
    return clamp((this.levelDb - this.floorDb) / span, [0, 1]);
  }

  async start(audioContext) {
    if (!canUseMedia() || !audioContext) throw new SensorError('Audio input is unavailable.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      video: false,
    });
    this.stream.getAudioTracks().forEach((track) => {
      track.addEventListener('ended', () => this.stop());
    });
    this.source = audioContext.createMediaStreamSource(this.stream);
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buffer = new Float32Array(this.analyser.fftSize);
    // Connected to the analyser only, never to the speakers, so there's no feedback.
    this.source.connect(this.analyser);
  }

  sample() {
    if (!this.analyser) return this.levelDb;
    this.analyser.getFloatTimeDomainData(this.buffer);

    let sumOfSquares = 0;
    for (const value of this.buffer) sumOfSquares += value * value;
    const rms = Math.sqrt(sumOfSquares / this.buffer.length);
    const decibels = 20 * Math.log10(Math.max(rms, 1e-6));

    // Jump up instantly, fall back gently, like a VU meter.
    this.levelDb = decibels > this.levelDb
      ? decibels
      : this.levelDb + (decibels - this.levelDb) * 0.15;
    return this.levelDb;
  }

  /** Learns how loud the room is when nobody's talking. */
  async calibrate(durationMs) {
    const samples = await collectSamples(() => this.sample(), durationMs);
    this.floorDb = percentile(samples, 0.5);
    this.thresholdDb = clamp(percentile(samples, 0.9) + NOISE_MARGIN_DB, NOISE_THRESHOLD_RANGE);
  }

  stop() {
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.levelDb = -100;
  }
}
