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

- **Stage 1 — Database pre-filter:** We **fetch weather first** (Open-Meteo) when location (lat/lon) is provided. Then we narrow the candidate set using: **category**, **occasion vs activity**, **wear recency**, and (using the fetched weather) **warmth** and **rain/waterproof** rules. The same weather object is returned with the candidates so the LLM can use it without a second API call.
- **Stage 2 — LLM filtering:** The model receives the **already-fetched weather** + environment + mood + the pre-filtered list, and applies remaining weather nuance (UV, visibility, wind, AQI, pollen), health insights, and mood-based choice and explanations.

---

## 3. Stage 1: Database Pre-filter (with weather-based warmth and rain)

When the recommendation flow is run with a location (lat/lon), we call the **weather API once**, then apply all filters below. When no location is provided, we skip weather and apply only category, occasion, and recency.

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
- **Sort** candidates by `last_worn_date` ascending (null or oldest first), so less recently worn items are preferred when we pass a limited list to the LLM.

### 3.4 Warmth (weather-based, when weather is available)

- We use **feels_like** (apparent temperature) from the weather API.
- **Cold (feels_like &lt; 10°C):** Include only items where `tags.warmth >= 3` (mid to very warm). Exclude very light layers.
- **Hot (feels_like &gt; 25°C):** Include only items where `tags.warmth <= 2` **and** `tags.breathability >= 3`. Exclude heavy or non-breathable items.
- **Mild (10–25°C):** No warmth filter; all items pass.

Thresholds are configurable (e.g. 10°C and 25°C) in the backend. If weather was not fetched (no lat/lon), this step is skipped.

### 3.5 Rain / waterproof (weather-based, when weather is available)

- We use **weather_code** (WMO) and **precipitation_probability** from the weather API. Rain is “significant” when the condition is rain/snow (e.g. WMO codes 61–67, 71–77, 80–82) or when max hourly precipitation probability ≥ 50%.
- **Footwear:** When rain is significant, include only items where `tags.waterproof === true`. If that yields zero items, **drop the filter** and keep all footwear (LLM can still prefer waterproof in Stage 2).
- **Jacket and umbrella (in optional list):** When rain is significant, include only jacket/umbrella items where `tags.waterproof === true`. If that yields zero optional items, drop the filter for optionals.
- **Top and bottom:** No rain filter in Stage 1 (LLM handles underlayers).

If weather was not fetched, this step is skipped.

### 3.6 What we do *not* do in the database pre-filter

- No UV, visibility, AQI, pollen, or wind rules — those are LLM-only.
- No scoring by “boost” from weather beyond the include/exclude rules above.

**Output of Stage 1:** Per-slot lists of full item objects (including `name`, `category`, `tags`, `description`, `last_worn_date`, etc.) and the **weather object** (temperature, feels_like, condition, rain_probability, etc.) so the LLM receives the same weather without a second API call. Cap list size per slot (e.g. top 10–15).

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
| **Weather fetch** | Open-Meteo (once per request when lat/lon provided) | Backend (weather service) |
| **Database pre-filter** | Category, `tags.occasion` vs activity, `last_worn_date` (exclude last 2 days; sort by recency), **warmth** (feels_like vs `tags.warmth`/`tags.breathability`), **rain** (waterproof for footwear and jacket/umbrella when rainy) | Backend (prefilter service) |
| **LLM filtering** | Same weather + pre-filtered list; remaining nuance (wind, UV, visibility, AQI, pollen), health insights, **mood** | LLM (prompt + model) |

Weather is fetched once; the same object is used for the pre-filter and passed through to the LLM. Warmth and rain are applied in the DB pre-filter when weather is available; the LLM still refines choices and writes explanations.
