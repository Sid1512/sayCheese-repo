const Anthropic = require('@anthropic-ai/sdk').default;

const CATEGORIES =
  'top, bottom, footwear, thermal, jacket, scarf, hat, gloves, facemask, umbrella';
const OCCASIONS = 'casual, work, formal, outdoor, athletic, smart_casual';

const SCHEMA_PROMPT = `
Respond with exactly one JSON object (no markdown, no code fence) with this shape:
{
  "name": "short display name for the item",
  "description": "one sentence: fabric, fit, style",
  "category": "one of: ${CATEGORIES}",
  "tags": {
    "warmth": 1-5,
    "breathability": 1-5,
    "waterproof": true or false,
    "occasion": ["one or more of: ${OCCASIONS}"],
    "color": "primary color",
    "user_comfort": 1-5
  },
  "confidence": 0.0-1.0
}
Warmth: 1=very light, 5=very warm. Breathability: 1=not breathable, 5=very breathable. User comfort: 1-5 how comfortable it likely is (use 3 if unsure).`;

/**
 * @param {Buffer} imageBuffer
 * @param {string} mediaType - e.g. 'image/jpeg', 'image/png'
 * @param {string} [categoryHint] - optional hint: top, bottom, footwear, etc.
 * @returns {Promise<{ name: string, description?: string, category: string, tags: object, confidence: number }>}
 */
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
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
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

  const {
    name,
    description,
    category,
    tags,
    confidence = 0.8,
  } = parsed;

  if (!name || !category || !tags) {
    throw new Error('Claude response missing required fields (name, category, tags)');
  }

  const normalized = {
    name: String(name).trim(),
    description: description != null ? String(description).trim() : '',
    category: String(category).trim().toLowerCase(),
    tags: {
      warmth: clamp(Number(tags.warmth), 1, 5),
      breathability: clamp(Number(tags.breathability), 1, 5),
      waterproof: Boolean(tags.waterproof),
      occasion: Array.isArray(tags.occasion)
        ? tags.occasion.map((o) => String(o).trim().toLowerCase())
        : [String(tags.occasion || 'casual').trim().toLowerCase()],
      color: String(tags.color || 'unknown').trim().toLowerCase(),
      user_comfort: clamp(Number(tags.user_comfort), 1, 5),
    },
    confidence: Math.min(1, Math.max(0, Number(confidence))),
  };

  return normalized;
}

function clamp(n, min, max) {
  const v = Number(n);
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

module.exports = { detectClothingItem };
