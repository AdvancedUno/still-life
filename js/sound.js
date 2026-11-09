/**
 * sound.js
 * Sound effects built with the Web Audio API, so there are no audio files to load:
 * the guard's footsteps, his shoe creaking as he turns, the alarm, the camera
 * shutter, and a chime for a clean getaway.
 */

const VOLUME = 0.8;

let context = null;
let master = null;
let noiseBuffer = null;
let muted = false;
let stepCount = 0;

function createNoiseBuffer(audioContext) {
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Creates (or wakes) the shared AudioContext. Browsers only allow this after
 * the player clicks or presses something, so call it from an event handler.
 */
export function getAudioContext() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(context.destination);
    noiseBuffer = createNoiseBuffer(context);
  }
  if (context.state === 'suspended') {
    context.resume().catch(() => {
      // Stays silent until the next click; the game works without sound.
    });
  }
  return context;
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, context.currentTime, 0.02);
}

/** Returns the context only when a sound can actually play right now. */
function ready() {
  return context && context.state === 'running' && !muted ? context : null;
}

function envelope(gain, start, peak, attack, release) {
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
}

function noiseBurst({ type, frequency, peak, attack, release, at = 0 }) {
  const audio = ready();
  if (!audio) return;
  const start = audio.currentTime + at;
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const gain = audio.createGain();
  envelope(gain, start, peak, attack, release);
  source.connect(filter).connect(gain).connect(master);
  source.start(start, Math.random() * 0.5);
  source.stop(start + attack + release + 0.02);
}

/** One heavy, muffled step in the next room. */
export function footstep() {
  stepCount += 1;
  noiseBurst({
    type: 'lowpass',
    frequency: stepCount % 2 ? 320 : 270,
    peak: 0.6,
    attack: 0.008,
    release: 0.16,
  });
}

/** A shoe squeaking on the parquet as he turns around. */
export function creak() {
  const audio = ready();
  if (!audio) return;
  const start = audio.currentTime;
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 18;
  filter.frequency.setValueAtTime(950, start);
  filter.frequency.exponentialRampToValueAtTime(420, start + 0.35);
  const gain = audio.createGain();
  envelope(gain, start, 0.5, 0.05, 0.35);
  source.connect(filter).connect(gain).connect(master);
  source.start(start);
  source.stop(start + 0.42);
}

/** The museum alarm: two alternating tones. */
export function alarm(durationSeconds = 2.4) {
  const audio = ready();
  if (!audio) return;
  const start = audio.currentTime;
  const oscillator = audio.createOscillator();
  oscillator.type = 'square';
  for (let beat = 0; beat * 0.3 < durationSeconds; beat += 1) {
    oscillator.frequency.setValueAtTime(beat % 2 ? 620 : 830, start + beat * 0.3);
  }
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1600;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03);
  gain.gain.setValueAtTime(0.16, start + durationSeconds - 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSeconds);
  oscillator.connect(filter).connect(gain).connect(master);
  oscillator.start(start);
  oscillator.stop(start + durationSeconds);
}

/** The booking camera: two quick clicks. */
export function shutter() {
  noiseBurst({ type: 'highpass', frequency: 2500, peak: 0.5, attack: 0.003, release: 0.04 });
  noiseBurst({ type: 'highpass', frequency: 1800, peak: 0.35, attack: 0.003, release: 0.06, at: 0.07 });
}

/** A soft rising chime for a clean getaway. */
export function chime() {
  const audio = ready();
  if (!audio) return;
  [659.25, 987.77, 1318.51].forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.12;
    const oscillator = audio.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const gain = audio.createGain();
    envelope(gain, start, 0.22, 0.02, 1.2);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + 1.25);
  });
}
