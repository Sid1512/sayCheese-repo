const Anthropic = require('@anthropic-ai/sdk').default;

const CATEGORIES = 'top, bottom, footwear, accessory';
const OCCASIONS = 'casual, work, athletic, smart_casual, party';

const SCHEMA_PROMPT = `
Respond with exactly one JSON object (no markdown, no code fence) with this shape:
{
  "name": "short display name for the item",
  "description": "one sentence: fabric, fit, style",
  "category": "one of: ${CATEGORIES}",
  "layer": "inner or outer — ONLY set this field when category is top. inner = base layers worn directly on skin (t-shirts, shirts, blouses, tank tops, vests). outer = worn over other tops (hoodies, sweatshirts, cardigans, overshirts, zip-ups, jackets, coats, parkas, windbreakers, raincoats). For any other category set this to null. NOTE: scarves, hats, gloves, thermals, umbrellas, sunglasses, facemasks = accessory category.",
  "tags": {
    "warmth": 1-5,
    "breathability": 1-5,
    "waterproof": true or false,
    "occasion": ["one or more of: ${OCCASIONS}"],
    "color": "primary color"
  }
}
Warmth: 1=very light, 5=very warm. Breathability: 1=not breathable, 5=very breathable.`;

async function detectClothingItem(imageBuffer, mediaType, categoryHint) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is required');

  const anthropic = new Anthropic({ apiKey });
  const base64 = imageBuffer.toString('base64');
  const hintText = categoryHint
    ? ` The user suggested this might be: ${categoryHint}. Use that as a hint if it fits.`
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `This is a photo of a single clothing item. Analyze it and return the JSON object describing it.${hintText}\n\n${SCHEMA_PROMPT}`,
          },
        ],
      },
    ],
  });

  const text =
    response.content &&
    response.content.find((b) => b.type === 'text') &&
    response.content.find((b) => b.type === 'text').text;
  if (!text) throw new Error('No text in Claude response');

  if (process.env.DEBUG_VISION === '1' || process.env.DEBUG_CLAUDE_VISION === '1') {
    console.log('[DEBUG] Claude API raw text response:', text);
  }

  const jsonStr = text.replace(/^```json?\s*|\s*```$/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${text.slice(0, 200)}`);
  }

  const { name, description, category, layer, tags } = parsed;

  if (!name || !category || !tags) {
    throw new Error('Claude response missing required fields (name, category, tags)');
  }

  const normalizedCategory = String(category).trim().toLowerCase();

  // layer is only valid for tops; enforce null for everything else
  let normalizedLayer = null;
  if (normalizedCategory === 'top') {
    const raw = String(layer || '').trim().toLowerCase();
    normalizedLayer = raw === 'outer' ? 'outer' : 'inner'; // default to inner if ambiguous
  }

  return {
    name: String(name).trim(),
    description: description != null ? String(description).trim() : '',
    category: normalizedCategory,
    layer: normalizedLayer,
    tags: {
      warmth: clamp(Number(tags.warmth), 1, 5),
      breathability: clamp(Number(tags.breathability), 1, 5),
      waterproof: Boolean(tags.waterproof),
      occasion: Array.isArray(tags.occasion)
        ? tags.occasion.map((o) => String(o).trim().toLowerCase())
        : [String(tags.occasion || 'casual').trim().toLowerCase()],
      color: String(tags.color || 'unknown').trim().toLowerCase(),
    },
  };
}

function clamp(n, min, max) {
  const v = Number(n);
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

module.exports = { detectClothingItem };