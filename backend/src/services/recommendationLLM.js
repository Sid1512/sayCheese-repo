/**
 * Stage 2: LLM outfit selection from pre-filtered candidates.
 * Slots: top_inner (mandatory), top_outer (optional), bottom, footwear, accessories (text only).
 */

const Anthropic = require('@anthropic-ai/sdk').default;

const SCHEMA = `
Respond with exactly one JSON object (no markdown, no code fence) with this shape:
{
  "outfit": {
    "top_inner": { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" },
    "top_outer": { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" },
    "bottom":    { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" },
    "footwear":  { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" },
    "optional":  [ { "item_id": "itm_xxx", "name": "string", "reason": "one sentence" } ]
  },
  "accessories": [ "string" ],
  "explanation": "2-3 sentences for the user.",
  "alternatives": [ { "replaces": "top_inner" | "top_outer" | "bottom" | "footwear", "item_id": "itm_xxx", "name": "string", "reason": "one sentence" } ],
  "health_insights": [ { "type": "thermal" | "uv" | "rain" | "activity" | "other", "severity": "info" | "warning", "message": "one sentence" } ],
  "activities": [ "string" ]
}

Rules:
- top_inner (MANDATORY): always pick one from candidates when they exist. This is the base layer (t-shirt, shirt, blouse).
- top_outer (OPTIONAL): only include when weather is cold (feels_like < 16°C), rainy, or the occasion calls for it (work, party). Pick from top_outer candidates. Omit entirely in warm weather.
- bottom (MANDATORY): always pick one from candidates when they exist.
- footwear (MANDATORY): always pick one from candidates when they exist.
- IMPORTANT for gym activity: the user is exercising indoors. Prioritise occasion match (athletic-tagged items) over warmth — they do not need warm clothing for the workout itself. Use accessories to handle the commute: suggest a warm outer layer if weather is cold, a waterproof outer layer if rainy, or both if cold and rainy.
- optional: 0+ wardrobe items (thermal, jacket, scarf, etc.) when weather clearly needs them.
- accessories: 0-3 short strings for weather-appropriate accessories the user might want regardless of their wardrobe. Examples: "Sunglasses (UV ${Math.round(0)} today)", "Umbrella recommended", "Light scarf for the evening chill". Only suggest when genuinely useful.
- alternatives: 0-3 items swapping one slot for another candidate.
- health_insights: 0-4 short messages.
- activities: exactly 3-4 short suggestions (under 10 words each) tailored to weather + occasion.
`;

async function recommendOutfit(opts) {
  const { candidates, weather, activity, date } = opts;
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is required');

  // Build candidate context for LLM
  const parts = [];
  parts.push('Pre-filtered wardrobe candidates by slot. Pick one per mandatory slot.');
  parts.push('');

  // Mandatory slots
  for (const slot of ['top_inner', 'bottom', 'footwear']) {
    const list = candidates[slot] || [];
    parts.push(`${slot} (MANDATORY — ${list.length} candidates):`);
    list.forEach((it) => {
      parts.push(`  - ${it.item_id}: ${it.name} | ${it.description || '-'} | warmth=${it.tags?.warmth ?? '-'} breathability=${it.tags?.breathability ?? '-'} waterproof=${it.tags?.waterproof ?? false} occasion=${JSON.stringify(it.tags?.occasion ?? [])} layer=${it.layer ?? 'inner'} | last_worn: ${it.last_worn_date ?? 'never'}`);
    });
    parts.push('');
  }

  // Optional outer layer
  const outerList = candidates.top_outer || [];
  parts.push(`top_outer (OPTIONAL outer layer — ${outerList.length} candidates — only include if weather/occasion warrants):`);
  outerList.forEach((it) => {
    parts.push(`  - ${it.item_id}: ${it.name} | ${it.description || '-'} | warmth=${it.tags?.warmth ?? '-'} waterproof=${it.tags?.waterproof ?? false} | last_worn: ${it.last_worn_date ?? 'never'}`);
  });
  parts.push('');

  // Weather accessories
  const optList = candidates.optional || [];
  parts.push(`optional accessories from wardrobe (scarves, hats, thermals, umbrellas, etc. — ${optList.length} candidates):`);
  optList.forEach((it) => {
    parts.push(`  - ${it.item_id}: ${it.name} | warmth=${it.tags?.warmth ?? '-'} waterproof=${it.tags?.waterproof ?? false}`);
  });

  let context = `Activity: ${activity || 'casual'}. Date: ${date || 'today'}.`;
  if (weather) {
    context += ` Weather: ${weather.temperature_c}°C (feels like ${weather.feels_like_c}°C), ${weather.condition}, rain_probability=${weather.rain_probability}, humidity=${weather.humidity ?? '-'}, wind_kph=${weather.wind_kph ?? '-'}, uv_index=${weather.uv_index ?? '-'}.`;
  } else {
    context += ' No weather data.';
  }

  console.log('[recommendationLLM] candidates counts:', {
    top_inner: (candidates.top_inner || []).length,
    top_outer: (candidates.top_outer || []).length,
    bottom: (candidates.bottom || []).length,
    footwear: (candidates.footwear || []).length,
    optional: (candidates.optional || []).length,
  });

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
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
  const accessories = Array.isArray(parsed.accessories)
    ? parsed.accessories.filter((a) => typeof a === 'string' && a.trim()).slice(0, 3)
    : [];

  const normalizedOutfit = enforceRequiredSlots(outfit, candidates, weather);
  const normalizedAlternatives = sanitizeAlternatives(alternatives, candidates);

  return {
    outfit: normalizedOutfit,
    accessories,
    explanation,
    alternatives: normalizedAlternatives,
    health_insights,
    activities,
  };
}

/**
 * Enforce mandatory slots are filled from candidates.
 * top_outer is optional — only kept if LLM chose a valid candidate.
 */
function enforceRequiredSlots(outfit, candidates, weather) {
  const normalized = { ...(outfit || {}) };

  // Mandatory slots — always fill if candidates exist
  for (const slot of ['top_inner', 'bottom', 'footwear']) {
    const slotCandidates = candidates?.[slot] || [];
    if (slotCandidates.length === 0) continue;

    const selected = normalized[slot];
    const selectedId = selected?.item_id ?? null;
    const matched = selectedId ? slotCandidates.find((it) => it.item_id === selectedId) : null;

    if (matched) {
      normalized[slot] = {
        item_id: matched.item_id,
        name: matched.name,
        reason: selected.reason?.trim() || `Selected from your ${slot} options.`,
      };
    } else {
      const fallback = selectBestCandidate(slotCandidates, weather, slot);
      normalized[slot] = {
        item_id: fallback.item_id,
        name: fallback.name,
        reason: `Best available ${slot} from your wardrobe.`,
      };
    }
  }

  // top_outer — optional, validate only if LLM included it
  if (normalized.top_outer) {
    const outerCandidates = candidates?.top_outer || [];
    const selectedId = normalized.top_outer?.item_id ?? null;
    const matched = selectedId ? outerCandidates.find((it) => it.item_id === selectedId) : null;

    if (matched) {
      normalized.top_outer = {
        item_id: matched.item_id,
        name: matched.name,
        reason: normalized.top_outer.reason?.trim() || 'Outer layer for today.',
      };
    } else {
      // LLM hallucinated an id — drop it
      delete normalized.top_outer;
    }
  }

  // optional wardrobe items
  const optCandidates = candidates?.optional || [];
  const allowedIds = new Set(optCandidates.map((it) => it.item_id));
  if (Array.isArray(normalized.optional)) {
    normalized.optional = normalized.optional
      .filter((item) => item?.item_id && allowedIds.has(item.item_id))
      .map((item) => {
        const matched = optCandidates.find((it) => it.item_id === item.item_id);
        return {
          item_id: matched.item_id,
          name: matched.name,
          reason: item.reason?.trim() || 'Optional weather layer.',
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
  const isRainy = weather.is_rainy_or_snowy === true || Number(weather.rain_probability) >= 0.5;

  let best = items[0];
  let bestScore = -Infinity;

  for (const item of items) {
    const tags = item?.tags || {};
    const warmth = Number(tags.warmth) || 3;
    const breathability = Number(tags.breathability) || 3;
    const waterproof = tags.waterproof === true ? 1 : 0;

    let score = 0;
    if (!Number.isNaN(feelsLike)) {
      if (feelsLike < 10)      score += warmth * 2;
      else if (feelsLike > 25) score += (6 - warmth) * 1.5 + breathability * 1.5;
      else                     score += 5 - Math.abs(warmth - 3);
    }
    if (isRainy && slot === 'footwear') score += waterproof * 2;

    if (score > bestScore) { bestScore = score; best = item; }
  }

  return best;
}

function sanitizeAlternatives(alternatives, candidates) {
  const validSlots = new Set(['top_inner', 'top_outer', 'bottom', 'footwear']);
  const safe = [];

  for (const alt of alternatives || []) {
    if (!alt || !validSlots.has(alt.replaces)) continue;
    const slotCandidates = candidates?.[alt.replaces] || [];
    const matched = slotCandidates.find((it) => it.item_id === alt.item_id);
    if (!matched) continue;
    safe.push({
      replaces: alt.replaces,
      item_id: matched.item_id,
      name: matched.name,
      reason: alt.reason?.trim() || `Alternative ${alt.replaces} option.`,
    });
    if (safe.length >= 3) break;
  }

  return safe;
}

module.exports = { recommendOutfit };