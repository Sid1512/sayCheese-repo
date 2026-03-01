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
  "health_insights": [ { "type": "thermal" | "uv" | "rain" | "activity" | "other", "severity": "info" | "warning", "message": "one sentence" } ]
}
Rules:
- Pick exactly one item_id per slot from the candidates provided; use the item_id strings as given.
- If a slot has no candidates, omit that key from outfit (or use null). Prefer to still fill other slots.
- optional: include 0+ items (e.g. jacket, scarf) only when weather or activity clearly need them.
- alternatives: 0-3 items, each replaces one slot with another candidate from that slot.
- health_insights: 0-4 short messages (thermal, UV, rain, activity-matched).
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

  return { outfit, explanation, alternatives, health_insights };
}

module.exports = { recommendOutfit };
