# DayAdapt — API Specification

**Version:** 1.0.0 | **Base URL:** `/api/v1`

For **FE and BE** alignment: build in parallel using this contract.  
All requests require **Authentication** (see §1) unless marked **Public**.  
All responses are `application/json`. Timestamps are ISO 8601 UTC.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User Profile & Preferences](#2-user-profile--preferences)
3. [Wardrobe](#3-wardrobe)
4. [Wear Log](#4-wear-log)
5. [Recommendations](#5-recommendations)
6. [Weekly Planner](#6-weekly-planner)
7. [Wardrobe Utilization Insights](#7-wardrobe-utilization-insights)
8. [Data Models](#8-data-models)
9. [Error Format](#9-error-format)

---

## 1. Authentication

**Basic auth layer:** token-based. After login or register, the client sends the token on every request.

- **Public endpoints:** `POST /auth/register`, `POST /auth/login`
- **All other endpoints:** require header `Authorization: Bearer <token>`
- **Token:** returned in login/register response; use as-is until expiry (implementation-defined TTL and refresh strategy)

### `POST /auth/register` — Public

Register a new user.

**Request**

```json
{
  "email": "user@example.com",
  "password": "string",
  "name": "Jane Doe"
}
```

**Response `201`**

```json
{
  "user_id": "usr_abc123",
  "token": "eyJhbGci..."
}
```

---

### `POST /auth/login` — Public

**Request**

```json
{
  "email": "user@example.com",
  "password": "string"
}
```

**Response `200`**

```json
{
  "user_id": "usr_abc123",
  "token": "eyJhbGci..."
}
```

---

### `GET /auth/me` — Optional

Validate token and return current user id. Useful for FE to check session.

**Response `200`**

```json
{
  "user_id": "usr_abc123"
}
```

**Response `401`** — Invalid or missing token.

---

## 2. User Profile & Preferences

Used for **location** (weather), **default activity**, and **mood** (“how do you want to feel today?”).

### `GET /user/profile`

Returns the current user’s profile and preferences.

**Response `200`**

```json
{
  "user_id": "usr_abc123",
  "name": "Jane Doe",
  "email": "user@example.com",
  "location": {
    "city": "London",
    "lat": 51.5074,
    "lon": -0.1278
  },
  "preferences": {
    "default_activity": "casual",
    "mood_selector_enabled": true
  }
}
```

---

### `PATCH /user/profile`

Update profile or preferences. Send only fields being changed.

**Request**

```json
{
  "location": {
    "city": "Manchester",
    "lat": 53.4808,
    "lon": -2.2426
  },
  "preferences": {
    "default_activity": "office",
    "mood_selector_enabled": false
  }
}
```

**Response `200`** — Full updated profile (same shape as GET).

---

## 3. Wardrobe

**Wardrobe onboarding:** fixed categories per README.

- **Non-negotiables:** tops, pants, shoes.
- **Optional:** thermals, jackets, scarves, hats, gloves, facemask, umbrella.

Items are catalogued with: **description**, **warmth**, **breathability**, **waterproof**, **occasion tag**, **color**, **user comfort**.  
Vision LLM is used to auto-detect and tag items from photos (including generating `description`).

### `GET /wardrobe`

Returns all wardrobe items for the authenticated user.

**Query Parameters**

| Param       | Type   | Description                                                                 |
|------------|--------|-----------------------------------------------------------------------------|
| `category` | string | Filter by category (see [Data Models](#8-data-models) for allowed values) |
| `occasion` | string | Filter by occasion tag                                                      |
| `limit`    | int    | Default `50`, max `200`                                                    |
| `offset`   | int    | Pagination                                                                  |

**Response `200`**

```json
{
  "total": 42,
  "items": [
    {
      "item_id": "itm_001",
      "name": "Navy Merino Sweater",
      "description": "Navy merino crew neck sweater, mid-weight, long sleeve",
      "category": "top",
      "image_url": "https://cdn.example.com/items/itm_001.jpg",
      "tags": {
        "warmth": 4,
        "breathability": 3,
        "waterproof": false,
        "occasion": ["casual", "smart_casual"],
        "color": "navy",
        "user_comfort": 5
      },
      "times_worn_last_7_days": 6,
      "times_worn_last_30_days": 6,
      "last_worn_date": "2026-02-24",
      "added_at": "2026-01-10T09:00:00Z"
    }
  ]
}
```

---

### `POST /wardrobe/scan`

Upload a photo of a clothing item. LLM auto-detects and tags it.

**Request** — `multipart/form-data`

| Field           | Type   | Description                                      |
|-----------------|--------|--------------------------------------------------|
| `image`         | file   | JPEG or PNG, max 10MB                            |
| `category_hint` | string | Optional: `top`, `bottom`, `footwear`, or optional category name |

**Response `200`**

```json
{
  "scan_id": "scn_xyz789",
  "status": "complete",
  "detected_item": {
    "name": "Olive Waterproof Parka",
    "description": "Olive green hooded parka, waterproof shell, mid-calf length",
    "category": "jacket",
    "image_url": "https://cdn.example.com/scans/scn_xyz789.jpg",
    "tags": {
      "warmth": 5,
      "breathability": 2,
      "waterproof": true,
      "occasion": ["casual", "outdoor"],
      "color": "olive",
      "user_comfort": 4
    },
    "confidence": 0.92
  }
}
```

After this, FE shows the result for confirmation, then calls `POST /wardrobe/items` to save (payload can mirror `detected_item` plus `scan_id` if needed).

---

### `POST /wardrobe/items`

Add an item (e.g. after confirming a scan result, or manual entry). Accepts same tag shape as scan output.

**Request**

```json
{
  "name": "Olive Waterproof Parka",
  "description": "Olive green hooded parka, waterproof shell, mid-calf length",
  "category": "jacket",
  "image_url": "https://cdn.example.com/scans/scn_xyz789.jpg",
  "tags": {
    "warmth": 5,
    "breathability": 2,
    "waterproof": true,
    "occasion": ["casual", "outdoor"],
    "color": "olive",
    "user_comfort": 4
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `description` | No | Short text describing the item; can be auto-generated on scan or user-written. |

**Response `201`** — Created item (same shape as list item).

---

### `GET /wardrobe/items/:item_id`

Get a single item by ID.

**Response `200`** — Single item object (same shape as in list).

---

### `PATCH /wardrobe/items/:item_id`

Update name or tags. Send only fields to update.

**Request**

```json
{
  "name": "Olive Parka (hooded)",
  "description": "Olive hooded parka, waterproof, mid-calf",
  "tags": {
    "warmth": 5,
    "user_comfort": 3
  }
}
```

Send only fields being updated. `description` is optional.

**Response `200`** — Full updated item.

---

### `DELETE /wardrobe/items/:item_id`

Remove an item from the wardrobe.

**Response `204`** — No body.

---

## 4. Wear Log

**Outfit tracking:** user gets ~2 options per category (top, pant, accessory) plus “other”.  
If they pick “other”, they choose from their wardrobe. Selection is logged so the LLM avoids recommending the same outfit the next day.

### `POST /wear-log`

Save what the user is wearing today (after they’ve chosen from recommendations or from wardrobe).

**Request**

```json
{
  "date": "2026-02-28",
  "activity": "casual",
  "item_ids": ["itm_001", "itm_045", "itm_078"]
}
```

| Field        | Required | Notes                                                |
|-------------|----------|------------------------------------------------------|
| `date`      | No       | ISO date; defaults to today                          |
| `activity`  | No       | e.g. `gym`, `office`, `outdoor_brunch`, `casual`, `formal` |
| `item_ids`  | Yes      | IDs of items worn (from recommendation or wardrobe)  |

**Response `201`**

```json
{
  "log_id": "log_abc456",
  "date": "2026-02-28",
  "items_logged": 3
}
```

---

### `GET /wear-log`

Retrieve wear history (for tracking and insights).

**Query Parameters**

| Param     | Type   | Description           |
|-----------|--------|-----------------------|
| `from`    | date   | Start date (YYYY-MM-DD) |
| `to`      | date   | End date              |
| `item_id` | string | Filter by item        |

**Response `200`**

```json
{
  "entries": [
    {
      "log_id": "log_abc456",
      "date": "2026-02-28",
      "activity": "casual",
      "items": [
        { "item_id": "itm_001", "name": "Navy Merino Sweater" }
      ]
    }
  ]
}
```

---

## 5. Recommendations

**Daily outfit recommendation:** weather-aware, with algorithmic pre-filter and LLM reasoning.  
Returns ~2 options per fixed category (top, bottom, footwear) and from optional categories when relevant; plus a short human-readable explanation.  
Supports **activity-based customisation** and **mood** (enclothed cognition).  
**Health angles:** thermal safety, UV protection, activity-matched breathability.

### `POST /recommendations`

Generate a daily outfit recommendation.

**Request**

```json
{
  "date": "2026-02-28",
  "activity": "casual",
  "mood": "relaxed",
  "location": {
    "lat": 51.5074,
    "lon": -0.1278
  }
}
```

| Field      | Required | Notes                                                                 |
|------------|----------|-----------------------------------------------------------------------|
| `date`     | No       | Defaults to today                                                     |
| `activity` | No       | e.g. `work`, `gym`, `casual`, `outdoor`, `formal` — adjusts occasion and breathability |
| `mood`     | No       | `confident`, `relaxed`, `energised` — “how do you want to feel today?” |
| `location` | No       | Falls back to user profile location for weather                       |

**Response `200`**

```json
{
  "recommendation_id": "rec_001",
  "date": "2026-02-28",
  "weather": {
    "temperature_c": 7,
    "feels_like_c": 4,
    "condition": "rainy",
    "rain_probability": 0.85,
    "uv_index": 2,
    "humidity": 82,
    "wind_kph": 22
  },
  "health_insights": [
    {
      "type": "thermal",
      "severity": "warning",
      "message": "Temperature drops to 3°C after 6pm — your outer layer will be important."
    },
    {
      "type": "uv",
      "severity": "info",
      "message": "High UV today. We've prioritised long sleeves and coverage."
    }
  ],
  "outfit": {
    "top": {
      "item_id": "itm_001",
      "name": "Navy Merino Sweater",
      "reason": "Warm and breathable for the cold, damp conditions."
    },
    "bottom": {
      "item_id": "itm_045",
      "name": "Dark Navy Chinos",
      "reason": "Water marks won't show on dark fabric."
    },
    "footwear": {
      "item_id": "itm_078",
      "name": "Chelsea Boots",
      "reason": "Water-resistant and warm. Last worn 5 days ago."
    },
    "optional": [
      {
        "item_id": "itm_022",
        "name": "Olive Waterproof Parka",
        "reason": "Your only fully waterproof option — essential today."
      }
    ]
  },
  "explanation": "It's 7°C with heavy rain expected after 2pm. We've built an outfit around your waterproof parka and merino sweater to keep you warm and dry.",
  "alternatives": [
    {
      "replaces": "top",
      "item_id": "itm_033",
      "name": "Charcoal Fleece",
      "reason": "Slightly warmer alternative if you're feeling cold."
    }
  ]
}
```

`outfit` covers non-negotiables (top, bottom, footwear) and can include `optional` (e.g. jacket, scarf) when weather or activity demand it. `alternatives` provides roughly a second option per slot where applicable.

---

## 7. Wardrobe Utilization Insights

**Weekly/monthly wardrobe utilization:** so the user can see which items are worn less often.

### `GET /insights/wardrobe-utilization`

**Query Parameters**

| Param   | Type   | Description                          |
|---------|--------|--------------------------------------|
| `period`| string | `week` or `month`; default `month`   |

**Response `200`**

```json
{
  "period": "month",
  "from": "2026-02-01",
  "to": "2026-02-28",
  "total_wears": 42,
  "items": [
    {
      "item_id": "itm_001",
      "name": "Navy Merino Sweater",
      "times_worn": 8,
      "last_worn_date": "2026-02-24"
    },
    {
      "item_id": "itm_099",
      "name": "Green Linen Shirt",
      "times_worn": 0,
      "last_worn_date": null
    }
  ],
  "summary": "5 items haven't been worn this month — consider them for next week."
}
```

Items can be sorted by `times_worn` (e.g. ascending) to highlight underused pieces.

---

## 8. Data Models

### Wardrobe categories (README-aligned)

- **Non-negotiables:** `top`, `bottom`, `footwear`
- **Optional:** `thermal`, `jacket`, `scarf`, `hat`, `gloves`, `facemask`, `umbrella`

### ClothingItem

| Field                | Type    | Description |
|----------------------|---------|-------------|
| `item_id`            | string  | Unique identifier |
| `name`               | string  | Display name |
| `description`        | string  | Short text describing the item (e.g. fabric, fit, style); from vision LLM on scan or user-editable |
| `category`           | enum    | One of the categories above |
| `image_url`          | string  | Hosted image URL |
| `times_worn`         | int     | Lifetime wear count |
| `last_worn_date`     | date    | ISO date or null |
| `added_at`           | string  | ISO 8601 UTC |
| `tags.warmth`        | int 1–5 | 1 = very light, 5 = very warm |
| `tags.breathability` | int 1–5 | 1 = not breathable, 5 = very breathable |
| `tags.waterproof`    | boolean | — |
| `tags.occasion`      | string[]| e.g. `casual`, `work`, `formal`, `outdoor`, `athletic`, `smart_casual` |
| `tags.color`         | string  | Primary color label |
| `tags.user_comfort`  | int 1–5 | How comfortable the user finds this item |

### Activity (examples)

`casual` `work` `gym` `outdoor` `formal` `outdoor_brunch` `office`

### Mood (enclothed cognition)

`confident` `relaxed` `energised`

---

## 9. Error Format

All errors use this structure:

```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No wardrobe item found with ID itm_999.",
    "status": 404
  }
}
```

**Common codes**

| Code                    | HTTP | Description |
|-------------------------|------|-------------|
| `UNAUTHORIZED`           | 401  | Missing or invalid token |
| `FORBIDDEN`              | 403  | Resource belongs to another user |
| `ITEM_NOT_FOUND`         | 404  | Wardrobe item does not exist |
| `SCAN_FAILED`            | 422  | Vision LLM could not process the image |
| `WEATHER_UNAVAILABLE`    | 503  | Weather API unreachable |
| `RECOMMENDATION_FAILED`  | 503  | LLM recommendation could not be generated |
| `VALIDATION_ERROR`      | 400  | Request body failed validation |

---

*DayAdapt API v1.0 — Aligned with README features and basic auth. Last updated February 2026.*
