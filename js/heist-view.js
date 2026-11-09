/**
 * heist-view.js
 * Draws a heist: the guard's pose and flashlight, the thief creeping along the
 * floor, the meters, and the status line. It only displays; heist.js decides.
 */
import { showPainting, setMeter } from './ui.js';

const GALLERY_LENGTH_FT = 70;
const CAPTION_MS = 2600;

const STATUS = {
  away: 'His back is turned. Move.',
  turning: 'The footsteps stopped. Let go.',
  watching: 'He’s looking. Don’t move.',
};

const feet = new Intl.NumberFormat('en-US', { style: 'unit', unit: 'foot', maximumFractionDigits: 0 });
const clockFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function sensesNote({ eyes, ears, keyboardOnly }) {
  if (keyboardOnly) {
    return 'Keyboard only tonight. Any key press or click while he’s looking gets you caught, and he notices your mouse moving.';
  }
  if (!eyes) return 'Camera off tonight, so he can only hear you.';
  if (!ears) return 'Microphone off tonight, so he can only see you.';
  return 'He can see and hear you.';
}

export class HeistView {
  constructor(root) {
    const find = (selector) => root.querySelector(selector);
    this.stage = find('#stage');
    this.number = find('#heist-number');
    this.target = find('#heist-target');
    this.location = find('#heist-location');
    this.image = find('#stage-image');
    this.caption = find('#guard-caption');
    this.status = find('#guard-status');
    this.suspicionMeter = find('#suspicion-meter');
    this.distance = find('#distance');
    this.distanceText = find('#distance-text');
    this.cctv = find('#cctv');
    this.clock = find('#cctv-clock');
    this.motionReadout = find('#motion-readout');
    this.motionMeter = find('#motion-meter');
    this.noiseReadout = find('#noise-readout');
    this.noiseMeter = find('#noise-meter');
    this.sensesNote = find('#senses-note');
    this.sneakButton = find('#sneak-button');

    this.lastPercent = -1;
    this.lastFeet = -1;
    this.captionTimer = null;
    this.clockTimer = null;
  }

  reset({ painting, level, eyes, ears, keyboardOnly }) {
    this.stop();
    this.stage.classList.remove('is-busted', 'is-stolen', 'is-sneaking');
    this.number.textContent = String(level);
    this.target.textContent = painting.title;
    this.location.textContent = painting.gallery
      ? `${painting.gallery}, Art Institute of Chicago`
      : 'Storage, Art Institute of Chicago';
    showPainting(this.image, painting, 400);

    this.cctv.hidden = !eyes;
    this.motionReadout.hidden = !eyes;
    this.noiseReadout.hidden = !ears;
    this.sensesNote.textContent = sensesNote({ eyes, ears, keyboardOnly });

    this.caption.textContent = '';
    this.caption.classList.remove('is-visible');
    this.lastPercent = -1;
    this.lastFeet = -1;
    this.setPhase('away', 0);
    this.update({
      progress: 0,
      suspicion: 0,
      sneaking: false,
      motion: 0,
      noise: 0,
      motionOver: false,
      noiseOver: false,
    });

    this.tickClock();
    this.clockTimer = setInterval(() => this.tickClock(), 1000);
  }

  setPhase(phase, durationMs) {
    this.stage.dataset.phase = phase;
    this.status.dataset.phase = phase;
    this.status.textContent = STATUS[phase];
    if (phase === 'turning') {
      // The guard's turn animation lasts exactly as long as the warning.
      this.stage.style.setProperty('--turn-ms', `${Math.round(durationMs)}ms`);
    }
  }

  update({ progress, suspicion, sneaking, motion, noise, motionOver, noiseOver }) {
    this.stage.style.setProperty('--progress', progress.toFixed(4));
    this.stage.style.setProperty('--suspicion', suspicion.toFixed(3));
    this.stage.classList.toggle('is-sneaking', sneaking);
    this.sneakButton.classList.toggle('is-held', sneaking);

    setMeter(this.suspicionMeter, suspicion, suspicion > 0.55);
    const percent = Math.round(suspicion * 100);
    if (percent !== this.lastPercent) {
      this.suspicionMeter.setAttribute('aria-valuenow', String(percent));
      this.lastPercent = percent;
    }

    const feetLeft = Math.ceil((1 - progress) * GALLERY_LENGTH_FT);
    if (feetLeft !== this.lastFeet) {
      const value = Math.round(progress * 100);
      this.distance.value = value;
      this.distance.textContent = `${value}%`;
      this.distanceText.textContent = feetLeft > 0 ? `${feet.format(feetLeft)} to go` : 'Within reach';
      this.lastFeet = feetLeft;
    }

    setMeter(this.motionMeter, motion, motionOver);
    setMeter(this.noiseMeter, noise, noiseOver);
  }

  showLine(line) {
    if (!line) return;
    clearTimeout(this.captionTimer);
    this.caption.textContent = `“${line}”`;
    this.caption.classList.add('is-visible');
    this.captionTimer = setTimeout(() => this.caption.classList.remove('is-visible'), CAPTION_MS);
  }

  playBusted() {
    this.stage.classList.remove('is-sneaking');
    this.stage.classList.add('is-busted');
    this.stopClock();
  }

  playStolen() {
    this.stage.classList.remove('is-sneaking');
    this.stage.classList.add('is-stolen');
    this.stage.style.setProperty('--progress', '1');
    this.distance.value = 100;
    this.distance.textContent = '100%';
    this.distanceText.textContent = 'Got it';
    this.stopClock();
  }

  tickClock() {
    this.clock.textContent = clockFormat.format(new Date());
  }

  stopClock() {
    clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  stop() {
    this.stopClock();
    clearTimeout(this.captionTimer);
  }
}
