const express = require('express');
const { nanoid } = require('nanoid');
const { authMiddleware } = require('../middleware/auth');
const { getPreFilteredCandidates } = require('../services/prefilter');
const { getWeatherForRecommendation } = require('../services/weather');
const { recommendOutfit } = require('../services/recommendationLLM');

const router = express.Router();

/** Ensure outfit has top, bottom, footwear when candidates exist; fill with first (next-best) candidate if missing. */
function ensureMandatorySlots(outfit, candidates) {
  const out = { ...outfit, optional: outfit.optional || [] };
  for (const slot of ['top', 'bottom', 'footwear']) {
    const list = candidates[slot] || [];
    if (list.length === 0) continue;
    const current = out[slot] && out[slot].item_id;
    const valid = current && list.some((c) => c.item_id === current);
    if (valid) continue;
    const first = list[0];
    out[slot] = {
      item_id: first.item_id,
      name: first.name,
      reason: 'Best available option from your wardrobe for this slot.',
    };
  }
  return out;
}

/**
 * Compute a 0–100 readiness score based on how well the chosen outfit matches the weather.
 * Deterministic — no LLM involvement.
 *
 * Scoring breakdown (100 pts total):
 *  - Slot coverage     (30 pts): 10 per filled mandatory slot (top/bottom/footwear)
 *  - Warmth match      (30 pts): how close item warmth is to the ideal for feels_like temp
 *  - Rain readiness    (20 pts): waterproof footwear/jacket when rainy, full marks when dry
 *  - Breathability     (10 pts): breathability match for hot weather, neutral otherwise
 *  - Comfort           (10 pts): average user_comfort of outfit items
 */
function computeReadinessScore(outfit, candidates, weather) {
  // Resolve full item data for each chosen slot from candidates
  function resolve(slotItem, slotCandidates) {
    if (!slotItem || !slotItem.item_id) return null;
    return slotCandidates.find((c) => c.item_id === slotItem.item_id) || null;
  }

  const allCandidates = {
    top: candidates.top || [],
    bottom: candidates.bottom || [],
    footwear: candidates.footwear || [],
    optional: candidates.optional || [],
  };

  const top = resolve(outfit.top, allCandidates.top);
  const bottom = resolve(outfit.bottom, allCandidates.bottom);
  const footwear = resolve(outfit.footwear, allCandidates.footwear);
  const optionalItems = (outfit.optional || [])
    .map((o) => resolve(o, allCandidates.optional))
    .filter(Boolean);

  const filledSlots = [top, bottom, footwear].filter(Boolean);

  // ── 1. Slot coverage (30 pts) ────────────────────────────────────────────
  const slotScore = filledSlots.length * 10; // 10 per filled slot, max 30

  // ── 2. Warmth match (30 pts) ─────────────────────────────────────────────
  const feelsLike = weather ? Number(weather.feels_like_c) : null;
  let warmthScore = 15; // neutral default when no weather

  if (feelsLike !== null && !Number.isNaN(feelsLike)) {
    // Ideal warmth rating (1–5) for a given temperature
    let idealWarmth;
    if (feelsLike <= 0)       idealWarmth = 5;
    else if (feelsLike <= 8)  idealWarmth = 4;
    else if (feelsLike <= 16) idealWarmth = 3;
    else if (feelsLike <= 24) idealWarmth = 2;
    else                      idealWarmth = 1;

    const warmths = filledSlots.map((it) => Number(it?.tags?.warmth) || 3);
    if (warmths.length > 0) {
      const avgWarmth = warmths.reduce((a, b) => a + b, 0) / warmths.length;
      // Max deviation is 4 (e.g. ideal=1, actual=5). Score degrades linearly.
      const deviation = Math.abs(avgWarmth - idealWarmth);
      warmthScore = Math.round(30 * (1 - deviation / 4));
    }
  }

  // ── 3. Rain readiness (20 pts) ───────────────────────────────────────────
  const isRainy = weather
    ? weather.is_rainy_or_snowy === true || Number(weather.rain_probability) >= 0.5
    : false;
  let rainScore = 20; // full marks when dry or no weather data

  if (isRainy) {
    const hasWaterproofFootwear = footwear?.tags?.waterproof === true;
    const hasWaterproofLayer =
      optionalItems.some((o) => o?.tags?.waterproof === true) ||
      top?.tags?.waterproof === true;

    if (hasWaterproofFootwear && hasWaterproofLayer) rainScore = 20;
    else if (hasWaterproofFootwear || hasWaterproofLayer) rainScore = 10;
    else rainScore = 0;
  }

  // ── 4. Breathability match (10 pts) ─────────────────────────────────────
  let breathScore = 7; // neutral default
  if (feelsLike !== null && !Number.isNaN(feelsLike) && feelsLike > 22) {
    const breathabilities = filledSlots.map((it) => Number(it?.tags?.breathability) || 3);
    if (breathabilities.length > 0) {
      const avgBreath = breathabilities.reduce((a, b) => a + b, 0) / breathabilities.length;
      // Hot weather: want breathability >= 3. Score: 0–10 mapped from 1–5 scale.
      breathScore = Math.round(((avgBreath - 1) / 4) * 10);
    }
  }

  // ── 5. Comfort (10 pts) ──────────────────────────────────────────────────
  const comforts = filledSlots.map((it) => Number(it?.tags?.user_comfort) || 3);
  const avgComfort = comforts.length > 0
    ? comforts.reduce((a, b) => a + b, 0) / comforts.length
    : 3;
  const comfortScore = Math.round(((avgComfort - 1) / 4) * 10);

  const total = slotScore + warmthScore + rainScore + breathScore + comfortScore;
  return Math.min(100, Math.max(0, total));
}

/**
 * GET /api/v1/recommendations/candidates
 * Fetches weather when lat/lon provided (from frontend: Geolocation API or profile), runs DB pre-filter,
 * returns candidates + optional weather.
 * Query: activity, date (YYYY-MM-DD), limit_per_slot (default 15), lat, lon (client-provided for weather).
 */
router.get('/candidates', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const activity = req.query.activity ? String(req.query.activity).trim() : undefined;
    const date = req.query.date ? String(req.query.date).trim() : undefined;
    const limitPerSlot = req.query.limit_per_slot
      ? parseInt(req.query.limit_per_slot, 10)
      : undefined;
    const lat = req.query.lat != null ? parseFloat(req.query.lat) : null;
    const lon = req.query.lon != null ? parseFloat(req.query.lon) : null;

    const debug =
      process.env.DEBUG_PREFILTER === '1' ||
      process.env.DEBUG_RECOMMENDATIONS === '1' ||
      process.env.NODE_ENV !== 'production';
    if (debug) {
      console.log('[recommendations/candidates]', { userId, activity, date, limitPerSlot, lat, lon });
    }

    let weather = null;
    if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      try {
        weather = await getWeatherForRecommendation(lat, lon);
        if (debug) {
          console.log('[recommendations/candidates] weather applied to pre-filter:', {
            feels_like_c: weather.feels_like_c,
            condition: weather.condition,
            is_rainy_or_snowy: weather.is_rainy_or_snowy,
            rain_probability: weather.rain_probability,
          });
        }
      } catch (e) {
        console.warn('Weather fetch failed, pre-filter without weather:', e.message);
      }
    } else if (debug) {
      console.log('[recommendations/candidates] weather: not fetched (no lat/lon in query; add ?lat=...&lon=... to enable)');
    }

    const candidates = await getPreFilteredCandidates(userId, {
      activity,
      date,
      limitPerSlot,
      weather,
    });

    const payload = {
      // date is provided by the client (from locationDate()) and is already timezone-correct.
      // Server UTC fallback is only used if the client omits it.
      date: date || new Date().toISOString().slice(0, 10),
      activity: activity || null,
      candidates: {
        top: candidates.top,
        bottom: candidates.bottom,
        footwear: candidates.footwear,
        optional: candidates.optional,
      },
      counts: {
        top: candidates.top.length,
        bottom: candidates.bottom.length,
        footwear: candidates.footwear.length,
        optional: candidates.optional.length,
      },
    };
    if (weather) payload.weather = weather;

    return res.json(payload);
  } catch (err) {
    console.error('GET /recommendations/candidates error:', err.message);
    console.error(err.stack);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to get candidates',
        status: 500,
      },
    });
  }
});

/**
 * POST /api/v1/recommendations
 * Generate daily outfit: pre-filter (DB) + LLM selection.
 * Body: date, activity, mood, location { lat, lon } (location from frontend: Geolocation or profile).
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const body = req.body || {};
    const date = body.date ? String(body.date).trim().slice(0, 10) : '';
    // Prefer the client-provided date (from locationDate() in the frontend) which is already
    // correct for the user's location timezone. Fall back to server UTC only as last resort.
    const dateOpt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    const activity = body.activity ? String(body.activity).trim() : undefined;
    const mood = body.mood ? String(body.mood).trim() : undefined;
    const location = body.location && typeof body.location === 'object' ? body.location : null;
    const lat = location && location.lat != null ? parseFloat(location.lat) : null;
    const lon = location && location.lon != null ? parseFloat(location.lon) : null;

    let weather = null;
    if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      try {
        weather = await getWeatherForRecommendation(lat, lon);
      } catch (e) {
        console.warn('POST /recommendations: weather fetch failed:', e.message);
      }
    }

    const candidates = await getPreFilteredCandidates(userId, {
      activity,
      date: dateOpt,
      weather,
    });

    let { outfit, explanation, alternatives, health_insights, activities } = await recommendOutfit({
      candidates,
      weather,
      activity,
      mood,
      date: dateOpt,
    });

    outfit = ensureMandatorySlots(outfit || {}, candidates);

    const readiness_score = computeReadinessScore(outfit, candidates, weather);

    const recommendationId = `rec_${nanoid(12)}`;
    const payload = {
      recommendation_id: recommendationId,
      date: dateOpt,
      health_insights: health_insights || [],
      outfit,
      explanation,
      alternatives: alternatives || [],
      activities: activities || [],
      readiness_score,
    };
    if (weather) payload.weather = weather;

    return res.json(payload);
  } catch (err) {
    console.error('POST /recommendations error:', err.message);
    console.error(err.stack);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to generate recommendation',
        status: 500,
      },
    });
  }
});

module.exports = router;