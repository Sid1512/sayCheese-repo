const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

export async function analyzeClothingItem(base64Image, mimeType = "image/jpeg") {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: base64Image },
            },
            {
              type: "text",
              text: `Analyze this clothing item and return ONLY a JSON object with these fields:
{
  "name": "item name",
  "category": "tops|bottoms|outerwear|footwear|accessories",
  "color": "primary color",
  "warmth": 1-5 (1=very light, 5=very warm),
  "waterproof": true|false,
  "breathability": 1-5 (1=not breathable, 5=very breathable),
  "occasion": ["casual"|"formal"|"sport"|"outdoor"],
  "material": "inferred material",
  "sustainabilityScore": 1-5 (based on material - natural fibers score higher)
}
Return ONLY the JSON, no explanation.`,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text;
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

export async function getOutfitRecommendation(weather, wardrobe, occasion, userPrefs) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are a weather-intelligent outfit advisor.

Weather: ${JSON.stringify(weather)}
Occasion: ${occasion}
User Preferences: ${JSON.stringify(userPrefs)}
Wardrobe Items: ${JSON.stringify(wardrobe)}

Return ONLY a JSON object:
{
  "outfit": [list of wardrobe item names to wear],
  "reasoning": "brief explanation",
  "readinessScore": 0-100,
  "readinessBreakdown": {
    "comfort": 0-100,
    "activityMatch": 0-100,
    "weatherRisk": 0-100,
    "outfitSuitability": 0-100,
    "sustainability": 0-100
  },
  "alerts": ["any heat/rain/cold alerts"],
  "activities": ["3-5 suggested activities for this weather"],
  "noOutfitFound": true|false,
  "genericSuggestion": "if no wardrobe match, suggest a generic outfit"
}`,
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text;
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}