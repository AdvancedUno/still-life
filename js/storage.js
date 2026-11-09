/**
 * storage.js
 * Remembers the hideout, the arrest record, and the sound setting between visits
 * using the Web Storage API (localStorage).
 */

const STORAGE_KEY = 'still-life/v1';

function defaults() {
  return { hideout: [], arrests: 0, soundOn: true };
}

function isPainting(item) {
  return item && typeof item.id === 'number' && typeof item.title === 'string' && typeof item.imageId === 'string';
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return defaults();
    return {
      hideout: Array.isArray(saved.hideout) ? saved.hideout.filter(isPainting) : [],
      arrests: Number.isInteger(saved.arrests) ? saved.arrests : 0,
      soundOn: saved.soundOn !== false,
    };
  } catch {
    return defaults();
  }
}

const memory = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Storage can be full or disabled (private browsing). Keep this visit's data in memory.
  }
}

export function getHideout() {
  return [...memory.hideout];
}

export function stolenIds() {
  return new Set(memory.hideout.map((painting) => painting.id));
}

export function addToHideout(painting, details) {
  memory.hideout = [
    { ...painting, ...details },
    ...memory.hideout.filter((item) => item.id !== painting.id),
  ];
  save();
}

export function emptyHideout() {
  memory.hideout = [];
  save();
}

export function recordArrest() {
  memory.arrests += 1;
  save();
  return memory.arrests;
}

export function getArrests() {
  return memory.arrests;
}

export function isSoundOn() {
  return memory.soundOn;
}

export function setSoundOn(value) {
  memory.soundOn = value;
  save();
}
