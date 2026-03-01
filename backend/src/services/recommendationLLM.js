/**
 * Stage 2: LLM outfit selection from pre-filtered candidates.
 * Takes candidates + weather + activity + mood, returns outfit, explanation, alternatives, health_insights.
 */

const Anthropic = require('@anthropic-ai/sdk').default;

const SCHEMA = `
Respond with exactly one JSON object (no markdown, no code fence) with this shape:
{
  "outfit": {
    "top": { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" },
    "bottom": { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" },
    "footwear": { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" },
    "optional": [ { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" } ]
  },
  "explanation": "2-3 sentences for the user.",
  "alternatives": [ { "replaces": "top" | "bottom" | "footwear", "item_id": "itm_xxx", "name": "string", "reason": "one sentence" } ],
  "health_insights": [ { "type": "thermal" | "uv" | "rain" | "activity" | "other", "severity": "info" | "warning", "message": "one sentence" } ],
  "activities": [ "string" ]
}
Rules:
- CRITICAL: Always include exactly one top, one bottom, and one footwear in outfit when candidates exist for that slot. Never omit top, bottom, or footwear unless that slot has zero candidates. Pick exactly one item_id per slot from the candidates; use the item_id strings as given. Candidates are ordered with the best option first (e.g. warmest for cold weather when no ideal match existed).
- If a slot has no candidates at all, omit that key from outfit (or use null). Still fill every other slot that has candidates.
- optional: include 0+ items (e.g. jacket, scarf) only when weather or activity clearly need them.
- alternatives: 0-3 items, each replaces one slot with another candidate from that slot.
- health_insights: 0-4 short messages (thermal, UV, rain, activity-matched). If the best available item was not ideal for weather (e.g. no warm enough top), add a brief thermal/rain insight so the user knows.
- activities: exactly 3-4 short activity suggestions (each under 10 words) tailored to the combination of weather, occasion, and mood. Examples: "Take a walk in the park", "Try a new coffee shop", "Catch up on reading indoors". Make them feel personal and specific — not generic. Vary them based on mood (energised = active; relaxed = calm; confident = social).
`;

/**
 * @param {object} opts
 * @param {{ top: object[], bottom: object[], footwear: object[], optional: object[] }} opts.candidates - API-shaped items (item_id, name, description, tags, last_worn_date, etc.)
 * @param {object} [opts.weather] - { temperature_c, feels_like_c, condition, rain_probability, uv_index, humidity, wind_kph }
 * @param {string} [opts.activity] - e.g. casual, office, gym
 * @param {string} [opts.mood] - confident, relaxed, energised
 * @param {string} [opts.date] - YYYY-MM-DD
 * @returns {Promise<{ outfit: object, explanation: string, alternatives: array, health_insights: array }>}
 */
async function recommendOutfit(opts) {
  const { candidates, weather, activity, mood, date } = opts;
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is required');

  const parts = [];
  parts.push('Pre-filtered candidates by slot (item_id, name, description, tags, last_worn_date). Pick one per required slot and optionally from optional.');
  parts.push('');
  ['top', 'bottom', 'footwear'].forEach((slot) => {
    const list = candidates[slot] || [];
    parts.push(`${slot}: ${list.length} items`);
    list.forEach((it) => {
      parts.push(`  - ${it.item_id}: ${it.name} | ${it.description || '-'} | warmth=${it.tags?.warmth ?? '-'} breathability=${it.tags?.breathability ?? '-'} waterproof=${it.tags?.waterproof ?? false} occasion=${JSON.stringify(it.tags?.occasion ?? [])} | last_worn: ${it.last_worn_date ?? 'never'}`);
    });
    parts.push('');
  });
  parts.push('optional (jacket, scarf, etc.):');
  (candidates.optional || []).forEach((it) => {
    parts.push(`  - ${it.item_id}: ${it.name} | ${it.description || '-'} | warmth=${it.tags?.warmth ?? '-'} waterproof=${it.tags?.waterproof ?? false}`);
  });

  let context = `Activity: ${activity || 'casual'}. Mood: ${mood || 'relaxed'}. Date: ${date || 'today'}.`;
  if (weather) {
    context += ` Weather: ${weather.temperature_c}°C (feels like ${weather.feels_like_c}°C), ${weather.condition}, rain_probability=${weather.rain_probability}, humidity=${weather.humidity ?? '-'}, wind_kph=${weather.wind_kph ?? '-'}, uv_index=${weather.uv_index ?? '-'}.`;
  } else {
    context += ' No weather data (no location provided).';
  }

  const counts = {
    top: (candidates.top || []).length,
    bottom: (candidates.bottom || []).length,
    footwear: (candidates.footwear || []).length,
    optional: (candidates.optional || []).length,
  };
  console.log('[recommendationLLM] LLM call candidates:', counts);

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `${context}\n\nCandidates:\n${parts.join('\n')}\n\n${SCHEMA}`,
      },
    ],
  });

  const text =
    response.content &&
    response.content.find((b) => b.type === 'text') &&
    response.content.find((b) => b.type === 'text').text;
  if (!text) throw new Error('No text in Claude recommendation response');

  const jsonStr = text.replace(/^```json?\s*|\s*```$/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Claude recommendation invalid JSON: ${text.slice(0, 300)}`);
  }

  const outfit = parsed.outfit || {};
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : 'Outfit chosen from your wardrobe.';
  const alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
  const health_insights = Array.isArray(parsed.health_insights) ? parsed.health_insights : [];
  const activities = Array.isArray(parsed.activities)
    ? parsed.activities.filter((a) => typeof a === 'string' && a.trim()).slice(0, 4)
    : [];

  const normalizedOutfit = enforceRequiredSlots(outfit, candidates, weather);
  const normalizedAlternatives = sanitizeAlternatives(alternatives, candidates);

  return {
    outfit: normalizedOutfit,
    explanation,
    alternatives: normalizedAlternatives,
    health_insights,
    activities,
  };
}

function enforceRequiredSlots(outfit, candidates, weather) {
  const normalized = { ...(outfit || {}) };

  ['top', 'bottom', 'footwear'].forEach((slot) => {
    const slotCandidates = Array.isArray(candidates?.[slot]) ? candidates[slot] : [];
    if (slotCandidates.length === 0) return;

    const selected = normalized[slot];
    const selectedId = selected && typeof selected.item_id === 'string' ? selected.item_id : null;
    const matched = selectedId
      ? slotCandidates.find((it) => it.item_id === selectedId)
      : null;

    if (matched) {
      normalized[slot] = {
        item_id: matched.item_id,
        name: matched.name,
        reason:
          typeof selected.reason === 'string' && selected.reason.trim()
            ? selected.reason.trim()
            : `Selected from your ${slot} options.`,
      };
      return;
    }

    const fallback = selectBestCandidate(slotCandidates, weather, slot);
    normalized[slot] = {
      item_id: fallback.item_id,
      name: fallback.name,
      reason: `Best available ${slot} from your wardrobe.`,
    };
  });

  if (Array.isArray(normalized.optional)) {
    const optionalCandidates = Array.isArray(candidates?.optional) ? candidates.optional : [];
    const allowedIds = new Set(optionalCandidates.map((it) => it.item_id));
    normalized.optional = normalized.optional
      .filter((item) => item && typeof item.item_id === 'string' && allowedIds.has(item.item_id))
      .map((item) => {
        const matched = optionalCandidates.find((it) => it.item_id === item.item_id);
        return {
          item_id: matched.item_id,
          name: matched.name,
          reason:
            typeof item.reason === 'string' && item.reason.trim()
              ? item.reason.trim()
              : 'Optional weather layer.',
        };
      });
  } else {
    normalized.optional = [];
  }

  return normalized;
}

function selectBestCandidate(items, weather, slot) {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!weather) return items[0];

  const feelsLike = Number(weather.feels_like_c);
  const isRainy =
    weather.is_rainy_or_snowy === true || Number(weather.rain_probability) >= 0.5;

  let best = items[0];
  let bestScore = -Infinity;

  for (const item of items) {
    const tags = item?.tags || {};
    const warmth = Number(tags.warmth) || 3;
    const breathability = Number(tags.breathability) || 3;
    const comfort = Number(tags.user_comfort) || 3;
    const waterproof = tags.waterproof === true ? 1 : 0;

    let score = 0;
    if (!Number.isNaN(feelsLike)) {
      if (feelsLike < 10) score += warmth * 2;
      else if (feelsLike > 25) score += (6 - warmth) * 1.5 + breathability * 1.5;
      else score += 5 - Math.abs(warmth - 3);
    }
    score += comfort * 0.5;
    if (isRainy && (slot === 'footwear' || slot === 'top')) {
      score += waterproof * 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

function sanitizeAlternatives(alternatives, candidates) {
  const safe = [];
  const slots = ['top', 'bottom', 'footwear'];

  for (const alt of alternatives || []) {
    if (!alt || !slots.includes(alt.replaces)) continue;
    const slotCandidates = Array.isArray(candidates?.[alt.replaces]) ? candidates[alt.replaces] : [];
    const matched = slotCandidates.find((it) => it.item_id === alt.item_id);
    if (!matched) continue;
    safe.push({
      replaces: alt.replaces,
      item_id: matched.item_id,
      name: matched.name,
      reason:
        typeof alt.reason === 'string' && alt.reason.trim()
          ? alt.reason.trim()
          : `Alternative ${alt.replaces} option.`,
    });
    if (safe.length >= 3) break;
  }

  return safe;
}

module.exports = { recommendOutfit };