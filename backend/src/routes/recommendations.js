const express = require('express');
const { nanoid } = require('nanoid');
const { authMiddleware } = require('../middleware/auth');
const { getPreFilteredCandidates } = require('../services/prefilter');
const { getWeatherForRecommendation } = require('../services/weather');
const { recommendOutfit } = require('../services/recommendationLLM');

const router = express.Router();

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

    const { outfit, explanation, alternatives, health_insights } = await recommendOutfit({
      candidates,
      weather,
      activity,
      mood,
      date: dateOpt,
    });

    const recommendationId = `rec_${nanoid(12)}`;
    const payload = {
      recommendation_id: recommendationId,
      date: dateOpt,
      health_insights: health_insights || [],
      outfit,
      explanation,
      alternatives: alternatives || [],
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
