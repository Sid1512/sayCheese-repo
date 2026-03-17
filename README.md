# DayAdapt

A weather-aware outfit recommendation app that learns your wardrobe and suggests daily outfits based on real-time weather, your activity, and wear history.

---

## What It Does

**Wardrobe Scanning** — Upload photos of your clothing. Claude Vision auto-tags each item with warmth, breathability, waterproofing, occasion, and color. Tops are classified as inner (t-shirts, shirts) or outer (hoodies, jackets, coats). All other accessories (scarves, hats, gloves, thermals, umbrellas) fall under a single accessory category.

**Daily Outfit Recommendation** — A two-stage engine: algorithmic pre-filter narrows candidates by occasion match and weekly wear counts, then Claude reasons over the shortlist and returns a complete outfit with a plain-English explanation. Recommendations are cached per day and occasion so the app is instant on revisit.

**Occasion-Based Context** — Choose from Casual, Work, Gym, or Party. For gym, athletic-tagged items are always prioritised regardless of weather — the user is exercising indoors. Cold/rain commute suggestions appear in accessories instead.

**Outfit Slots** — Every recommendation fills: `top_inner` (mandatory base layer), `bottom` (mandatory), `footwear` (mandatory), `top_outer` (optional — only when cold, rainy, or occasion calls for it), and `optional` accessories.

**Readiness Score** — A 0–100 score computed server-side from slot coverage, warmth match vs feels-like temperature, rain readiness, and breathability in heat.

**Wear Logging & History** — Log what you're wearing each day. Logs are merged per date so logging a second occasion appends to the same day entry. Outfit history is visible in the Profile page for the last 30 days. Per-item deletion recomputes wear counts correctly.

**Wardrobe Insights** — Weekly and monthly utilization reports showing how often each item has been worn, surfacing items that rarely get used.

**Health Nudges** — High UV, rain probability, temperature drops, AQI, and pollen levels generate contextual callouts alongside the outfit.

**Demo Mode** — A "Try Demo" button on the welcome screen logs into a pre-seeded demo account. All write operations are blocked in demo mode so the demo data stays intact. A banner is shown on every page while in demo mode.

---

## Wear Frequency Logic

Items are excluded from recommendations based on how many times they've been worn in the last 7 days:

| Item type | Excluded after |
|---|---|
| `top_inner` / `bottom` | 2 wears this week |
| `top_outer` | 5 wears this week |
| `footwear` | Never excluded |
| `accessory` | Never excluded |

For gym activity, inner tops and bottoms skip the wear limit entirely — athletic wear is meant to repeat.

If filtering leaves fewer than 3 candidates in a slot, the filter is dropped and all items are passed to the LLM so there's always something to work with.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Vision + Reasoning | Claude Sonnet (Anthropic) |
| Weather & Air Quality | Open-Meteo (free, no API key) |
| Geocoding | Nominatim / OpenStreetMap |
| Pre-filter Engine | Custom algorithmic layer (Node.js) |
| Database / Auth / Storage | Supabase (PostgreSQL + RLS + Storage) |
| Backend | Node.js + Express |
| Frontend | React + Vite + Tailwind CSS |
| Hosting | Vercel (frontend) + Render (backend) |

---

## Date & Timezone Handling

All dates use the user's location timezone derived from Open-Meteo's `current.time` field (already expressed in local time) and the `timezone` field. Device UTC is never used for date comparisons. This ensures "Today" and "Yesterday" labels, wear log dates, and recommendation cache keys are always correct for the user's actual location.

---

## Demo Flow (Upcoming)

Click "Try Demo" on the welcome screen → loads a pre-seeded wardrobe with items across all categories → get a real outfit recommendation for your current weather → explore history and insights → click "Exit Demo" to return to the welcome screen.