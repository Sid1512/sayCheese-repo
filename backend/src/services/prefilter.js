/**
 * Database pre-filter for recommendations (Stage 1).
 *
 * Slot model:
 *   top_inner  — tops with layer='inner' (t-shirts, shirts, blouses). Mandatory.
 *   top_outer  — tops with layer='outer' (hoodies, cardigans, overshirts). Optional.
 *   bottom     — mandatory
 *   footwear   — mandatory (recency filter skipped — shoes repeat freely)
 *   optional   — accessories (scarves, hats, thermals, umbrellas, etc.)
 *
 * Existing items with layer=null default to 'inner' so nothing is lost.
 */

const { getAdminClient } = require('../config/supabase');
const { toApiItem } = require('../utils/wardrobeMapper');

const db = () => getAdminClient();
const DEBUG =
  process.env.DEBUG_PREFILTER === '1' ||
  process.env.DEBUG_RECOMMENDATIONS === '1' ||
  process.env.NODE_ENV !== 'production';

const RAIN_PROBABILITY_THRESHOLD = 0.5;

const MANDATORY_SLOTS = ['top_inner', 'bottom', 'footwear'];
const OPTIONAL_SLOT = 'top_outer'; // present only when weather/occasion warrants
const OPTIONAL_CATEGORIES = ['accessory'];

const ACTIVITY_OCCASION_MAP = {
  gym:    ['athletic'],
  work:   ['work', 'office', 'formal', 'smart_casual'],
  party:  ['party', 'formal', 'smart_casual'],
  casual: null,
};

const DEFAULT_LIMIT_PER_SLOT = 25;
// Weekly wear count limits — items worn more than this in the past 7 days are deprioritised
const INNER_MAX_WEARS_PER_WEEK = 2;  // t-shirts, shirts, bottoms
const OUTER_MAX_WEARS_PER_WEEK = 5;  // jackets, hoodies — repeat more freely

// ─────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────

function getOccasionFilter(activity) {
  if (!activity || typeof activity !== 'string') return null;
  return ACTIVITY_OCCASION_MAP[activity.trim().toLowerCase()] ?? null;
}

function getRecencyCutoff(todayISO, excludeLastNDays) {
  const n = Math.max(0, Number.isFinite(excludeLastNDays) ? excludeLastNDays : DEFAULT_EXCLUDE_LAST_N_DAYS);
  const base = typeof todayISO === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayISO.trim())
    ? todayISO.trim() : null;
  const d = base ? new Date(base + 'T12:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function toDateStr(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string') return val.slice(0, 10);
  try {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } catch { return null; }
}

function matchesOccasion(row, allowedOccasions) {
  if (!allowedOccasions || allowedOccasions.length === 0) return true;
  const occ = row.tags?.occasion;
  if (!Array.isArray(occ)) return false;
  const set = new Set(occ.map((o) => String(o).toLowerCase()));
  return allowedOccasions.some((a) => set.has(a.toLowerCase()));
}

function preferWaterproof(row, slotKey, weather) {
  if (!weather) return false;
  const isRainy = weather.is_rainy_or_snowy === true ||
    Number(weather.rain_probability) >= RAIN_PROBABILITY_THRESHOLD;
  if (!isRainy) return false;
  if (slotKey === 'footwear') return row.tags?.waterproof === true;
  if (slotKey === 'optional') {
    // Waterproof accessories (umbrella, raincoat accessory etc.)
    return row.category === 'accessory' && row.tags?.waterproof === true;
  }
  return false;
}

/**
 * Sort by: occasion match → rain preference → recency (least recently worn first).
 * No items are removed — this is preference ordering only.
 */
function sortAndLimit(rows, allowedOccasions, limit, opts = {}) {
  const { weather, slotKey } = opts;
  return [...rows].sort((a, b) => {
    const occA = matchesOccasion(a, allowedOccasions) ? 1 : 0;
    const occB = matchesOccasion(b, allowedOccasions) ? 1 : 0;
    if (occB !== occA) return occB - occA;

    const rainA = preferWaterproof(a, slotKey, weather) ? 1 : 0;
    const rainB = preferWaterproof(b, slotKey, weather) ? 1 : 0;
    if (rainB !== rainA) return rainB - rainA;

    const da = toDateStr(a.last_worn_date);
    const db = toDateStr(b.last_worn_date);
    if (da == null && db == null) return 0;
    if (da == null) return -1;
    if (db == null) return 1;
    return da.localeCompare(db);
  }).slice(0, limit);
}

/**
 * Weekly wear count filter — exclude items worn more than maxWearsPerWeek times this week.
 * Falls back to all items if filtering leaves fewer than MIN_CANDIDATES candidates.
 */
const MIN_CANDIDATES = 3;

function applyWeeklyWearFilter(rows, maxWearsPerWeek) {
  const fresh = rows.filter((r) => (r.times_worn_last_7_days ?? 0) < maxWearsPerWeek);
  return fresh.length >= MIN_CANDIDATES ? fresh : rows;
}

function mapToApiItems(rows, slotLabel) {
  const out = [];
  for (const row of rows) {
    try { out.push(toApiItem(row)); }
    catch (err) {
      if (DEBUG) console.warn(`[prefilter] Skipping item ${row.id} (${slotLabel}):`, err.message);
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// DB fetchers
// ─────────────────────────────────────────────

/**
 * Fetch tops by layer. layer=null items are treated as 'inner' (backward compat).
 * For top_inner: fetch where layer='inner' OR layer IS NULL
 * For top_outer: fetch where layer='outer'
 */
async function fetchTopsByLayer(userId, layer) {
  let query = db()
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .eq('category', 'top');

  if (layer === 'inner') {
    // inner + legacy items with no layer set
    query = query.or('layer.eq.inner,layer.is.null');
  } else {
    query = query.eq('layer', 'outer');
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchByCategory(userId, category) {
  const { data, error } = await db()
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .eq('category', category);
  if (error) throw new Error(error.message);
  return data || [];
}

// ─────────────────────────────────────────────
// Slot candidate getters
// ─────────────────────────────────────────────

async function getTopInnerCandidates(userId, opts) {
  const { occasionFilter, limitPerSlot, weather, activity } = opts;
  const rows = await fetchTopsByLayer(userId, 'inner');
  if (DEBUG) console.log(`[prefilter] slot=top_inner → ${rows.length} rows`);

  // Gym skips wear limit — athletic wear is meant to repeat
  const filtered = activity === 'gym' ? rows : applyWeeklyWearFilter(rows, INNER_MAX_WEARS_PER_WEEK);
  const sorted = sortAndLimit(filtered, occasionFilter, limitPerSlot, { weather, slotKey: 'top_inner' });
  return mapToApiItems(sorted, 'top_inner');
}

async function getTopOuterCandidates(userId, opts) {
  const { occasionFilter, limitPerSlot, weather } = opts;
  const rows = await fetchTopsByLayer(userId, 'outer');
  if (DEBUG) console.log(`[prefilter] slot=top_outer → ${rows.length} rows`);

  // Outer layers repeat freely — only exclude once worn more than 5 times this week
  const filtered = applyWeeklyWearFilter(rows, OUTER_MAX_WEARS_PER_WEEK);
  const sorted = sortAndLimit(filtered, occasionFilter, limitPerSlot, { weather, slotKey: 'top_outer' });
  return mapToApiItems(sorted, 'top_outer');
}

async function getBottomCandidates(userId, opts) {
  const { occasionFilter, limitPerSlot, weather, activity } = opts;
  const rows = await fetchByCategory(userId, 'bottom');
  if (DEBUG) console.log(`[prefilter] slot=bottom → ${rows.length} rows`);

  // Skip wear limit for gym — athletic wear repeats freely
  const skipRecency = activity === 'gym';
  const filtered = skipRecency ? rows : applyWeeklyWearFilter(rows, INNER_MAX_WEARS_PER_WEEK);
  const sorted = sortAndLimit(filtered, occasionFilter, limitPerSlot, { weather, slotKey: 'bottom' });
  return mapToApiItems(sorted, 'bottom');
}

async function getFootwearCandidates(userId, opts) {
  const { occasionFilter, limitPerSlot, weather } = opts;
  // No recency filter for footwear — shoes repeat freely
  const rows = await fetchByCategory(userId, 'footwear');
  if (DEBUG) console.log(`[prefilter] slot=footwear → ${rows.length} rows`);

  const sorted = sortAndLimit(rows, occasionFilter, limitPerSlot, { weather, slotKey: 'footwear' });
  return mapToApiItems(sorted, 'footwear');
}

async function getOptionalCandidates(userId, opts) {
  const { occasionFilter, limitPerSlot, weather } = opts;

  const { data, error } = await db()
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .in('category', OPTIONAL_CATEGORIES);
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (DEBUG) console.log(`[prefilter] slot=optional → ${rows.length} rows`);

  // Accessories repeat freely — no wear limit filter
  const sorted = sortAndLimit(rows, occasionFilter, limitPerSlot, { weather, slotKey: 'optional' });
  return mapToApiItems(sorted, 'optional');
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────

/**
 * Get pre-filtered candidate sets per slot for the LLM (Stage 1).
 * Returns:
 *   top_inner  — mandatory base layer candidates
 *   top_outer  — optional outer layer candidates (hoodie, cardigan, etc.)
 *   bottom     — mandatory
 *   footwear   — mandatory
 *   optional   — weather accessories (category=accessory items)
 */
async function getPreFilteredCandidates(userId, options = {}) {
  let dateOpt = options.date ? String(options.date).trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOpt)) dateOpt = new Date().toISOString().slice(0, 10);

  const limitPerSlot = Math.min(Math.max(1, Number(options.limitPerSlot) || DEFAULT_LIMIT_PER_SLOT), 50);
  const occasionFilter = getOccasionFilter(options.activity);
  const weather = options.weather || null;

  if (DEBUG) console.log('[prefilter] getPreFilteredCandidates', { userId, dateOpt, occasionFilter });

  const opts = { occasionFilter, limitPerSlot, weather, activity: options.activity || null };

  const [top_inner, top_outer, bottom, footwear, optional] = await Promise.all([
    getTopInnerCandidates(userId, opts),
    getTopOuterCandidates(userId, opts),
    getBottomCandidates(userId, opts),
    getFootwearCandidates(userId, opts),
    getOptionalCandidates(userId, opts),
  ]);

  return { top_inner, top_outer, bottom, footwear, optional };
}

module.exports = {
  getPreFilteredCandidates,
  getOccasionFilter,
  getRecencyCutoff,
  MANDATORY_SLOTS,
  OPTIONAL_SLOT,
  OPTIONAL_CATEGORIES,
};