/**
 * ui.js
 * Small DOM helpers shared by every screen: switching screens, filling museum
 * wall labels, loading framed paintings, and updating meters.
 */
import { imageUrl, describePainting } from './museum.js';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export function formatDate(date) {
  return dateFormat.format(date);
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Shows one screen, hides the others, and moves focus to the new screen's heading. */
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.hidden = screen.id !== id;
  });
  window.scrollTo(0, 0);
  document.querySelector(`#${id} [tabindex="-1"]`)?.focus({ preventScroll: true });
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function galleryLine(painting) {
  return painting.gallery ? `On view in ${painting.gallery}` : 'In storage tonight';
}

/**
 * Fills a museum-style wall label: artist, title and date, medium, and location.
 * `location` replaces the gallery line, and `credit` adds a credit line at the end.
 */
export function fillWallLabel(container, painting, { location, credit } = {}) {
  const artist = createElement('p', 'label-artist');
  artist.append(createElement('strong', null, painting.artist));
  if (painting.artistDetails) {
    artist.append(createElement('span', 'label-artist-details', painting.artistDetails));
  }

  const title = createElement('p', 'label-title');
  title.append(createElement('cite', null, painting.title));
  if (painting.date) title.append(`, ${painting.date}`);

  const lines = [artist, title];
  if (painting.medium) lines.push(createElement('p', 'label-medium', painting.medium));
  lines.push(createElement('p', 'label-location', location ?? galleryLine(painting)));
  if (credit) lines.push(createElement('p', 'label-credit', credit));

  container.replaceChildren(...lines);
}

/** Loads a painting into an <img> inside a .gilt-frame, with alt text and a blurred placeholder. */
export function showPainting(image, painting, width) {
  const frame = image.closest('.gilt-frame');
  if (frame) {
    const placeholder = painting.placeholder ? `url("${painting.placeholder.replaceAll('"', '%22')}")` : 'none';
    frame.style.setProperty('--placeholder', placeholder);
    frame.dataset.state = 'loading';
  }
  image.crossOrigin = 'anonymous'; // Lets the mugshot canvas reuse cached copies of the image.
  image.alt = describePainting(painting);
  image.width = width;
  image.height = Math.round(width / painting.aspectRatio);
  image.src = imageUrl(painting, width);
}

/** Marks every framed image as loaded or missing so its frame can show a fallback. */
export function watchImages() {
  const mark = (state) => (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.target.closest('.gilt-frame')?.setAttribute('data-state', state);
    }
  };
  // Image load and error events don't bubble, but they can be caught on the way down.
  document.addEventListener('load', mark('loaded'), true);
  document.addEventListener('error', mark('missing'), true);
}

/** Sets a .meter's fill (0–1) and whether it's past the danger line. */
export function setMeter(meter, level, isOver) {
  meter.style.setProperty('--level', level.toFixed(3));
  meter.dataset.over = String(isOver);
}
