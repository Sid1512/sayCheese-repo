# Weather & Environmental Data Sources

## 1. Data Sources

We use **Open-Meteo** (free, no API key) with two endpoints, and **Nominatim** for reverse geocoding.

| Metric | Source | Field | Notes |
|---|---|---|---|
| Temperature | Open-Meteo Weather | `temperature_2m` | Current + hourly |
| Feels-like | Open-Meteo Weather | `apparent_temperature` | Accounts for wind + humidity |
| UV index | Open-Meteo Weather | `uv_index` | Daily max |
| Wind speed | Open-Meteo Weather | `wind_speed_10m`, `wind_gusts_10m` | — |
| Rain / condition | Open-Meteo Weather | `weather_code`, `precipitation_probability`, `rain`, `snowfall` | WMO codes |
| Humidity | Open-Meteo Weather | `relative_humidity_2m` | — |
| Rain probability | Open-Meteo Weather | `precipitation_probability` | Hourly, next 8hrs |
| AQI | Open-Meteo Air Quality | `us_aqi` | Separate endpoint, same lat/lon |
| Pollen | Open-Meteo Air Quality | `pollen_grass`, `pollen_tree`, `pollen_weed` | Best coverage in Europe |
| Location name | Nominatim | `address.city` / `town` / `village` | Reverse geocode from lat/lon |

---

## 2. Timezone Handling

Open-Meteo returns `current.time` already expressed in the **location's local timezone** (e.g. `"2026-03-17T22:30"` for IST). The `timezone` field (e.g. `"Asia/Kolkata"`) is also returned.

All date comparisons in the app — wear log dates, "Today/Yesterday" labels, recommendation cache keys, history range — use `locationDate(currentTime, timezone)` from `weather.js`. This function:

1. Splits `current.time` on `"T"` to get the local date string directly
2. Falls back to `Intl.DateTimeFormat` with the IANA timezone string
3. Final fallback to device local date

Device UTC (`new Date().toISOString()`) is never used for user-facing date logic.

---

## 3. Two-Stage Recommendation Engine

### Stage 1 — Algorithmic Pre-filter (backend)

Runs first. Narrows the wardrobe to candidates per slot before the LLM sees anything.

**Slot model:**

| Slot | Type | Description |
|---|---|---|
| `top_inner` | Mandatory | Base layer tops (layer=inner or null) |
| `top_outer` | Optional | Outer layer tops (layer=outer) |
| `bottom` | Mandatory | — |
| `footwear` | Mandatory | Never filtered by wear count |
| `optional` | Optional | All accessories |

**Filters applied:**

**Occasion match** — Items are sorted by whether their `tags.occasion` matches the activity's occasion filter. Non-matching items are not removed — they're just ranked lower. Fallback: if no items match, all items are passed through.

Activity → occasion mapping:
- `gym` → `athletic`
- `work` → `work`, `office`, `formal`, `smart_casual`
- `party` → `party`, `formal`, `smart_casual`
- `casual` → no filter

**Weekly wear count filter** — Items worn too many times this week are excluded. Uses `times_worn_last_7_days` stored on each wardrobe item.

| Slot | Max wears per week |
|---|---|
| `top_inner` / `bottom` | 2 |
| `top_outer` | 5 |
| `footwear` | Never excluded |
| `accessory` | Never excluded |

For `gym` activity, `top_inner` and `bottom` skip the wear limit entirely.

**Fallback:** If filtering leaves fewer than 3 candidates in a slot, all items are used so the LLM always has a real choice.

**Rain preference** — When rain probability ≥ 50%, waterproof items are sorted to the top of footwear and optional slots (not excluded, just preferred).

### Stage 2 — LLM Selection (Claude Sonnet)

Claude receives the pre-filtered candidates per slot plus the full weather context and reasons over them to pick the final outfit.

The LLM is responsible for:
- Final item selection with reasons
- `top_outer` inclusion decision (cold, rainy, or occasion warrants it)
- Accessory text suggestions (e.g. "Bring an umbrella")
- Health insights (UV, rain, temperature drop, AQI, pollen)
- Activity suggestions (3–4 things to do today)
- Gym special rule: prioritise athletic items over warmth; handle cold/rain commute via accessory suggestions not the outfit itself

**Readiness score** is computed deterministically server-side (not by the LLM):

| Component | Max pts | Logic |
|---|---|---|
| Slot coverage | 30 | 10 per filled mandatory slot |
| Warmth match | 30 | Avg warmth vs ideal for feels_like temp |
| Rain readiness | 20 | Waterproof footwear + outer when rainy |
| Breathability | 10 | Avg breathability when feels_like > 22°C |

Raw score is out of 90 (comfort removed), normalised to 100.

---

## 4. Weather Object Shape

Returned alongside recommendations and candidates when lat/lon is provided:

```json
{
  "temperature_c": 7.2,
  "feels_like_c": 3.1,
  "humidity_pct": 82,
  "wind_kph": 18,
  "wind_gusts_kph": 31,
  "weather_code": 63,
  "weather_description": "Moderate rain",
  "is_rainy_or_snowy": true,
  "rain_probability": 0.85,
  "uv_index": 1,
  "current": {
    "time": "2026-03-17T14:30",
    "temperature_2m": 7.2,
    "apparent_temperature": 3.1,
    "precipitation": 0.4,
    "weather_code": 63,
    "wind_speed_10m": 18,
    "uv_index": 1
  },
  "hourly": {
    "time": ["2026-03-17T00:00", "..."],
    "temperature_2m": [5.1, "..."],
    "precipitation_probability": [20, "..."]
  },
  "environmental": {
    "us_aqi": 42,
    "pollen_grass": 0.2,
    "pollen_tree": 1.1,
    "pollen_weed": 0.0
  },
  "timezone": "Europe/London"
}
```

---

## 5. Caching

Recommendations are cached in `localStorage` keyed by `{ user_id, date, occasion, wardrobe_signature }`. The wardrobe signature is a sorted hash of all item IDs, tags, and last_worn_dates — so the cache is automatically invalidated when any item changes or a wear is logged.