/**
 * main.js
 * Entry point. Connects the screens in order:
 * title → the guard's senses → briefing → heist → busted or getaway → hideout.
 */
import * as museum from './museum.js';
import * as sound from './sound.js';
import * as voice from './voice.js';
import * as storage from './storage.js';
import { MotionSensor, NoiseSensor, mediaErrorMessage } from './sensors.js';
import { Heist, REASONS } from './heist.js';
import { HeistView } from './heist-view.js';
import { HeistInput } from './input.js';
import { captureFrame, drawMugshot } from './mugshot.js';
import {
  showScreen,
  fillWallLabel,
  showPainting,
  watchImages,
  setMeter,
  formatDate,
  plural,
} from './ui.js';

const CALIBRATION_MS = 2000;
const GETAWAY_DELAY_MS = 1400;
const BUSTED_DELAY_MS = 1100;
const CONFIRM_RESET_MS = 4000;

const byId = (id) => document.getElementById(id);

const el = {
  homeLink: byId('home-link'),
  hideoutLink: byId('hideout-link'),
  hideoutCount: byId('hideout-count'),
  soundToggle: byId('sound-toggle'),
  recordLine: byId('record-line'),
  planButton: byId('plan-button'),
  titleHideoutButton: byId('title-hideout-button'),

  senseCamera: byId('sense-camera'),
  setupVideo: byId('setup-video'),
  cameraMeter: byId('camera-meter'),
  cameraStatus: byId('camera-status'),
  cameraButton: byId('camera-button'),
  senseMic: byId('sense-mic'),
  micMeter: byId('mic-meter'),
  micStatus: byId('mic-status'),
  micButton: byId('mic-button'),
  modeSummary: byId('mode-summary'),
  chooseTargetButton: byId('choose-target-button'),

  briefingLoading: byId('briefing-loading'),
  briefingError: byId('briefing-error'),
  briefingErrorMessage: byId('briefing-error-message'),
  retryButton: byId('retry-button'),
  briefingBody: byId('briefing-body'),
  briefingImage: byId('briefing-image'),
  briefingLabel: byId('briefing-label'),
  briefingLevel: byId('briefing-level'),
  briefingEssential: byId('briefing-essential'),
  startHeistButton: byId('start-heist-button'),
  rerollButton: byId('reroll-button'),
  changeSensesButton: byId('change-senses-button'),

  heistScreen: byId('screen-heist'),
  heistVideo: byId('heist-video'),
  sneakButton: byId('sneak-button'),
  abortButton: byId('abort-button'),

  caughtReason: byId('caught-reason'),
  chargeLabel: byId('charge-label'),
  mugshotCanvas: byId('mugshot-canvas'),
  retryHeistButton: byId('retry-heist-button'),
  newTargetButton: byId('new-target-button'),
  downloadMugshot: byId('download-mugshot'),

  escapedSummary: byId('escaped-summary'),
  escapedImage: byId('escaped-image'),
  escapedLabel: byId('escaped-label'),
  nextHeistButton: byId('next-heist-button'),
  escapedHideoutButton: byId('escaped-hideout-button'),

  hideoutSummary: byId('hideout-summary'),
  hideoutGrid: byId('hideout-grid'),
  hideoutEmpty: byId('hideout-empty'),
  hideoutPlanButton: byId('hideout-plan-button'),
  returnAllButton: byId('return-all-button'),
};

const motion = new MotionSensor();
const noise = new NoiseSensor();
const view = new HeistView(el.heistScreen);

const game = {
  level: 1,
  painting: null,
  heist: null,
  input: null,
  outcome: null, // Token for the busted/getaway screen that's about to appear.
  setupFrame: 0,
  briefingRequest: 0,
  mugshotUrl: null,
  confirmTimer: null,
};

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/* ---------- Navigation ---------- */

function stopHeist() {
  game.heist?.stop();
  game.heist = null;
  game.input?.detach();
  game.input = null;
  view.stop();
}

function goTo(screenId) {
  game.outcome = null;
  if (screenId !== 'screen-heist') stopHeist();
  showScreen(screenId);
  monitorSenses(screenId === 'screen-setup');
}

function updateRecord() {
  const stolen = storage.getHideout().length;
  const arrests = storage.getArrests();
  el.hideoutCount.textContent = String(stolen);
  el.recordLine.textContent = stolen || arrests
    ? `Your record so far: ${plural(stolen, 'painting')} lifted, ${plural(arrests, 'arrest')}.`
    : 'No record yet. Keep it that way.';
}

function applySound(isOn) {
  sound.setMuted(!isOn);
  voice.setVoiceEnabled(isOn);
  el.soundToggle.textContent = isOn ? 'Mute sound' : 'Turn sound on';
}

function toggleSound() {
  const isOn = !storage.isSoundOn();
  storage.setSoundOn(isOn);
  applySound(isOn);
}

/* ---------- The guard's senses ---------- */

function setSense(card, status, state, message) {
  card.dataset.state = state;
  status.textContent = message;
}

function updateModeSummary() {
  const eyes = motion.isOn;
  const ears = noise.isOn;
  if (eyes && ears) {
    el.modeSummary.textContent = 'Full game: he can see and hear you.';
  } else if (eyes) {
    el.modeSummary.textContent = 'He can see you, but he can’t hear you.';
  } else if (ears) {
    el.modeSummary.textContent = 'He can hear you, but he can’t see you.';
  } else {
    el.modeSummary.textContent = 'Keyboard only: any key press, click, or mouse movement while he’s looking can give you away.';
  }
}

function turnOffCamera() {
  motion.stop();
  el.setupVideo.srcObject = null;
  el.heistVideo.srcObject = null;
  setSense(el.senseCamera, el.cameraStatus, 'off', 'Off. He can’t see you move.');
  el.cameraButton.textContent = 'Turn on camera';
}

function turnOffMic() {
  noise.stop();
  setSense(el.senseMic, el.micStatus, 'off', 'Off. He can’t hear you.');
  el.micButton.textContent = 'Turn on microphone';
}

async function toggleCamera() {
  if (motion.isOn) {
    turnOffCamera();
    updateModeSummary();
    return;
  }

  el.cameraButton.disabled = true;
  setSense(el.senseCamera, el.cameraStatus, 'waiting', 'Waiting for your permission…');
  try {
    await motion.start();
    await motion.watchThrough(el.setupVideo);
    setSense(el.senseCamera, el.cameraStatus, 'calibrating', 'Hold still for two seconds while he memorizes the room…');
    await motion.calibrate(CALIBRATION_MS);
    setSense(el.senseCamera, el.cameraStatus, 'on', 'Ready. He’ll notice if you move.');
    el.cameraButton.textContent = 'Turn off camera';
  } catch (error) {
    turnOffCamera();
    setSense(el.senseCamera, el.cameraStatus, 'blocked', `${mediaErrorMessage(error, 'camera')} You can still play. He just won’t see you.`);
  } finally {
    el.cameraButton.disabled = false;
    updateModeSummary();
  }
}

async function toggleMic() {
  if (noise.isOn) {
    turnOffMic();
    updateModeSummary();
    return;
  }

  // Created during the click, because browsers only allow audio after a user gesture.
  const audioContext = sound.getAudioContext();
  el.micButton.disabled = true;
  setSense(el.senseMic, el.micStatus, 'waiting', 'Waiting for your permission…');
  try {
    await noise.start(audioContext);
    setSense(el.senseMic, el.micStatus, 'calibrating', 'Stay quiet for two seconds while he learns how the room sounds…');
    await noise.calibrate(CALIBRATION_MS);
    setSense(el.senseMic, el.micStatus, 'on', 'Ready. He’ll hear anything louder than the room.');
    el.micButton.textContent = 'Turn off microphone';
  } catch (error) {
    turnOffMic();
    setSense(el.senseMic, el.micStatus, 'blocked', `${mediaErrorMessage(error, 'microphone')} You can still play. He just won’t hear you.`);
  } finally {
    el.micButton.disabled = false;
    updateModeSummary();
  }
}

/** Keeps the setup meters live so players can see what the guard notices. */
function monitorSenses(isActive) {
  cancelAnimationFrame(game.setupFrame);
  if (!isActive) return;
  const step = (now) => {
    if (motion.isOn) {
      motion.sample(now);
      setMeter(el.cameraMeter, motion.reading, motion.excess > 0);
    }
    if (noise.isOn) {
      noise.sample();
      setMeter(el.micMeter, noise.reading, noise.excess > 0);
    }
    game.setupFrame = requestAnimationFrame(step);
  };
  game.setupFrame = requestAnimationFrame(step);
}

/* ---------- Briefing ---------- */

function renderBriefing(painting) {
  el.briefingLoading.hidden = true;
  el.briefingError.hidden = true;
  el.briefingBody.hidden = false;
  showPainting(el.briefingImage, painting, 843);
  fillWallLabel(el.briefingLabel, painting);
  el.briefingLevel.textContent = `Heist ${game.level}`;
  el.briefingEssential.hidden = !painting.isEssential;
}

async function openBriefing({ newTarget }) {
  goTo('screen-briefing');
  if (!newTarget && game.painting) {
    renderBriefing(game.painting);
    return;
  }

  const request = ++game.briefingRequest;
  el.briefingBody.hidden = true;
  el.briefingError.hidden = true;
  el.briefingLoading.hidden = false;

  try {
    const excluded = storage.stolenIds();
    if (game.painting) excluded.add(game.painting.id);
    const painting = await museum.nextTarget(excluded);
    if (request !== game.briefingRequest) return;
    game.painting = painting;
    renderBriefing(painting);
  } catch (error) {
    if (request !== game.briefingRequest) return;
    el.briefingLoading.hidden = true;
    el.briefingErrorMessage.textContent = error instanceof museum.MuseumError
      ? error.message
      : 'Something went wrong while choosing a painting. Try again.';
    el.briefingError.hidden = false;
  }
}

/* ---------- The heist ---------- */

function startHeist() {
  const { painting } = game;
  if (!painting) return;
  sound.getAudioContext(); // Unlock audio during this click.
  goTo('screen-heist');

  const eyes = motion.isOn;
  const ears = noise.isOn;
  const keyboardOnly = !eyes && !ears;
  view.reset({ painting, level: game.level, eyes, ears, keyboardOnly });
  if (eyes) motion.watchThrough(el.heistVideo);

  game.input = new HeistInput(el.sneakButton, {
    onPress: (kind) => game.heist?.notePress(kind),
    onMove: (distance) => game.heist?.noteMovement(distance),
  });
  game.heist = new Heist({
    painting,
    level: game.level,
    motion: eyes ? motion : null,
    noise: ears ? noise : null,
    input: game.input,
    keyboardOnly,
    onPhase: (phase, durationMs) => view.setPhase(phase, durationMs),
    onFrame: (frame) => view.update(frame),
    onLine: (line) => view.showLine(line),
    onEnd: (result) => finishHeist(painting, result),
  });
  game.input.attach();
  game.heist.start();
}

function bookingNumber(date, arrests) {
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `${day}-${String(arrests).padStart(3, '0')}`;
}

async function offerMugshotDownload() {
  const blob = await new Promise((resolve, reject) => {
    try {
      el.mugshotCanvas.toBlob(resolve, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
  if (!blob) return;
  if (game.mugshotUrl) URL.revokeObjectURL(game.mugshotUrl);
  game.mugshotUrl = URL.createObjectURL(blob);
  el.downloadMugshot.href = game.mugshotUrl;
  el.downloadMugshot.hidden = false;
}

async function renderMugshot(painting, snapshot, arrests) {
  el.downloadMugshot.hidden = true;
  const date = new Date();
  try {
    await drawMugshot(el.mugshotCanvas, {
      snapshot,
      painting,
      date,
      evidenceUrl: museum.imageUrl(painting, 400),
      bookingNumber: bookingNumber(date, arrests),
    });
    el.mugshotCanvas.setAttribute('aria-label', snapshot
      ? `Your booking photo in front of a height chart, holding a placard for the attempted theft of ${painting.title}.`
      : `A sketch of a masked suspect in front of a height chart, with a placard for the attempted theft of ${painting.title}.`);
    await offerMugshotDownload();
  } catch {
    // The booking photo is a bonus. The busted screen still works without it.
  }
}

function showBusted(painting, result) {
  el.caughtReason.textContent = REASONS[result.reason] ?? 'He caught you.';
  fillWallLabel(el.chargeLabel, painting);
  goTo('screen-caught');
}

function showGetaway(painting, result) {
  const seconds = Math.max(1, Math.round(result.durationMs / 1000));
  showPainting(el.escapedImage, painting, 843);
  fillWallLabel(el.escapedLabel, painting, {
    location: painting.gallery ? `Formerly on view in ${painting.gallery}` : 'Formerly in storage',
    credit: `Acquired without permission, ${formatDate(new Date())}`,
  });
  el.escapedSummary.textContent = `You lifted it in ${plural(seconds, 'second')}. It’s hanging in your hideout now.`;
  goTo('screen-escaped');
}

function finishHeist(painting, result) {
  // Grab the webcam frame first: this is the moment of the mugshot.
  const snapshot = result.outcome === 'caught' && motion.isOn ? captureFrame(el.heistVideo) : null;
  game.input?.detach();
  game.input = null;
  game.heist = null;
  const token = {};
  game.outcome = token;

  if (result.outcome === 'escaped') {
    view.playStolen();
    sound.chime();
    storage.addToHideout(painting, { stolenAt: new Date().toISOString() });
    game.level += 1;
    game.painting = null;
    updateRecord();
    wait(GETAWAY_DELAY_MS).then(() => {
      if (game.outcome === token) showGetaway(painting, result);
    });
    return;
  }

  view.playBusted();
  sound.shutter();
  sound.alarm();
  const arrests = storage.recordArrest();
  updateRecord();
  Promise.all([renderMugshot(painting, snapshot, arrests), wait(BUSTED_DELAY_MS)]).then(() => {
    if (game.outcome === token) showBusted(painting, result);
  });
}

/* ---------- Hideout ---------- */

function renderLoot(item) {
  const entry = document.createElement('li');
  const figure = document.createElement('figure');
  figure.className = 'artwork';
  const frame = document.createElement('div');
  frame.className = 'gilt-frame';
  const image = document.createElement('img');
  image.loading = 'lazy';
  image.decoding = 'async';
  frame.append(image);

  const label = document.createElement('figcaption');
  label.className = 'wall-label';
  fillWallLabel(label, item, {
    location: item.gallery ? `Lifted from ${item.gallery}` : 'Lifted from storage',
    credit: `Acquired without permission, ${formatDate(new Date(item.stolenAt))}`,
  });
  const link = document.createElement('a');
  link.className = 'label-link';
  link.href = museum.artworkPageUrl(item);
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'See where it really hangs';
  label.append(link);

  figure.append(frame, label);
  entry.append(figure);
  showPainting(image, item, 400);
  return entry;
}

function resetReturnButton() {
  clearTimeout(game.confirmTimer);
  game.confirmTimer = null;
  el.returnAllButton.textContent = 'Return every painting';
}

function renderHideout() {
  const items = storage.getHideout();
  const arrests = storage.getArrests();
  el.hideoutGrid.replaceChildren(...items.map(renderLoot));
  el.hideoutGrid.hidden = items.length === 0;
  el.hideoutEmpty.hidden = items.length > 0;
  el.returnAllButton.hidden = items.length === 0;
  el.hideoutSummary.textContent = items.length
    ? `${plural(items.length, 'painting')} lifted, ${plural(arrests, 'arrest')} on your record.`
    : 'Bare walls, for now.';
  resetReturnButton();
}

function openHideout() {
  renderHideout();
  goTo('screen-hideout');
}

function returnEverything() {
  if (!game.confirmTimer) {
    el.returnAllButton.textContent = 'Click again to return them all';
    game.confirmTimer = setTimeout(resetReturnButton, CONFIRM_RESET_MS);
    return;
  }
  storage.emptyHideout();
  updateRecord();
  renderHideout();
  byId('hideout-heading').focus();
}

/* ---------- Start up ---------- */

function bindEvents() {
  el.homeLink.addEventListener('click', (event) => {
    event.preventDefault();
    goTo('screen-title');
  });
  el.hideoutLink.addEventListener('click', openHideout);
  el.titleHideoutButton.addEventListener('click', openHideout);
  el.escapedHideoutButton.addEventListener('click', openHideout);
  el.soundToggle.addEventListener('click', toggleSound);

  el.planButton.addEventListener('click', () => goTo('screen-setup'));
  el.hideoutPlanButton.addEventListener('click', () => goTo('screen-setup'));
  el.cameraButton.addEventListener('click', toggleCamera);
  el.micButton.addEventListener('click', toggleMic);
  el.chooseTargetButton.addEventListener('click', () => openBriefing({ newTarget: !game.painting }));

  el.retryButton.addEventListener('click', () => openBriefing({ newTarget: true }));
  el.rerollButton.addEventListener('click', () => openBriefing({ newTarget: true }));
  el.changeSensesButton.addEventListener('click', () => goTo('screen-setup'));
  el.startHeistButton.addEventListener('click', startHeist);
  el.abortButton.addEventListener('click', () => openBriefing({ newTarget: false }));

  el.retryHeistButton.addEventListener('click', startHeist);
  el.newTargetButton.addEventListener('click', () => openBriefing({ newTarget: true }));
  el.nextHeistButton.addEventListener('click', () => openBriefing({ newTarget: true }));
  el.returnAllButton.addEventListener('click', returnEverything);

  // Switching tabs mid-heist trips the alarm.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.heist?.noteHidden();
  });
  // Turn the camera light off when the player leaves.
  window.addEventListener('pagehide', () => {
    turnOffCamera();
    turnOffMic();
    updateModeSummary();
  });
}

function init() {
  watchImages();
  bindEvents();
  applySound(storage.isSoundOn());
  updateRecord();
  updateModeSummary();
  museum.prepare();
}

init();
