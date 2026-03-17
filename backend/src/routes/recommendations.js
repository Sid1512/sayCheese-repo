const express = require('express');
const { nanoid } = require('nanoid');
const { authMiddleware } = require('../middleware/auth');
const { getPreFilteredCandidates } = require('../services/prefilter');
const { getWeatherForRecommendation } = require('../services/weather');
const { recommendOutfit } = require('../services/recommendationLLM');

const router = express.Router();

/**
 * Ensure mandatory slots (top_inner, bottom, footwear) are filled when candidates exist.
 * top_outer is optional — left as-is.
 */
function ensureMandatorySlots(outfit, candidates) {
  const out = {
    ...outfit,
    optional: outfit.optional || [],
  };

  for (const slot of ['top_inner', 'bottom', 'footwear']) {
    const list = candidates[slot] || [];
    if (list.length === 0) continue;
    const current = out[slot]?.item_id;
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
 * Compute a 0–100 readiness score.
 *
 * Scoring (100 pts):
 *   Slot coverage  (30 pts): 10 per filled mandatory slot (top_inner, bottom, footwear)
 *   Warmth match   (30 pts): avg warmth of all worn items vs ideal for feels_like temp
 *   Rain readiness (20 pts): waterproof footwear + outer layer when rainy
 *   Breathability  (10 pts): avg breathability when feels_like > 22°C
 */
function computeReadinessScore(outfit, candidates, weather) {
  function resolve(slotItem, slotCandidates) {
    if (!slotItem?.item_id) return null;
    return (slotCandidates || []).find((c) => c.item_id === slotItem.item_id) || null;
  }

  const topInner  = resolve(outfit.top_inner,  candidates.top_inner  || []);
  const topOuter  = resolve(outfit.top_outer,  candidates.top_outer  || []);
  const bottom    = resolve(outfit.bottom,     candidates.bottom     || []);
  const footwear  = resolve(outfit.footwear,   candidates.footwear   || []);
  const optItems  = (outfit.optional || [])
    .map((o) => resolve(o, candidates.optional || []))
    .filter(Boolean);

  // Items actually being worn
  const mandatoryWorn = [topInner, bottom, footwear].filter(Boolean);
  const allWorn = [...mandatoryWorn, topOuter, ...optItems].filter(Boolean);

  // 1. Slot coverage (30 pts)
  const slotScore = mandatoryWorn.length * 10;

  // 2. Warmth match (30 pts)
  const feelsLike = weather ? Number(weather.feels_like_c) : null;
  let warmthScore = 15;
  if (feelsLike !== null && !Number.isNaN(feelsLike)) {
    let idealWarmth;
    if (feelsLike <= 0)        idealWarmth = 5;
    else if (feelsLike <= 8)   idealWarmth = 4;
    else if (feelsLike <= 16)  idealWarmth = 3;
    else if (feelsLike <= 24)  idealWarmth = 2;
    else                       idealWarmth = 1;

    const warmths = allWorn.map((it) => Number(it?.tags?.warmth) || 3);
    if (warmths.length > 0) {
      const avg = warmths.reduce((a, b) => a + b, 0) / warmths.length;
      warmthScore = Math.round(30 * (1 - Math.abs(avg - idealWarmth) / 4));
    }
  }

  // 3. Rain readiness (20 pts)
  const isRainy = weather
    ? weather.is_rainy_or_snowy === true || Number(weather.rain_probability) >= 0.5
    : false;
  let rainScore = 20;
  if (isRainy) {
    const hasWaterproofFootwear = footwear?.tags?.waterproof === true;
    // Waterproof outer layer: top_outer (jacket/raincoat) or optional wardrobe items
    const hasWaterproofOuter =
      topOuter?.tags?.waterproof === true ||
      optItems.some((o) => o?.tags?.waterproof === true);

    if (hasWaterproofFootwear && hasWaterproofOuter) rainScore = 20;
    else if (hasWaterproofFootwear || hasWaterproofOuter) rainScore = 10;
    else rainScore = 0;
  }

  // 4. Breathability (10 pts) — only penalised in heat
  let breathScore = 7;
  if (feelsLike !== null && !Number.isNaN(feelsLike) && feelsLike > 22) {
    const breaths = allWorn.map((it) => Number(it?.tags?.breathability) || 3);
    if (breaths.length > 0) {
      const avg = breaths.reduce((a, b) => a + b, 0) / breaths.length;
      breathScore = Math.round(((avg - 1) / 4) * 10);
    }
  }

  // Readiness score now out of 90 pts (comfort removed), normalise to 100
  const raw = slotScore + warmthScore + rainScore + breathScore;
  return Math.min(100, Math.max(0, Math.round(raw * (100 / 90))));
}

// GET /api/v1/recommendations/candidates
router.get('/candidates', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const activity = req.query.activity ? String(req.query.activity).trim() : undefined;
    const date = req.query.date ? String(req.query.date).trim() : undefined;
    const limitPerSlot = req.query.limit_per_slot ? parseInt(req.query.limit_per_slot, 10) : undefined;
    const lat = req.query.lat != null ? parseFloat(req.query.lat) : null;
    const lon = req.query.lon != null ? parseFloat(req.query.lon) : null;

    let weather = null;
    if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      try { weather = await getWeatherForRecommendation(lat, lon); }
      catch (e) { console.warn('Weather fetch failed:', e.message); }
    }

    const candidates = await getPreFilteredCandidates(userId, { activity, date, limitPerSlot, weather });

    return res.json({
      date: date || new Date().toISOString().slice(0, 10),
      activity: activity || null,
      candidates,
      counts: {
        top_inner: candidates.top_inner.length,
        top_outer: candidates.top_outer.length,
        bottom: candidates.bottom.length,
        footwear: candidates.footwear.length,
        optional: candidates.optional.length,
      },
      ...(weather ? { weather } : {}),
    });
  } catch (err) {
    console.error('GET /recommendations/candidates error:', err.message);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message, status: 500 } });
  }
});

// POST /api/v1/recommendations
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const body = req.body || {};
    const date = body.date ? String(body.date).trim().slice(0, 10) : '';
    const dateOpt = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
    const activity = body.activity ? String(body.activity).trim() : undefined;
    const location = body.location && typeof body.location === 'object' ? body.location : null;
    const lat = location?.lat != null ? parseFloat(location.lat) : null;
    const lon = location?.lon != null ? parseFloat(location.lon) : null;

    let weather = null;
    if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      try { weather = await getWeatherForRecommendation(lat, lon); }
      catch (e) { console.warn('POST /recommendations: weather fetch failed:', e.message); }
    }

    const candidates = await getPreFilteredCandidates(userId, { activity, date: dateOpt, weather });

    let { outfit, accessories, explanation, alternatives, health_insights, activities } =
      await recommendOutfit({ candidates, weather, activity, date: dateOpt });

    outfit = ensureMandatorySlots(outfit || {}, candidates);
    const readiness_score = computeReadinessScore(outfit, candidates, weather);

    return res.json({
      recommendation_id: `rec_${nanoid(12)}`,
      date: dateOpt,
      outfit,
      accessories: accessories || [],
      explanation,
      alternatives: alternatives || [],
      health_insights: health_insights || [],
      activities: activities || [],
      readiness_score,
      ...(weather ? { weather } : {}),
    });
  } catch (err) {
    console.error('POST /recommendations error:', err.message, err.stack);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message, status: 500 } });
  }
});

module.exports = router;