/**
 * Database pre-filter for recommendations (Stage 1).
 * Uses: category, recency exclusion (hard filter — items worn within last N days are removed,
 * with fallback to all items if a slot would be emptied), tags.occasion vs activity (preference sort),
 * and tags.waterproof (preference sort when rainy). Warmth filtering handled by LLM (Stage 2).
 * See docs/weather-and-data-sources.md §3.
 */

const { getAdmin } = require('../config/firebase');
const { WARDROBE_ITEMS } = require('../config/collections');
const { toApiItem } = require('../utils/wardrobeMapper');

const db = () => getAdmin().firestore();
const DEBUG =
  process.env.DEBUG_PREFILTER === '1' ||
  process.env.DEBUG_RECOMMENDATIONS === '1' ||
  process.env.NODE_ENV !== 'production';

const RAIN_PROBABILITY_THRESHOLD = 0.5;

const NON_NEGOTIABLE = ['top', 'bottom', 'footwear'];
const OPTIONAL_CATEGORIES = [
  'thermal',
  'jacket',
  'scarf',
  'hat',
  'gloves',
  'facemask',
  'umbrella',
];

/**
 * Activity → allowed occasion tags. If null, no occasion filter (allow any).
 * @type {Record<string, string[] | null>}
 */
const ACTIVITY_OCCASION_MAP = {
  gym: ['athletic'],
  office: ['work', 'office', 'formal', 'smart_casual'],
  work: ['work', 'office', 'formal', 'smart_casual'],
  formal: ['formal', 'smart_casual'],
  outdoor: ['outdoor', 'casual'],
  outdoor_brunch: ['outdoor', 'casual'],
  casual: null, // allow all
};

const DEFAULT_LIMIT_PER_SLOT = 25;
const DEFAULT_EXCLUDE_LAST_N_DAYS = 2;
const SLOT_CATEGORY_ALIASES = {
  top: ['top', 'tops', 'shirt', 'tshirt', 'tee'],
  bottom: ['bottom', 'bottoms', 'pant', 'pants', 'jean', 'jeans', 'trouser', 'trousers'],
  footwear: ['footwear', 'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots'],
};

/**
 * Get allowed occasion tags for an activity (for DB pre-filter).
 * @param {string} [activity]
 * @returns {string[] | null} Allowed occasion values, or null = no filter
 */
function getOccasionFilter(activity) {
  if (!activity || typeof activity !== 'string') return null;
  const key = activity.trim().toLowerCase();
  return ACTIVITY_OCCASION_MAP[key] ?? null;
}

/**
 * Compute cutoff date: items worn on or after this date are excluded.
 * @param {string} todayISO - YYYY-MM-DD (can be empty/invalid; then uses today)
 * @param {number} excludeLastNDays - must be finite >= 0
 * @returns {string} YYYY-MM-DD
 */
function getRecencyCutoff(todayISO, excludeLastNDays) {
  const n = Math.max(0, Number.isFinite(excludeLastNDays) ? excludeLastNDays : DEFAULT_EXCLUDE_LAST_N_DAYS);
  const base =
    typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayISO.trim())
      ? todayISO.trim()
      : null;
  const d = base ? new Date(base + 'T12:00:00Z') : new Date();
  if (!d || Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() - n);
    return fallback.toISOString().slice(0, 10);
  }
  d.setUTCDate(d.getUTCDate() - n);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() - n);
    return fallback.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function toDateStr(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string') return val.slice(0, 10);
  try {
    const d = typeof val.toDate === 'function' ? val.toDate() : new Date(val);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Check if doc matches occasion (tags.occasion overlaps with allowed).
 * @param {{ data: object }} doc
 * @param {string[] | null} allowedOccasions - null = no filter, match all
 * @returns {boolean}
 */
function matchesOccasion(doc, allowedOccasions) {
  if (!allowedOccasions || allowedOccasions.length === 0) return true;
  const occ = doc.data.tags?.occasion;
  if (!Array.isArray(occ)) return false;
  const set = new Set(occ.map((o) => String(o).toLowerCase()));
  return allowedOccasions.some((a) => set.has(a.toLowerCase()));
}

/**
 * When rainy, should this item be preferred (waterproof)? Applies to footwear, and jacket/umbrella in optional.
 * @param {{ data: object }} doc
 * @param {string} slotCategory - top | bottom | footwear | optional
 * @param {{ is_rainy_or_snowy?: boolean, rain_probability?: number } | null} weather
 * @returns {boolean}
 */
function preferWaterproof(doc, slotCategory, weather) {
  if (!weather) return false;
  const isRainy = weather.is_rainy_or_snowy === true || (Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD);
  if (!isRainy) return false;

  if (slotCategory === 'footwear') return doc.data.tags?.waterproof === true;
  if (slotCategory === 'optional') {
    const cat = doc.data.category;
    if (cat === 'jacket' || cat === 'umbrella') return doc.data.tags?.waterproof === true;
  }
  return false;
}

/**
 * Sort docs by occasion, rain (when rainy), and recency preference (no items removed).
 * Occasion: items matching occasion come first.
 * Rain: when rainy, waterproof items first for footwear and jacket/umbrella.
 * Recency: less recently worn items come first. All items stay in the list.
 * @param {Array<{ id: string, data: object }>} docs
 * @param {string[] | null} allowedOccasions - null = no occasion preference
 * @param {number} limit
 * @param {object} [opts] - { weather, slotCategory }
 * @returns {Array<{ id: string, data: object }>}
 */
function sortByOccasionRecencyAndRainPreference(docs, allowedOccasions, limit, opts = {}) {
  const { weather, slotCategory } = opts;
  const sorted = [...docs].sort((a, b) => {
    // Primary: occasion match (matching items first)
    const matchA = matchesOccasion(a, allowedOccasions) ? 1 : 0;
    const matchB = matchesOccasion(b, allowedOccasions) ? 1 : 0;
    if (matchB !== matchA) return matchB - matchA;

    // Secondary: rain preference when rainy (waterproof first for footwear, jacket, umbrella)
    const rainA = preferWaterproof(a, slotCategory, weather) ? 1 : 0;
    const rainB = preferWaterproof(b, slotCategory, weather) ? 1 : 0;
    if (rainB !== rainA) return rainB - rainA;

    // Tertiary: recency (less recently worn first; null = never worn = best)
    const da = toDateStr(a.data.lastWornDate);
    const db = toDateStr(b.data.lastWornDate);
    if (da == null && db == null) return 0;
    if (da == null) return -1;
    if (db == null) return 1;
    return da.localeCompare(db);
  });
  return sorted.slice(0, limit);
}

/**
 * Fetch one non-negotiable slot: userId + category, apply recency exclusion (hard filter),
 * then sort by occasion+rain+recency preference.
 * Recency exclusion: items worn on or after cutoffDate are removed. If that empties the slot,
 * the filter is dropped and all items are used so the LLM always has something to work with.
 * @param {string} userId
 * @param {string} category - top | bottom | footwear
 * @param {object} opts - { occasionFilter, cutoffDate, limitPerSlot, weather }
 * @returns {Promise<Array<object>>} API-shaped items for LLM
 */
async function getSlotCandidates(userId, category, opts) {
  const { occasionFilter, cutoffDate, limitPerSlot, weather } = opts;
  let docs = await fetchDocsByCategory(userId, category);

  // Backward compatibility for older or inconsistent category labels.
  if (docs.length === 0) {
    docs = await fetchDocsByAliases(userId, category);
  }

  if (DEBUG) console.log(`[prefilter] slot=${category} DB query: userId + category=${category} → ${docs.length} docs`);

  // Recency exclusion: remove items worn within the last N days (lastWornDate >= cutoffDate).
  // If all items are excluded, drop the filter so the LLM still receives candidates.
  let recencyFiltered = docs;
  if (cutoffDate) {
    const excluded = docs.filter((d) => {
      const worn = toDateStr(d.data.lastWornDate);
      return worn != null && worn >= cutoffDate;
    });
    const afterExclusion = docs.filter((d) => {
      const worn = toDateStr(d.data.lastWornDate);
      return worn == null || worn < cutoffDate;
    });
    if (afterExclusion.length > 0) {
      recencyFiltered = afterExclusion;
      if (DEBUG && excluded.length > 0) {
        console.log(`[prefilter] slot=${category} recency exclusion: removed ${excluded.length} worn on/after ${cutoffDate} → ${recencyFiltered.length} remain`);
      }
    } else if (DEBUG && excluded.length > 0) {
      console.log(`[prefilter] slot=${category} recency exclusion: all ${docs.length} items worn recently — dropping filter to preserve candidates`);
    }
  }

  // Occasion, rain, recency: preference-based sort (no further removal).
  const sorted = sortByOccasionRecencyAndRainPreference(recencyFiltered, occasionFilter, limitPerSlot, {
    weather,
    slotCategory: category,
  });
  if (DEBUG) {
    const occLabel = occasionFilter ? `prefer [${occasionFilter.join(', ')}]` : 'none';
    const rainLabel = weather && (weather.is_rainy_or_snowy === true || Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD)
      ? 'prefer waterproof'
      : 'none';
    console.log(
      `[prefilter] slot=${category} occasion+rain+recency sort: ${occLabel}, rain=${rainLabel} → ${recencyFiltered.length} → ${sorted.length}`
    );
  }
  return mapDocsToApiItems(sorted, category);
}

async function fetchDocsByCategory(userId, category) {
  const ref = db()
    .collection(WARDROBE_ITEMS)
    .where('userId', '==', userId)
    .where('category', '==', category);
  const snap = await ref.get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

async function fetchDocsByAliases(userId, slotCategory) {
  const aliases = SLOT_CATEGORY_ALIASES[slotCategory] || [slotCategory];
  const normalizedAliases = new Set(aliases.map((v) => String(v).toLowerCase()));
  const ref = db().collection(WARDROBE_ITEMS).where('userId', '==', userId);
  const snap = await ref.get();

  const out = [];
  for (const d of snap.docs) {
    const data = d.data() || {};
    const raw = data.category;
    const normalized = String(raw || '').trim().toLowerCase();
    if (normalizedAliases.has(normalized)) {
      out.push({ id: d.id, data });
    }
  }

  if (DEBUG && out.length > 0) {
    console.log(`[prefilter] slot=${slotCategory} alias fallback matched ${out.length} docs`);
  }

  return out;
}

/**
 * Map Firestore docs to API items; skip any that fail (missing/invalid fields) and log when DEBUG.
 */
function mapDocsToApiItems(docs, slotLabel) {
  const out = [];
  for (const d of docs) {
    try {
      out.push(toApiItem(d.id, d.data));
    } catch (err) {
      if (DEBUG) console.warn(`[prefilter] Skipping item ${d.id} (${slotLabel}):`, err.message);
    }
  }
  return out;
}

/**
 * Fetch optional categories (thermal, jacket, etc.) in one query, apply recency exclusion,
 * then sort by occasion+rain+recency preference.
 * @param {string} userId
 * @param {object} opts - { occasionFilter, cutoffDate, limitPerSlot, weather }
 * @returns {Promise<Array<object>>} API-shaped items for LLM
 */
async function getOptionalCandidates(userId, opts) {
  const { occasionFilter, cutoffDate, limitPerSlot, weather } = opts;
  const ref = db()
    .collection(WARDROBE_ITEMS)
    .where('userId', '==', userId)
    .where('category', 'in', OPTIONAL_CATEGORIES);
  const snap = await ref.get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

  if (DEBUG) console.log(`[prefilter] slot=optional DB query: userId + category in [${OPTIONAL_CATEGORIES.join(', ')}] → ${docs.length} docs`);

  // Recency exclusion: remove items worn within the last N days.
  // If all items are excluded, drop the filter so optional layer suggestions still work.
  let recencyFiltered = docs;
  if (cutoffDate) {
    const afterExclusion = docs.filter((d) => {
      const worn = toDateStr(d.data.lastWornDate);
      return worn == null || worn < cutoffDate;
    });
    if (afterExclusion.length > 0) {
      if (DEBUG && afterExclusion.length < docs.length) {
        console.log(`[prefilter] slot=optional recency exclusion: removed ${docs.length - afterExclusion.length} worn on/after ${cutoffDate} → ${afterExclusion.length} remain`);
      }
      recencyFiltered = afterExclusion;
    } else if (DEBUG && docs.length > 0) {
      console.log(`[prefilter] slot=optional recency exclusion: all ${docs.length} items worn recently — dropping filter`);
    }
  }

  // Occasion, rain, recency: preference-based sort only (no further removal).
  const sorted = sortByOccasionRecencyAndRainPreference(recencyFiltered, occasionFilter, limitPerSlot, {
    weather,
    slotCategory: 'optional',
  });
  if (DEBUG) {
    const occLabel = occasionFilter ? `prefer [${occasionFilter.join(', ')}]` : 'none';
    const rainLabel = weather && (weather.is_rainy_or_snowy === true || Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD)
      ? 'prefer waterproof (jacket/umbrella)'
      : 'none';
    console.log(
      `[prefilter] slot=optional occasion+rain+recency sort: ${occLabel}, rain=${rainLabel} → ${recencyFiltered.length} → ${sorted.length}`
    );
  }
  return mapDocsToApiItems(sorted, 'optional');
}

/**
 * Get pre-filtered candidate sets per slot for the LLM (Stage 1).
 * @param {string} userId
 * @param {object} [options]
 * @param {string} [options.activity] - e.g. gym, office, casual
 * @param {string} [options.date] - ISO date YYYY-MM-DD; default today
 * @param {number} [options.limitPerSlot] - max items per slot; default 15
 * @param {number} [options.excludeLastNDays] - exclude items worn in last N days; default 2
 * @param {object} [options.weather] - from weather service; enables rain pre-filter
 * @returns {Promise<{ top: object[], bottom: object[], footwear: object[], optional: object[] }>}
 */
async function getPreFilteredCandidates(userId, options = {}) {
  let dateOpt = options.date ? String(options.date).trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOpt)) {
    dateOpt = new Date().toISOString().slice(0, 10);
  }
  const limitPerSlot = Math.min(
    Math.max(1, Number(options.limitPerSlot) || DEFAULT_LIMIT_PER_SLOT),
    50
  );
  const excludeLastNDays = Math.max(0, Number(options.excludeLastNDays) ?? DEFAULT_EXCLUDE_LAST_N_DAYS);
  const cutoffDate = getRecencyCutoff(dateOpt, excludeLastNDays);
  const occasionFilter = getOccasionFilter(options.activity);
  const weather = options.weather || null;

  const opts = { occasionFilter, cutoffDate, limitPerSlot, weather };

  if (DEBUG) {
    const filtersApplied = [
      `recency exclusion: items worn on/after ${cutoffDate} removed (last ${excludeLastNDays} days); fallback to all items if slot would be empty`,
      `occasion+rain sort: preference-based, limit_per_slot=${limitPerSlot}`,
      occasionFilter
        ? `occasion: prefer tags [${occasionFilter.join(', ')}]`
        : 'occasion: none (any)',
    ];
    if (weather) {
      const isRainy =
        weather.is_rainy_or_snowy === true ||
        (Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD);
      const rainCond = isRainy
        ? 'rain: prefer waterproof for footwear, jacket, umbrella'
        : 'rain: none';
      filtersApplied.push(rainCond);
    } else {
      filtersApplied.push('weather: none → no rain preference');
    }
    console.log('[prefilter] getPreFilteredCandidates', { userId, dateOpt });
    console.log('[prefilter] filters applied:', filtersApplied);
  }

  const [top, bottom, footwear, optional] = await Promise.all([
    getSlotCandidates(userId, 'top', opts),
    getSlotCandidates(userId, 'bottom', opts),
    getSlotCandidates(userId, 'footwear', opts),
    getOptionalCandidates(userId, opts),
  ]);

  return { top, bottom, footwear, optional };
}

module.exports = {
  getPreFilteredCandidates,
  getOccasionFilter,
  getRecencyCutoff,
  NON_NEGOTIABLE,
  OPTIONAL_CATEGORIES,
};