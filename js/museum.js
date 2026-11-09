/**
 * museum.js
 * Talks to the Art Institute of Chicago API and hands out heist targets:
 * public-domain paintings that are hanging in a gallery right now.
 * Docs: https://api.artic.edu/docs/
 */

const SEARCH_URL = 'https://api.artic.edu/api/v1/artworks/search';
const ARTWORK_PAGE_URL = 'https://www.artic.edu/artworks/';
const DEFAULT_IIIF_URL = 'https://www.artic.edu/iiif/2';
const PAINTING_TYPE_ID = 1;
const PAGE_SIZE = 60;
const MAX_RESULTS = 10000; // The API won't page past this many search results.
const REQUEST_TIMEOUT_MS = 10000;

// Note: the museum also asks apps to send an "AIC-User-Agent" header. A custom
// header triggers a CORS preflight, so test it in your browser before adding it.

const FIELDS = [
  'id',
  'title',
  'artist_title',
  'artist_display',
  'date_display',
  'medium_display',
  'image_id',
  'thumbnail',
  'gallery_title',
  'is_on_view',
  'is_boosted',
];

// Tonight's targets: public-domain paintings with an image, hanging in a gallery.
const ON_VIEW_FILTERS = [
  { term: { is_public_domain: true } },
  { term: { artwork_type_id: PAINTING_TYPE_ID } },
  { term: { is_on_view: true } },
  { exists: { field: 'image_id' } },
  { exists: { field: 'gallery_title' } },
];

// Backup plan if that search fails or comes back empty: any public-domain painting.
const ANY_PAINTING_FILTERS = [
  { term: { is_public_domain: true } },
  { term: { artwork_type_id: PAINTING_TYPE_ID } },
  { exists: { field: 'image_id' } },
];

const MESSAGES = {
  network: 'The museum’s collection couldn’t be reached. Check your connection, then try again.',
  timeout: 'The museum took too long to answer. Try again in a moment.',
  status: 'The museum’s collection is having trouble right now. Try again in a moment.',
  empty: 'Every painting we found is already in your hideout. Return a few to steal them again.',
};

export class MuseumError extends Error {
  constructor(kind, options) {
    super(MESSAGES[kind], options);
    this.name = 'MuseumError';
    this.kind = kind;
  }
}

let iiifUrl = DEFAULT_IIIF_URL;
let totalPages = null;
let pool = [];
let preparing = null;

function buildSearchUrl(filters, page) {
  // The API recommends sending the whole query as JSON in a single "params" value.
  const params = {
    query: { bool: { filter: filters } },
    fields: FIELDS,
    limit: PAGE_SIZE,
    page,
  };
  return `${SEARCH_URL}?params=${encodeURIComponent(JSON.stringify(params))}`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new MuseumError('status');
    }
    return await response.json();
  } catch (error) {
    if (error instanceof MuseumError) throw error;
    const kind = error.name === 'AbortError' ? 'timeout' : 'network';
    throw new MuseumError(kind, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

function aspectRatioOf(thumbnail) {
  const width = thumbnail?.width;
  const height = thumbnail?.height;
  return width > 0 && height > 0 ? width / height : 0.8;
}

/** Turns an API record into the small object the rest of the game uses. */
function toPainting(record) {
  // artist_display looks like "Georges Seurat\nFrench, 1859–1891".
  const [displayName, ...details] = (record.artist_display ?? '').split('\n');

  return {
    id: record.id,
    title: record.title || 'Untitled',
    artist: record.artist_title || displayName || 'Unknown artist',
    artistDetails: details.join(', '),
    date: record.date_display || '',
    medium: record.medium_display || '',
    gallery: record.is_on_view && record.gallery_title ? record.gallery_title : null,
    imageId: record.image_id,
    altText: record.thumbnail?.alt_text || null,
    placeholder: record.thumbnail?.lqip || null,
    aspectRatio: aspectRatioOf(record.thumbnail),
    isEssential: Boolean(record.is_boosted),
  };
}

async function fetchPage(filters, page) {
  const data = await fetchJson(buildSearchUrl(filters, page));
  if (data?.config?.iiif_url) iiifUrl = data.config.iiif_url;
  totalPages = data?.pagination?.total_pages ?? totalPages;
  return Array.isArray(data?.data) ? data.data.map(toPainting) : [];
}

function randomPage() {
  const lastPage = Math.max(1, Math.min(totalPages, Math.floor(MAX_RESULTS / PAGE_SIZE)));
  return 1 + Math.floor(Math.random() * lastPage);
}

async function refill(excludedIds) {
  let paintings = [];
  try {
    paintings = await fetchPage(ON_VIEW_FILTERS, totalPages ? randomPage() : 1);
  } catch {
    paintings = [];
  }
  if (paintings.length === 0) {
    paintings = await fetchPage(ANY_PAINTING_FILTERS, 1);
  }
  pool = paintings.filter((painting) => painting.imageId && !excludedIds.has(painting.id));
}

/** Starts loading targets early so the first briefing appears instantly. */
export function prepare() {
  if (!preparing) {
    preparing = refill(new Set()).finally(() => {
      preparing = null;
    });
    // Failures are reported when the player actually asks for a target.
    preparing.catch(() => {});
  }
  return preparing;
}

/** Picks a random painting that isn't already in the hideout. */
export async function nextTarget(excludedIds = new Set()) {
  if (preparing) {
    try {
      await preparing;
    } catch {
      // Ignore it here; the refill below tries again.
    }
  }

  let candidates = pool.filter((painting) => !excludedIds.has(painting.id));
  if (candidates.length === 0) {
    await refill(excludedIds);
    candidates = pool;
  }
  if (candidates.length === 0) {
    throw new MuseumError('empty');
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  pool = pool.filter((painting) => painting.id !== pick.id);
  return pick;
}

/** IIIF image URL. 843px is the museum's recommended (and most cached) size. */
export function imageUrl(painting, width = 843) {
  return `${iiifUrl}/${painting.imageId}/full/${width},/0/default.jpg`;
}

export function artworkPageUrl(painting) {
  return `${ARTWORK_PAGE_URL}${painting.id}`;
}

/** The museum writes alt text for most images; fall back to title and artist. */
export function describePainting(painting) {
  return painting.altText || `${painting.title}, a painting by ${painting.artist}`;
}
