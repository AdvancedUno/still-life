/**
 * mugshot.js
 * Draws the booking photo when you get caught: a height chart, your webcam frame
 * in high-contrast grayscale, a letter board with the charge, and the painting
 * pinned up as evidence. It's all drawn locally with the Canvas API.
 */

const WIDTH = 720;
const HEIGHT = 900;
const PHOTO = { x: 110, y: 70, size: 500 };
const PLACARD = { x: 160, y: 600, width: 400, height: 250 };
const CHART_TOP_INCHES = 80; // The top of the photo lines up with 6'8".
const PIXELS_PER_INCH = 17;
const SANS = 'Archivo, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Spectral, Georgia, serif';

const placardDateFormat = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

/** Grabs the webcam frame at the moment you're caught, before you can react. */
export function captureFrame(video) {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  const side = Math.min(video.videoWidth, video.videoHeight);
  const frame = document.createElement('canvas');
  frame.width = PHOTO.size;
  frame.height = PHOTO.size;
  const context = frame.getContext('2d');
  // Mirror it, so it matches the preview you were looking at.
  context.translate(PHOTO.size, 0);
  context.scale(-1, 1);
  context.drawImage(
    video,
    (video.videoWidth - side) / 2,
    (video.videoHeight - side) / 2,
    side,
    side,
    0,
    0,
    PHOTO.size,
    PHOTO.size,
  );
  return frame;
}

function loadImage(src, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    // The museum's image server allows cross-origin use, which keeps the canvas exportable.
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), timeoutMs);
    image.addEventListener('load', () => {
      clearTimeout(timer);
      resolve(image);
    });
    image.addEventListener('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    image.src = src;
  });
}

async function loadFonts() {
  if (!document.fonts?.load) return;
  const fonts = Promise.all([document.fonts.load(`700 34px ${SANS}`), document.fonts.load(`italic 18px ${SERIF}`)]);
  const timeout = new Promise((resolve) => {
    setTimeout(resolve, 1500);
  });
  try {
    await Promise.race([fonts, timeout]);
  } catch {
    // System fonts are fine for a booking photo.
  }
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
}

function shorten(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function drawHeightChart(context, opacity, clipToPhoto) {
  context.save();
  if (clipToPhoto) {
    context.beginPath();
    context.rect(PHOTO.x, PHOTO.y, PHOTO.size, PHOTO.size);
    context.clip();
  }
  context.globalAlpha = opacity;
  context.strokeStyle = '#2d2d2b';
  context.fillStyle = '#2d2d2b';
  context.font = `600 18px ${SANS}`;
  context.textBaseline = 'middle';

  for (let inches = CHART_TOP_INCHES; ; inches -= 1) {
    const y = PHOTO.y + (CHART_TOP_INCHES - inches) * PIXELS_PER_INCH;
    if (y > PLACARD.y - 10) break;
    const isMajor = inches % 6 === 0;
    context.lineWidth = isMajor ? 3 : 1;
    context.beginPath();
    context.moveTo(isMajor ? 20 : 64, y);
    context.lineTo(isMajor ? WIDTH - 20 : WIDTH - 64, y);
    context.stroke();

    if (isMajor && !clipToPhoto) {
      const label = `${Math.floor(inches / 12)}'${inches % 12}"`;
      context.textAlign = 'left';
      context.fillText(label, 22, y - 13);
      context.textAlign = 'right';
      context.fillText(label, WIDTH - 22, y - 13);
    }
  }
  context.restore();
}

function drawPhoto(context, snapshot) {
  const { x, y, size } = PHOTO;
  context.drawImage(snapshot, x, y, size, size);

  // High-contrast grayscale with a little film grain.
  const image = context.getImageData(x, y, size, size);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const value = (gray - 128) * 1.3 + 132 + (Math.random() - 0.5) * 22;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  context.putImageData(image, x, y);

  const center = size / 2;
  const vignette = context.createRadialGradient(x + center, y + center, size * 0.3, x + center, y + center, size * 0.75);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  context.fillStyle = vignette;
  context.fillRect(x, y, size, size);
}

/** No camera, no photo: the guard's sketch of a masked suspect instead. */
function drawSuspectSketch(context) {
  const { x, y, size } = PHOTO;
  const middle = x + size / 2;
  context.save();
  context.fillStyle = '#1f2120';
  context.beginPath();
  context.moveTo(x + 60, y + size);
  context.bezierCurveTo(x + 80, y + 330, x + size - 80, y + 330, x + size - 60, y + size);
  context.fill();
  context.fillRect(middle - 42, y + 290, 84, 100); // Neck
  context.beginPath();
  context.ellipse(middle, y + 215, 92, 118, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#e9e6dc';
  roundedRect(context, middle - 62, y + 188, 124, 32, 16);
  context.fill();
  context.fillStyle = '#1f2120';
  [-30, 30].forEach((offset) => {
    context.beginPath();
    context.arc(middle + offset, y + 204, 9, 0, Math.PI * 2);
    context.fill();
  });

  const caption = 'Camera off. Sketch by the guard.';
  context.font = `italic 22px ${SERIF}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const chipWidth = context.measureText(caption).width + 32;
  context.fillStyle = '#efede6';
  context.fillRect(middle - chipWidth / 2, y + size - 58, chipWidth, 38);
  context.fillStyle = '#3a3b39';
  context.fillText(caption, middle, y + size - 39);
  context.restore();
}

function drawPlacard(context, { painting, bookingNumber, date }) {
  const { x, y, width, height } = PLACARD;
  context.save();
  context.fillStyle = '#161616';
  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;
  context.fillRect(x, y, width, height);
  context.restore();

  // The grooves of a felt letter board.
  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  context.lineWidth = 1;
  for (let groove = y + 8; groove < y + height; groove += 8) {
    context.beginPath();
    context.moveTo(x + 6, groove);
    context.lineTo(x + width - 6, groove);
    context.stroke();
  }

  context.fillStyle = '#f2f1ec';
  context.textAlign = 'center';
  const center = x + width / 2;
  const maxWidth = width - 36;
  const lines = [
    [`700 34px ${SANS}`, 'STILL LIFE P.D.', 48],
    [`600 24px ${SANS}`, `NO. ${bookingNumber}`, 84],
    [`700 26px ${SANS}`, 'ATTEMPTED THEFT', 128],
    [`600 21px ${SANS}`, shorten(painting.title.toUpperCase(), 34), 162],
    [`600 21px ${SANS}`, (painting.gallery ?? 'Storage').toUpperCase(), 194],
    [`500 19px ${SANS}`, placardDateFormat.format(date), 228],
  ];
  lines.forEach(([font, text, offset]) => {
    context.font = font;
    // maxWidth squeezes long lines to fit, like crowding letters onto the board.
    context.fillText(text, center, y + offset, maxWidth);
  });
  context.restore();
}

/** The painting, pinned to the board like a Polaroid. */
function drawEvidence(context, image) {
  const size = 132;
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  context.save();
  context.translate(612, 108);
  context.rotate(0.09);
  context.shadowColor = 'rgba(0, 0, 0, 0.35)';
  context.shadowBlur = 12;
  context.shadowOffsetY = 6;
  context.fillStyle = '#fbfaf6';
  context.fillRect(-size / 2 - 10, -size / 2 - 10, size + 20, size + 46);
  context.shadowColor = 'transparent';
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    -size / 2,
    -size / 2,
    size,
    size,
  );
  context.fillStyle = '#3b3a36';
  context.font = `italic 18px ${SERIF}`;
  context.textAlign = 'center';
  context.fillText('Exhibit A', 0, size / 2 + 25);
  context.fillStyle = '#b3261e';
  context.beginPath();
  context.arc(0, -size / 2 - 2, 6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export async function drawMugshot(canvas, { snapshot, painting, evidenceUrl, bookingNumber, date }) {
  const [evidence] = await Promise.all([loadImage(evidenceUrl), loadFonts()]);
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  // The photo filter reads pixels back, so tell the browser to optimize for that.
  const context = canvas.getContext('2d', { willReadFrequently: true });

  context.fillStyle = '#cfcec6';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawHeightChart(context, 1, false);
  if (snapshot) {
    drawPhoto(context, snapshot);
  } else {
    drawSuspectSketch(context);
  }
  drawHeightChart(context, 0.28, true); // Faint chart lines across the photo itself.
  drawPlacard(context, { painting, bookingNumber, date });
  if (evidence) drawEvidence(context, evidence);
}
