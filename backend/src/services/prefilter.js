/**
 * Database pre-filter for recommendations (Stage 1).
 * Uses: category, tags.occasion vs activity, last_worn_date, and (when weather provided)
 * tags.warmth/breathability and tags.waterproof for warmth/rain filtering.
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

const COLD_THRESHOLD_C = 10;
const HOT_THRESHOLD_C = 25;
const RAIN_PROBABILITY_THRESHOLD = 0.5;
const RAIN_CATEGORIES = new Set(['jacket', 'footwear']);

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

/**
 * Exclude items worn within the last N days; sort by last_worn_date ascending
 * (null/oldest first) so less recently worn are preferred.
 * @param {Array<{ id: string, data: object }>} docs
 * @param {string} cutoffDate - YYYY-MM-DD; exclude if lastWornDate >= cutoff
 * @param {number} limit
 * @returns {Array<{ id: string, data: object }>}
 */
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

function applyRecencyAndSort(docs, cutoffDate, limit) {
  const filtered = docs.filter((d) => {
    const dateStr = toDateStr(d.data.lastWornDate);
    if (dateStr == null) return true;
    return dateStr < cutoffDate;
  });
  filtered.sort((a, b) => {
    const da = a.data.lastWornDate;
    const db = b.data.lastWornDate;
    if (da == null && db == null) return 0;
    if (da == null) return -1;
    if (db == null) return 1;
    const sa = toDateStr(da) ?? '';
    const sb = toDateStr(db) ?? '';
    return sa.localeCompare(sb);
  });
  return filtered.slice(0, limit);
}

/**
 * Filter docs by occasion: keep only if tags.occasion overlaps with allowed.
 * @param {Array<{ id: string, data: object }>} docs
 * @param {string[] | null} allowedOccasions - null = no filter
 * @returns {Array<{ id: string, data: object }>}
 */
function filterByOccasion(docs, allowedOccasions) {
  if (!allowedOccasions || allowedOccasions.length === 0) return docs;
  return docs.filter((d) => {
    const occ = d.data.tags?.occasion;
    if (!Array.isArray(occ)) return false;
    const set = new Set(occ.map((o) => String(o).toLowerCase()));
    return allowedOccasions.some((a) => set.has(a.toLowerCase()));
  });
}

/**
 * Filter by warmth band using feels_like (weather). Cold → warmth >= 3; Hot → warmth <= 2 and breathability >= 3; Mild → no filter.
 * @param {Array<{ id: string, data: object }>} docs
 * @param {{ feels_like_c: number } | null} weather - if null, no filter
 * @returns {Array<{ id: string, data: object }>}
 */
function filterByWarmth(docs, weather) {
  if (!weather || weather.feels_like_c == null) return docs;
  const feelsLike = Number(weather.feels_like_c);
  if (Number.isNaN(feelsLike)) return docs;

  return docs.filter((d) => {
    const tags = d.data.tags || {};
    const warmth = Number(tags.warmth);
    const breathability = Number(tags.breathability);
    const w = Number.isNaN(warmth) ? 3 : Math.min(5, Math.max(1, Math.round(warmth)));
    const b = Number.isNaN(breathability) ? 3 : Math.min(5, Math.max(1, Math.round(breathability)));

    if (feelsLike < COLD_THRESHOLD_C) return w >= 3;
    if (feelsLike > HOT_THRESHOLD_C) return w <= 2 && b >= 3;
    return true;
  });
}

/**
 * When rain/snow is significant, for jacket and footwear require waterproof; if 0 items, return original list.
 * @param {Array<{ id: string, data: object }>} docs
 * @param {string} category - single category (top, bottom, footwear) or 'optional' for mixed list
 * @param {{ is_rainy_or_snowy?: boolean, rain_probability?: number } | null} weather
 * @returns {Array<{ id: string, data: object }>}
 */
function filterByRain(docs, category, weather) {
  if (!weather) return docs;
  const isRainy = weather.is_rainy_or_snowy === true || (Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD);
  if (!isRainy) return docs;

  if (category === 'optional') {
    const rainOptionalCategories = new Set(['jacket', 'umbrella']);
    const filtered = docs.filter((d) => {
      const cat = d.data.category;
      if (!rainOptionalCategories.has(cat)) return true;
      return d.data.tags?.waterproof === true;
    });
    return filtered.length > 0 ? filtered : docs;
  }

  if (!RAIN_CATEGORIES.has(category)) return docs;
  const waterproofOnly = docs.filter((d) => d.data.tags?.waterproof === true);
  return waterproofOnly.length > 0 ? waterproofOnly : docs;
}

/**
 * Fetch one non-negotiable slot: userId + category, then apply occasion, warmth, rain, recency.
 * If occasion filter yields 0 items, drop it; if rain filter yields 0 for jacket/footwear, drop it.
 * @param {string} userId
 * @param {string} category - top | bottom | footwear
 * @param {object} opts - { occasionFilter, cutoffDate, limitPerSlot, weather }
 * @returns {Promise<Array<object>>} API-shaped items for LLM
 */
async function getSlotCandidates(userId, category, opts) {
  const { occasionFilter, cutoffDate, limitPerSlot, weather } = opts;
  const ref = db()
    .collection(WARDROBE_ITEMS)
    .where('userId', '==', userId)
    .where('category', '==', category);
  const snap = await ref.get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

  if (DEBUG) console.log(`[prefilter] slot=${category} DB query: userId + category=${category} → ${docs.length} docs`);

  let filtered = filterByOccasion(docs, occasionFilter);
  const occasionDropped = filtered.length === 0 && occasionFilter != null;
  if (occasionDropped) filtered = docs;
  if (DEBUG) {
    const occLabel = occasionFilter ? `allowed [${occasionFilter.join(', ')}]` : 'none';
    console.log(
      `[prefilter] slot=${category} occasion: ${occLabel} → ${occasionDropped ? '0 matches, using all' : `${docs.length} → ${filtered.length}`}`
    );
  }

  const beforeWarmth = filtered.length;
  filtered = filterByWarmth(filtered, weather);
  if (DEBUG && weather && weather.feels_like_c != null) {
    const fl = Number(weather.feels_like_c);
    let cond = 'mild (no filter)';
    if (fl < COLD_THRESHOLD_C) cond = `cold → warmth>=3`;
    else if (fl > HOT_THRESHOLD_C) cond = `hot → warmth<=2 & breathability>=3`;
    console.log(`[prefilter] slot=${category} warmth: feels_like=${fl}°C → ${cond} → ${beforeWarmth} → ${filtered.length}`);
  }

  const beforeRain = filtered.length;
  filtered = filterByRain(filtered, category, weather);
  if (DEBUG && weather) {
    const isRainy =
      weather.is_rainy_or_snowy === true ||
      (Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD);
    if (isRainy)
      console.log(
        `[prefilter] slot=${category} rain: require waterproof for ${RAIN_CATEGORIES.has(category) ? category : 'n/a'} → ${beforeRain} → ${filtered.length}`
      );
  }

  const beforeRecency = filtered.length;
  const withRecency = applyRecencyAndSort(filtered, cutoffDate, limitPerSlot);
  if (DEBUG)
    console.log(
      `[prefilter] slot=${category} recency: cutoff=${cutoffDate}, limit=${limitPerSlot} → ${beforeRecency} → ${withRecency.length}`
    );
  return mapDocsToApiItems(withRecency, category);
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
 * Fetch optional categories (thermal, jacket, etc.) in one query, then filter by occasion, warmth, rain (jacket), recency.
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

  let filtered = filterByOccasion(docs, occasionFilter);
  if (filtered.length === 0 && occasionFilter != null) filtered = docs;
  if (DEBUG) {
    const occLabel = occasionFilter ? `allowed [${occasionFilter.join(', ')}]` : 'none';
    console.log(`[prefilter] slot=optional occasion: ${occLabel} → ${docs.length} → ${filtered.length}`);
  }

  const beforeWarmth = filtered.length;
  filtered = filterByWarmth(filtered, weather);
  if (DEBUG && weather && weather.feels_like_c != null) {
    const fl = Number(weather.feels_like_c);
    let cond = 'mild (no filter)';
    if (fl < COLD_THRESHOLD_C) cond = `cold → warmth>=3`;
    else if (fl > HOT_THRESHOLD_C) cond = `hot → warmth<=2 & breathability>=3`;
    console.log(`[prefilter] slot=optional warmth: feels_like=${fl}°C → ${cond} → ${beforeWarmth} → ${filtered.length}`);
  }

  const beforeRain = filtered.length;
  filtered = filterByRain(filtered, 'optional', weather);
  if (DEBUG && weather) {
    const isRainy =
      weather.is_rainy_or_snowy === true ||
      (Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD);
    if (isRainy)
      console.log(
        `[prefilter] slot=optional rain: require waterproof for jacket/umbrella → ${beforeRain} → ${filtered.length}`
      );
  }

  const beforeRecency = filtered.length;
  const withRecency = applyRecencyAndSort(filtered, cutoffDate, limitPerSlot);
  if (DEBUG)
    console.log(
      `[prefilter] slot=optional recency: cutoff=${cutoffDate}, limit=${limitPerSlot} → ${beforeRecency} → ${withRecency.length}`
    );
  return mapDocsToApiItems(withRecency, 'optional');
}

/**
 * Get pre-filtered candidate sets per slot for the LLM (Stage 1).
 * @param {string} userId
 * @param {object} [options]
 * @param {string} [options.activity] - e.g. gym, office, casual
 * @param {string} [options.date] - ISO date YYYY-MM-DD; default today
 * @param {number} [options.limitPerSlot] - max items per slot; default 15
 * @param {number} [options.excludeLastNDays] - exclude items worn in last N days; default 2
 * @param {object} [options.weather] - from weather service; enables warmth + rain pre-filter
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
      `recency: cutoff=${cutoffDate} (exclude items worn on or after), limit_per_slot=${limitPerSlot}`,
      occasionFilter
        ? `occasion: activity → allowed tags [${occasionFilter.join(', ')}]`
        : 'occasion: none (any)',
    ];
    if (weather) {
      const feelsLike = weather.feels_like_c;
      let warmthCond = 'none (mild)';
      if (feelsLike != null && !Number.isNaN(Number(feelsLike))) {
        if (Number(feelsLike) < COLD_THRESHOLD_C) warmthCond = `cold (feels_like ${feelsLike}°C) → require warmth>=3`;
        else if (Number(feelsLike) > HOT_THRESHOLD_C) warmthCond = `hot (feels_like ${feelsLike}°C) → require warmth<=2 and breathability>=3`;
      }
      const isRainy =
        weather.is_rainy_or_snowy === true ||
        (Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD);
      const rainCond = isRainy
        ? 'rain/snow → require waterproof for jacket & footwear (and jacket/umbrella in optional)'
        : 'no rain filter';
      filtersApplied.push(`warmth: ${warmthCond}`);
      filtersApplied.push(`rain: ${rainCond}`);
    } else {
      filtersApplied.push('weather: none → no warmth/rain conditions');
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
