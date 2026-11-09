/**
 * heist.js
 * The rules of one heist. The guard cycles through three phases:
 *   away     — his back is turned and you can hear his footsteps. Move.
 *   turning  — the footsteps stop. Let go of the sneak key.
 *   watching — he's looking. Any sneaking gets you caught on the spot, and
 *              movement (camera), noise (microphone), or fidgeting
 *              (keyboard-only mode) builds suspicion until he catches you.
 * This file decides what happens; heist-view.js draws it.
 */
import * as sound from './sound.js';
import * as voice from './voice.js';

const FIRST_WINDOW_MS = [3000, 4500];
const GRACE_MS = 220; // A human reaction time after he turns, before anything counts.
const STEP_INTERVAL_MS = 540;
const MAX_FRAME_SECONDS = 0.1;
const SUSPICION_LIMIT = 100;
const SUSPICIOUS_AT = 55;
const LINGER_MS = 900; // When something seems off, he keeps looking a little longer.
const MOVEMENT_RATE = 140; // Suspicion per second at full movement.
const NOISE_RATE = 160; // Suspicion per second at full noise.
const FIDGET_RATE = 0.12; // Suspicion per pixel of mouse movement (keyboard-only mode).
const CALM_RATE = 22; // Suspicion lost per second while his back is turned.
const CALM_WHILE_WATCHED = 6; // ...and while he's looking but you're perfectly still.

export const REASONS = {
  spotted: 'He saw you creeping across the floor.',
  movement: 'The gallery camera caught you moving.',
  noise: 'He heard you.',
  fidget: 'He saw your shadow twitch when you moved the mouse.',
  key: 'You pressed a key while he was looking.',
  click: 'You clicked while he was looking.',
  left: 'You left the building in the middle of the job.',
};

/** Later heists, and the museum's most famous paintings, get a sharper guard. */
export function difficultyFor(level, isEssential) {
  const step = Math.min(level - 1, 8);
  const strictness = isEssential ? 1.2 : 1;
  return {
    awayMs: [Math.max(1600, 3800 - step * 250), Math.max(2800, 6200 - step * 380)],
    turnMs: Math.max(380, 900 - step * 60) / strictness,
    watchMs: [(1700 + step * 160) * strictness, (3000 + step * 220) * strictness],
    sensitivity: (1 + step * 0.08) * strictness,
    speed: 0.072, // Share of the gallery you cross per second of sneaking.
  };
}

function randomBetween([min, max]) {
  return min + Math.random() * (max - min);
}

export class Heist {
  constructor({ painting, level, motion, noise, input, keyboardOnly, onPhase, onFrame, onLine, onEnd }) {
    this.rules = difficultyFor(level, painting.isEssential);
    this.motion = motion;
    this.noise = noise;
    this.input = input;
    this.keyboardOnly = keyboardOnly;
    this.onPhase = onPhase;
    this.onFrame = onFrame;
    this.onLine = onLine;
    this.onEnd = onEnd;

    this.progress = 0;
    this.suspicion = 0;
    this.blame = { movement: 0, noise: 0, fidget: 0 };
    this.pendingFidget = 0;
    this.phase = 'away';
    this.phaseEndsAt = 0;
    this.graceUntil = 0;
    this.nextStepAt = 0;
    this.lingered = false;
    this.running = false;
    this.frameId = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    const now = performance.now();
    this.running = true;
    this.startedAt = now;
    this.lastFrameAt = now;
    this.enterPhase('away', now, randomBetween(FIRST_WINDOW_MS));
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
    voice.hush();
  }

  /** Keyboard-only mode: any key press or click while he's looking. */
  notePress(kind) {
    if (this.keyboardOnly && this.isJudging(performance.now())) this.end('caught', kind);
  }

  /** Keyboard-only mode: the mouse stands in for the camera. */
  noteMovement(distance) {
    if (this.keyboardOnly && Number.isFinite(distance)) this.pendingFidget += distance;
  }

  /** The Page Visibility API reported that the player switched tabs. */
  noteHidden() {
    this.end('caught', 'left');
  }

  isJudging(now) {
    return this.running && this.phase === 'watching' && now >= this.graceUntil;
  }

  enterPhase(phase, now, durationMs) {
    this.phase = phase;
    this.phaseEndsAt = now + durationMs;

    if (phase === 'away') {
      this.nextStepAt = now + 250;
    } else if (phase === 'turning') {
      sound.creak();
    } else if (phase === 'watching') {
      this.graceUntil = now + GRACE_MS;
      this.lingered = false;
      if (Math.random() < 0.6) this.onLine(voice.say('turn'));
    }
    this.onPhase(phase, durationMs);
  }

  nextPhase(now) {
    const { awayMs, turnMs, watchMs } = this.rules;
    if (this.phase === 'away') {
      this.enterPhase('turning', now, turnMs);
    } else if (this.phase === 'turning') {
      this.enterPhase('watching', now, randomBetween(watchMs));
    } else {
      if (Math.random() < 0.35) this.onLine(voice.say('relax'));
      this.enterPhase('away', now, randomBetween(awayMs));
    }
  }

  readMovement(now) {
    if (!this.motion) return 0;
    this.motion.sample(now);
    return this.motion.excess;
  }

  readNoise() {
    if (!this.noise) return 0;
    this.noise.sample();
    return voice.isSpeaking() ? 0 : this.noise.excess;
  }

  raise(source, amount) {
    if (amount <= 0) return;
    const added = amount * this.rules.sensitivity;
    this.suspicion = Math.min(SUSPICION_LIMIT, this.suspicion + added);
    this.blame[source] += added;
  }

  calm(amount) {
    this.suspicion = Math.max(0, this.suspicion - amount);
  }

  mainSuspect() {
    return Object.entries(this.blame).sort((a, b) => b[1] - a[1])[0][0];
  }

  reactToSuspicion() {
    if (this.lingered || this.suspicion < SUSPICIOUS_AT) return;
    this.lingered = true;
    this.phaseEndsAt += LINGER_MS;
    this.onLine(voice.say(this.mainSuspect() === 'noise' ? 'noise' : 'movement'));
  }

  tick(now) {
    if (!this.running) return;
    const seconds = Math.min((now - this.lastFrameAt) / 1000, MAX_FRAME_SECONDS);
    this.lastFrameAt = now;

    if (now >= this.phaseEndsAt) this.nextPhase(now);

    const movement = this.readMovement(now);
    const loudness = this.readNoise();
    const fidget = this.pendingFidget;
    this.pendingFidget = 0;
    const sneaking = this.input.isSneaking;

    if (this.phase === 'away' && now >= this.nextStepAt) {
      sound.footstep();
      this.nextStepAt = now + STEP_INTERVAL_MS;
    }

    if (this.isJudging(now)) {
      if (sneaking) {
        this.end('caught', 'spotted');
        return;
      }
      this.raise('movement', movement * MOVEMENT_RATE * seconds);
      this.raise('noise', loudness * NOISE_RATE * seconds);
      this.raise('fidget', fidget * FIDGET_RATE);
      if (movement === 0 && loudness === 0 && fidget === 0) this.calm(CALM_WHILE_WATCHED * seconds);
      this.reactToSuspicion();
      if (this.suspicion >= SUSPICION_LIMIT) {
        this.end('caught', this.mainSuspect());
        return;
      }
    } else {
      if (sneaking && this.phase !== 'watching') {
        this.progress = Math.min(1, this.progress + this.rules.speed * seconds);
      }
      this.calm(CALM_RATE * seconds);
    }

    if (this.progress >= 1) {
      this.end('escaped');
      return;
    }

    this.onFrame({
      progress: this.progress,
      suspicion: this.suspicion / SUSPICION_LIMIT,
      sneaking: sneaking && this.phase !== 'watching',
      motion: this.motion?.reading ?? 0,
      noise: this.noise?.reading ?? 0,
      motionOver: movement > 0,
      noiseOver: loudness > 0,
    });
    this.frameId = requestAnimationFrame(this.tick);
  }

  end(outcome, reason = null) {
    if (!this.running) return;
    this.stop();
    if (outcome === 'caught') this.onLine(voice.say('caught'));
    this.onEnd({ outcome, reason, durationMs: performance.now() - this.startedAt });
  }
}
