# Weather & Environmental Data Sources

## 1. Where Each Metric Comes From

We use **Open-Meteo** (free, no API key) with two endpoints:

| Metric | Source | Open-Meteo endpoint | Notes |
|--------|--------|---------------------|--------|
| **Temperature** | Open-Meteo Weather | `temperature_2m` | Current / hourly |
| **Feels-like temp** | Open-Meteo Weather | `apparent_temperature` | Accounts for wind, humidity (wind chill / heat index effect) |
| **Wind chill** | Open-Meteo Weather | Same as above | `apparent_temperature` is the “feels like” including wind |
| **UV index** | Open-Meteo Weather | `uv_index` (daily) or `uv_index_clear_sky` | Daily max typical for outfit advice |
| **Visibility** | Open-Meteo Weather | `visibility` | In metres; important for running/safety |
| **Wind speed** | Open-Meteo Weather | `wind_speed_10m`, `wind_gusts_10m` | For wind chill and “windy day” logic |
| **Rain / condition** | Open-Meteo Weather | `weather_code`, `precipitation_probability`, `rain`, `snowfall` | For waterproof / layer logic |
| **Humidity** | Open-Meteo Weather | `relative_humidity_2m` | For breathability |
| **AQI** | Open-Meteo Air Quality | `us_aqi` or `european_aqi` | Separate Air Quality API call, same lat/lon |
| **Pollen** | Open-Meteo Air Quality | `pollen_*` (e.g. grass, tree, weed) | Optional; coverage best in Europe during pollen season |

### API calls in the backend

- **Weather:** `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=...&daily=uv_index,...&current=...`
- **Air quality (AQI + optional pollen):** `GET https://air-quality.api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&hourly=us_aqi,pollen_grass,...`

No API keys required.

---

## 2. Pre-filter vs LLM: Two-Stage Filtering

We **cannot** implement full weather-based logic (temperature bands, rain, UV, visibility, AQI, pollen, wind nuance) using only database fields. Those require combining weather context with item attributes in a single step. So filtering is split into:

- **Stage 1 — Database pre-filter:** Use only data stored in the DB to narrow the candidate set (category, occasion vs activity, wear recency). Keeps the list small and relevant.
- **Stage 2 — LLM filtering:** The model receives weather + environment + mood + the pre-filtered list, and applies all weather-based, health, and mood-based logic to pick items and write explanations.

---

## 3. Stage 1: Database Pre-filter (Basic Filtering)

Uses **only** fields we have in the database. No interpretation of temperature, rain, or other live weather — that is left to the LLM.

### 3.1 Category (required slots)

- **Non-negotiables:** For the recommendation request we need at least one candidate per slot. Query items where `category` is:
  - `top` for the top slot
  - `bottom` for the bottom slot  
  - `footwear` for the footwear slot
- **Optionals:** Query items where `category` is one of: `thermal`, `jacket`, `scarf`, `hat`, `gloves`, `facemask`, `umbrella`. These are passed to the LLM as optional; the LLM decides if weather/activity need them.
- **Rule:** If for any non-negotiable slot the query returns zero items, do **not** remove the slot; return whatever the user has (e.g. one top). No “relaxing” of weather rules here — we only have DB metrics.

### 3.2 Activity ↔ occasion (database only)

- We have `activity` from the request (e.g. `gym`, `office`, `casual`, `formal`, `outdoor_brunch`).
- We have `tags.occasion` on each item (e.g. `["casual","smart_casual"]`).
- **Include** items where `tags.occasion` has at least one value that matches the activity (or a mapping, e.g. `office` → allow `work`, `office`, `smart_casual`, `formal`).
- **Mapping examples:**  
  - `gym` → include if `athletic` in occasion  
  - `office` / `work` → include if `work`, `office`, `formal`, `smart_casual` in occasion  
  - `formal` → include if `formal` or `smart_casual` in occasion  
  - `outdoor` / `outdoor_brunch` → include if `outdoor` or `casual` in occasion  
  - `casual` → include all (no occasion filter, or allow any)
- If after this filter a slot has no items, **drop the activity filter** for that slot only so we still send something to the LLM (the LLM can then say “no perfect match for office, but here’s a casual option”).

### 3.3 Wear recency (avoid repetition)

- We have `last_worn_date` (and optionally `times_worn_last_7_days`) in the DB.
- **Exclude** items where `last_worn_date` is within the last **2 days** (configurable window). So if today is 2026-02-28, exclude items with `last_worn_date` in [2026-02-26, 2026-02-27, 2026-02-28].
- **Optional soft rule:** Down-rank (but do not exclude) items worn in the last 5–7 days, e.g. by sorting so “not worn in 7 days” appear first. Implementation: sort candidates by `last_worn_date` ascending (null or oldest first), so less recently worn items are preferred when we pass a limited list to the LLM.

### 3.4 What we do *not* do in the database pre-filter

- No temperature or feels-like bands (we don’t filter by `tags.warmth` using weather in the DB layer).
- No rain/waterproof rules (we don’t exclude non-waterproof items here).
- No UV, visibility, AQI, pollen, or wind rules.
- No scoring by “boost” from weather — that is all LLM.

**Output of Stage 1:** Per-slot lists of item IDs (and full item objects, including `name`, `category`, `tags`, `description`, `last_worn_date`, etc.) that the LLM will choose from. Cap list size per slot (e.g. top 10–15) so the prompt stays manageable.

---

## 4. Stage 2: LLM Filtering (Weather, Health, Mood)

The LLM receives:

- **Weather & environment:** temperature, feels-like, condition, rain probability, UV index, visibility, wind speed/gusts, humidity, AQI, optional pollen.
- **Activity** and **mood** from the request.
- **Pre-filtered items** per slot (top, bottom, footwear, optional), each with: `item_id`, `name`, `description`, `category`, `tags` (warmth, breathability, waterproof, occasion, color, user_comfort), `last_worn_date`.

The LLM is responsible for:

### 4.1 Temperature / feels-like

- Prefer **warmth 4–5** when feels-like is cold (e.g. &lt; 10°C); prefer **warmth 1–2** and **high breathability** when hot (e.g. &gt; 25°C); mid-range warmth for mild days.
- Suggest **optional** layers (jacket, scarf, hat, thermals) when feels-like is low or dropping later.

### 4.2 Rain / precipitation

- Prefer **waterproof** for outer layer and footwear when rain probability is high or condition is rainy/snowy; treat non-waterproof as underlayers only when appropriate.

### 4.3 Wind

- Prefer items that stay put in wind (e.g. close-fitting, wind-resistant) when wind speed/gusts are high; factor wind into “feels like” when explaining.

### 4.4 UV index

- When UV is high (e.g. &gt; 5), prefer more coverage (long sleeves, hat); when very high (&gt; 7), strongly prefer coverage and mention UV in health_insights.

### 4.5 Visibility (e.g. running)

- When visibility is low and activity is running/outdoor, prefer brighter or high-vis items when the item’s `description` or `tags.color` suggests it; add a safety note in health_insights if relevant.

### 4.6 AQI

- When AQI is high (e.g. &gt; 100), prefer facemask in optionals if available and mention air quality in health_insights.

### 4.7 Pollen (optional)

- When pollen is high, prefer facemask and coverage; optionally mention in explanation.

### 4.8 Mood-based filtering (enclothed cognition)

- **Mood** is “how do you want to feel today?” — values: `confident`, `relaxed`, `energised`. The LLM uses this to bias **which** items it picks from the shortlist and **how it explains** them, not to add new items.
- **How the LLM applies mood:**
  - **Confident:** Prefer items that read as put-together and intentional: structured silhouettes, “sharp” or “polished” pieces (e.g. blazers, tailored trousers, clean lines). In `tags`, prefer `occasion` like `formal`, `smart_casual`, `work`. In `description`, favour items that sound structured, fitted, or classic. The explanation can mention feeling confident and ready for the day.
  - **Relaxed:** Prefer items that read as comfortable and low-effort: soft fabrics, loose fits, cosy layers. Prefer high `user_comfort` and `occasion` like `casual`. Use `description` to pick “soft”, “loose”, “comfortable” items. Explanation can emphasise comfort and ease.
  - **Energised:** Prefer items that read as active or uplifting: sporty, bright colors, breathable/athletic pieces. Prefer `occasion` like `athletic`, `outdoor` and higher `breathability`. Use `description` for “lightweight”, “breathable”, “bright”, “sporty”. Explanation can mention feeling ready to move or that the outfit supports an active day.
- **Prompt instructions for mood:** In the system/user prompt, we explicitly tell the LLM: “The user’s mood today is {mood}. Use this to favour items whose style and description align with that feeling (confident → structured and sharp; relaxed → comfortable and soft; energised → sporty and breathable). Mention the mood in your explanation only when it naturally fits.”
- **Fallback:** If mood is omitted or null, the LLM ignores mood and chooses purely on weather + activity.

---

## 5. Summary

| Layer | What we use | Who does it |
|-------|-------------|-------------|
| **Database pre-filter** | Category, `tags.occasion` vs activity, `last_worn_date` (exclude last 2 days; optionally sort by recency) | Backend (queries + light logic) |
| **LLM filtering** | Temperature/feels-like, rain, wind, UV, visibility, AQI, pollen, **mood** | LLM (prompt + model) |

The database only does basic, deterministic filtering so the LLM gets a manageable, relevant shortlist. All weather-based, health, and mood-based decisions and explanations are done by the LLM.
