# DayAdapt — API Specification

**Version:** 2.0.0 | **Base URL:** `/api/v1`

All requests require **Authentication** unless marked **Public**.
All responses are `application/json`. Dates are `YYYY-MM-DD`. Timestamps are ISO 8601 UTC.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User Profile](#2-user-profile)
3. [Wardrobe](#3-wardrobe)
4. [Wear Log](#4-wear-log)
5. [Recommendations](#5-recommendations)
6. [Wardrobe Utilization Insights](#6-wardrobe-utilization-insights)
7. [Data Models](#7-data-models)
8. [Error Format](#8-error-format)

---

## 1. Authentication

Token-based. After login or register, send the token on every request.

- **Public endpoints:** `POST /auth/register`, `POST /auth/login`
- **All other endpoints:** require `Authorization: Bearer <token>`

### `POST /auth/register` — Public

**Request**
```json
{
  "email": "user@example.com",
  "password": "string",
  "name": "Jane Doe",
  "preferences": {
    "age": "28",
    "gender": "Female",
    "height": "165",
    "weight": "60",
    "skinTone": "Medium",
    "stylePreference": ["casual", "smart_casual"]
  }
}
```

**Response `201`**
```json
{ "user_id": "usr_abc123", "token": "eyJhbGci..." }
```

---

### `POST /auth/login` — Public

**Request**
```json
{ "email": "user@example.com", "password": "string" }
```

**Response `200`**
```json
{ "user_id": "usr_abc123", "token": "eyJhbGci..." }
```

---

### `GET /auth/me`

Validate token and return current user id.

**Response `200`**
```json
{ "user_id": "usr_abc123" }
```

---

## 2. User Profile

### `GET /user/profile`

**Response `200`**
```json
{
  "user_id": "usr_abc123",
  "name": "Jane Doe",
  "email": "user@example.com",
  "preferences": {
    "age": "28",
    "gender": "Female",
    "height": "165",
    "weight": "60",
    "skinTone": "Medium",
    "stylePreference": ["casual", "smart_casual"]
  }
}
```

---

### `PATCH /user/profile`

Send only fields being changed.

**Response `200`** — Full updated profile.

---

## 3. Wardrobe

### `GET /wardrobe`

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `category` | string | Filter by category |
| `occasion` | string | Filter by occasion tag |
| `limit` | int | Default `50`, max `200` |
| `offset` | int | Pagination |

**Response `200`**
```json
{
  "total": 14,
  "items": [
    {
      "item_id": "itm_001",
      "name": "Navy Merino Sweater",
      "description": "Navy merino crew neck, mid-weight, long sleeve",
      "category": "top",
      "layer": "inner",
      "image_url": "https://cdn.supabase.co/...",
      "tags": {
        "warmth": 4,
        "breathability": 3,
        "waterproof": false,
        "occasion": ["casual", "smart_casual"],
        "color": "navy"
      },
      "times_worn_last_7_days": 1,
      "times_worn_last_30_days": 3,
      "last_worn_date": "2026-03-14",
      "added_at": "2026-01-10T09:00:00Z"
    }
  ]
}
```

---

### `POST /wardrobe/scan`

Upload a photo. Claude Vision auto-detects and tags the item.

**Request** — `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `image` | file | JPEG, PNG, or WEBP, max 10MB |
| `category_hint` | string | Optional: `top`, `bottom`, `footwear`, `accessory` |

**Response `200`**
```json
{
  "scan_id": "scn_xyz789",
  "status": "complete",
  "detected_item": {
    "name": "Olive Waterproof Parka",
    "description": "Olive hooded parka, waterproof shell, mid-calf length",
    "category": "top",
    "layer": "outer",
    "image_url": "https://cdn.supabase.co/...",
    "tags": {
      "warmth": 5,
      "breathability": 2,
      "waterproof": true,
      "occasion": ["casual", "outdoor"],
      "color": "olive"
    }
  }
}
```

After this, the frontend shows the result for confirmation, then calls `POST /wardrobe/items` to save.

---

### `POST /wardrobe/items`

Add an item after confirming a scan result.

**Request**
```json
{
  "name": "Olive Waterproof Parka",
  "description": "Olive hooded parka, waterproof shell, mid-calf length",
  "category": "top",
  "layer": "outer",
  "image_url": "https://cdn.supabase.co/...",
  "tags": {
    "warmth": 5,
    "breathability": 2,
    "waterproof": true,
    "occasion": ["casual"],
    "color": "olive"
  }
}
```

**Response `201`** — Created item (same shape as list item).

---

### `GET /wardrobe/items/:item_id`

**Response `200`** — Single item object.

---

### `PATCH /wardrobe/items/:item_id`

Update name, layer, or tags. Send only fields to update.

**Request**
```json
{
  "name": "Olive Parka",
  "layer": "outer",
  "tags": {
    "warmth": 5,
    "waterproof": true,
    "occasion": ["casual", "work"]
  }
}
```

**Response `200`** — Full updated item.

---

### `DELETE /wardrobe/items/:item_id`

**Response `204`** — No body.

---

## 4. Wear Log

### `POST /wear-log`

Log what the user is wearing. If a log already exists for this date, item IDs are merged and the new activity is appended to the activities array. Wear counts are only incremented for newly added items.

**Request**
```json
{
  "date": "2026-03-17",
  "activity": "casual",
  "item_ids": ["itm_001", "itm_045", "itm_078"]
}
```

**Response `201`**
```json
{
  "log_id": "log_abc456",
  "date": "2026-03-17",
  "items_logged": 3
}
```

---

### `GET /wear-log`

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `from` | date | Start date `YYYY-MM-DD` |
| `to` | date | End date |
| `item_id` | string | Filter by item |

**Response `200`**
```json
{
  "entries": [
    {
      "log_id": "log_abc456",
      "date": "2026-03-17",
      "activities": ["casual", "gym"],
      "items": [
        { "item_id": "itm_001", "name": "Navy Merino Sweater" }
      ]
    }
  ]
}
```

Note: `activities` is an array — multiple occasions can be logged on the same date.

---

### `PATCH /wear-log/:log_id/remove-item`

Remove a single item from a log entry. If no items remain, the log is deleted entirely. Wear counts are recomputed for the removed item.

**Request**
```json
{ "item_id": "itm_001" }
```

**Response `200`**
```json
{
  "removed": "itm_001",
  "log_id": "log_abc456",
  "items_remaining": 2
}
```

---

## 5. Recommendations

Location (lat/lon) is provided by the frontend from the browser Geolocation API. When provided, weather is fetched and used for both pre-filtering and LLM reasoning.

### `GET /recommendations/candidates`

Pre-filtered candidate items per slot.

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `activity` | string | `casual`, `work`, `gym`, `party` |
| `date` | string | `YYYY-MM-DD`, default today |
| `limit_per_slot` | number | Default 25, max 50 |
| `lat` | number | Latitude for weather |
| `lon` | number | Longitude for weather |

**Response `200`**
```json
{
  "date": "2026-03-17",
  "activity": "casual",
  "candidates": {
    "top_inner": [{ "item_id": "itm_001", "name": "...", "tags": {}, "layer": "inner", "last_worn_date": null }],
    "top_outer": [],
    "bottom": [],
    "footwear": [],
    "optional": []
  },
  "counts": { "top_inner": 4, "top_outer": 2, "bottom": 3, "footwear": 2, "optional": 1 },
  "weather": { "temperature_c": 7, "feels_like_c": 4, "is_rainy_or_snowy": true, "rain_probability": 0.85, "uv_index": 2 }
}
```

---

### `POST /recommendations`

Generate a daily outfit recommendation.

**Request**
```json
{
  "date": "2026-03-17",
  "activity": "casual",
  "location": { "lat": 51.5074, "lon": -0.1278 }
}
```

**Response `200`**
```json
{
  "recommendation_id": "rec_001",
  "date": "2026-03-17",
  "outfit": {
    "top_inner": { "item_id": "itm_001", "name": "Navy Merino Sweater", "reason": "Warm base layer for cold conditions." },
    "top_outer": { "item_id": "itm_022", "name": "Olive Waterproof Parka", "reason": "Your only waterproof outer layer." },
    "bottom": { "item_id": "itm_045", "name": "Dark Navy Chinos", "reason": "Water marks won't show on dark fabric." },
    "footwear": { "item_id": "itm_078", "name": "Chelsea Boots", "reason": "Water-resistant and warm." },
    "optional": [{ "item_id": "itm_033", "name": "Grey Scarf", "reason": "Extra warmth for the commute." }]
  },
  "accessories": ["Umbrella recommended — 85% rain chance", "Sunglasses not needed today"],
  "explanation": "It's 7°C with heavy rain expected. We've prioritised your waterproof parka and warm merino base.",
  "alternatives": [{ "replaces": "top_inner", "item_id": "itm_009", "name": "Charcoal Fleece", "reason": "Slightly warmer alternative." }],
  "health_insights": [{ "type": "rain", "severity": "warning", "message": "85% rain chance — waterproof outer layer recommended." }],
  "activities": ["Grab a coffee at your local café", "Indoor workout at the gym", "Catch up on reading"],
  "readiness_score": 87,
  "weather": { "temperature_c": 7, "feels_like_c": 4, "is_rainy_or_snowy": true, "rain_probability": 0.85, "uv_index": 2 }
}
```

`top_outer` is omitted from the outfit when weather is warm and occasion doesn't call for it.

---

## 6. Wardrobe Utilization Insights

### `GET /insights/wardrobe-utilization`

**Query Parameters**

| Param | Type | Description |
|---|---|---|
| `period` | string | `week` or `month`, default `week` |

**Response `200`**
```json
{
  "period": "week",
  "from": "2026-03-10",
  "to": "2026-03-17",
  "total_wears": 12,
  "items": [
    { "item_id": "itm_001", "name": "Navy Merino Sweater", "times_worn": 3, "last_worn_date": "2026-03-17" },
    { "item_id": "itm_099", "name": "Green Linen Shirt", "times_worn": 0, "last_worn_date": null }
  ],
  "summary": "3 items haven't been worn this week — consider them for your next outfit."
}
```

---

## 7. Data Models

### Categories

| Category | Description |
|---|---|
| `top` | All tops — use `layer` to distinguish inner vs outer |
| `bottom` | Trousers, jeans, shorts, skirts |
| `footwear` | All shoes — never excluded from recommendations |
| `accessory` | Scarves, hats, gloves, thermals, umbrellas, sunglasses, facemasks |

### Layer (tops only)

| Value | Examples |
|---|---|
| `inner` | T-shirts, shirts, blouses, tank tops |
| `outer` | Hoodies, cardigans, jackets, coats, raincoats |
| `null` | Non-top categories |

### Occasions

`casual` `work` `athletic` `smart_casual` `party` `formal`

### Activity → Occasion mapping

| Activity | Occasion filter |
|---|---|
| `gym` | `athletic` |
| `work` | `work`, `office`, `formal`, `smart_casual` |
| `party` | `party`, `formal`, `smart_casual` |
| `casual` | No filter (all items) |

### ClothingItem

| Field | Type | Description |
|---|---|---|
| `item_id` | string | Unique identifier (`itm_...`) |
| `name` | string | Display name |
| `description` | string | One sentence: fabric, fit, style |
| `category` | enum | `top`, `bottom`, `footwear`, `accessory` |
| `layer` | enum \| null | `inner` or `outer` for tops; null otherwise |
| `image_url` | string | Supabase Storage public URL |
| `tags.warmth` | int 1–5 | 1=very light, 5=very warm |
| `tags.breathability` | int 1–5 | 1=not breathable, 5=very breathable |
| `tags.waterproof` | boolean | — |
| `tags.occasion` | string[] | One or more occasion values |
| `tags.color` | string | Primary color |
| `times_worn_last_7_days` | int | Updated on every wear log |
| `times_worn_last_30_days` | int | Updated on every wear log |
| `last_worn_date` | date \| null | Not set for footwear |
| `added_at` | timestamp | ISO 8601 UTC |

### WearLog entry (GET response)

| Field | Type | Description |
|---|---|---|
| `log_id` | string | Unique identifier (`log_...`) |
| `date` | date | Location-aware date |
| `activities` | string[] | All occasions logged that day |
| `items` | array | `{ item_id, name }` for each logged item |

---

## 8. Error Format

```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No wardrobe item found with ID itm_999.",
    "status": 404
  }
}
```

| Code | HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Resource belongs to another user |
| `ITEM_NOT_FOUND` | 404 | Wardrobe item does not exist |
| `NOT_FOUND` | 404 | Wear log entry does not exist |
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

*DayAdapt API v2.0 — Last updated March 2026.*