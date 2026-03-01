# Image → Vision LLM → Firebase: JSON Format

This doc defines the JSON shape at each step: **vision LLM output**, **optional scan cache in Firestore**, and **wardrobe item stored in Firestore**.

---

## 1. Flow overview

```
[User uploads image] → [Storage: scans/{userId}/{scanId}.jpg]
        → [Vision LLM] → structured JSON (see §2)
        → [Option A: return to FE only]
        → [Option B: save to Firestore scans/{scanId} for draft/recovery]
        → [User confirms] → [POST /wardrobe/items with same shape]
        → [Backend writes wardrobe_items/{itemId} + moves/copies image to wardrobe path]
```

- The **vision LLM** returns a single structured object (name, description, category, tags). It does **not** know `item_id`, `image_url` (we set that after upload), or any wear stats.
- **Firestore** stores documents with **camelCase** field names (common for Firestore/JS). The **REST API** uses **snake_case** per the API spec. The backend maps between them when reading/writing.

---

## 2. Vision LLM output (from image only)

This is the schema we ask the vision model to return (e.g. structured output / JSON mode). The model sees only the image and an optional `category_hint`; it does not set URLs or IDs.

```json
{
  "name": "Olive Waterproof Parka",
  "description": "Olive green hooded parka, waterproof shell, mid-calf length",
  "category": "jacket",
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
```

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `name` | string | yes | Short display name (e.g. "Navy Merino Sweater"). |
| `description` | string | no | One sentence: fabric, fit, style (e.g. "Navy merino crew neck, mid-weight, long sleeve"). |
| `category` | string | yes | One of: `top`, `bottom`, `footwear`, `thermal`, `jacket`, `scarf`, `hat`, `gloves`, `facemask`, `umbrella`. |
| `tags` | object | yes | See below. All tag fields required in output. |
| `tags.warmth` | int 1–5 | yes | 1 = very light, 5 = very warm. |
| `tags.breathability` | int 1–5 | yes | 1 = not breathable, 5 = very breathable. |
| `tags.waterproof` | boolean | yes | |
| `tags.occasion` | string[] | yes | At least one of: `casual`, `work`, `formal`, `outdoor`, `athletic`, `smart_casual`. |
| `tags.color` | string | yes | Primary color (e.g. "navy", "olive", "black"). |
| `tags.user_comfort` | int 1–5 | yes | Default 3 if unknown; LLM can estimate from fabric/type. |
| `confidence` | float 0–1 | no | Model’s confidence in the detection; not stored in wardrobe, used for API response only. |

**Backend after vision:** Backend adds `image_url` (Firebase Storage download URL for `scans/{userId}/{scanId}.jpg`) and returns the **API response** shape for `POST /wardrobe/scan` (see API spec), i.e. `scan_id`, `status`, `detected_item` = vision output + `image_url`.

---

## 3. Optional: Scan document in Firestore (draft before confirm)

If we persist scan results before the user confirms (e.g. for recovery or “save draft”):

**Collection:** `scans`  
**Document ID:** `scanId` (e.g. `scn_xyz789`)

**Fields (camelCase in Firestore):**

| Firestore field | Type | Description |
|------------------|------|-------------|
| `userId` | string | Owner. |
| `status` | string | e.g. `"complete"`, `"failed"`. |
| `createdAt` | timestamp | |
| `detectedItem` | map | Same nested shape as below (camelCase). |
| `imagePath` | string | Storage path, e.g. `scans/usr_abc123/scn_xyz789.jpg`. |

**`detectedItem` map (camelCase):**

```json
{
  "name": "Olive Waterproof Parka",
  "description": "Olive green hooded parka, waterproof shell, mid-calf length",
  "category": "jacket",
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

We do **not** store `confidence` in Firestore (optional; can drop). We do **not** store `image_url` in the scan doc if we always derive it from `imagePath` when building the API response.

---

## 4. Wardrobe item document in Firestore (after save)

When the user confirms (or adds manually), we write a **wardrobe item**. This is the source of truth for recommendations and wear tracking.

**Collection:** `wardrobe_items`  
**Document ID:** `itemId` (e.g. `itm_001`)

**Fields (camelCase in Firestore):**

| Firestore field | Type | Description |
|------------------|------|-------------|
| `userId` | string | Owner. |
| `name` | string | From LLM or user. |
| `description` | string | From LLM or user; optional. |
| `category` | string | One of the allowed categories. |
| `imageUrl` | string | Firebase Storage download URL (e.g. final path `users/{userId}/wardrobe/{itemId}.jpg`). |
| `tags` | map | Nested object (see below). |
| `timesWornLast7Days` | number | Integer; maintained by backend on wear-log. |
| `timesWornLast30Days` | number | Integer. |
| `lastWornDate` | string \| null | ISO date `YYYY-MM-DD` or null. |
| `addedAt` | timestamp | Set on create. |
| `confidence` | number \| null | 0–1; from vision LLM when item was created from scan; null for manual entry. |

**`tags` map (same structure in Firestore):**

```json
{
  "warmth": 4,
  "breathability": 3,
  "waterproof": false,
  "occasion": ["casual", "smart_casual"],
  "color": "navy",
  "user_comfort": 5
}
```

**Example full document (Firestore):**

```json
{
  "userId": "usr_abc123",
  "name": "Navy Merino Sweater",
  "description": "Navy merino crew neck sweater, mid-weight, long sleeve",
  "category": "top",
  "imageUrl": "https://firebasestorage.googleapis.com/.../users%2Fusr_abc123%2Fwardrobe%2Fitm_001.jpg",
  "tags": {
    "warmth": 4,
    "breathability": 3,
    "waterproof": false,
    "occasion": ["casual", "smart_casual"],
    "color": "navy",
    "user_comfort": 5
  },
  "timesWornLast7Days": 0,
  "timesWornLast30Days": 0,
  "lastWornDate": null,
  "addedAt": "2026-01-10T09:00:00Z",
  "confidence": 0.92
}
```

---

## 5. API ↔ Firestore mapping

- **API (REST)** uses **snake_case**: `image_url`, `times_worn_last_7_days`, `last_worn_date`, `added_at`.
- **Firestore** uses **camelCase**: `imageUrl`, `timesWornLast7Days`, `lastWornDate`, `addedAt`.

When the backend reads from Firestore to build a response (e.g. `GET /wardrobe`, `GET /wardrobe/items/:item_id`), it maps camelCase → snake_case. When it writes from the API (e.g. `POST /wardrobe/items`, `PATCH /wardrobe/items/:item_id`), it maps snake_case → camelCase. The **nested `tags` object** can stay as-is (lowercase keys) in both, or we could use camelCase for `user_comfort` → `userComfort` in Firestore; the API spec uses `user_comfort`, so if we keep `tags.user_comfort` in Firestore we only map the top-level fields.

**Recommendation:** Keep `tags` keys as in the spec (`warmth`, `breathability`, `waterproof`, `occasion`, `color`, `user_comfort`) in both API and Firestore to avoid extra mapping and to match the vision LLM output verbatim.

---

## 6. Summary table

| Stage | Where | Naming | Who sets what |
|-------|--------|--------|----------------|
| Vision LLM output | In-memory / API response | snake_case (API) | LLM: name, description, category, tags, confidence. Backend: adds image_url for scan. |
| Scan doc (optional) | Firestore `scans/{scanId}` | camelCase | Backend: userId, status, createdAt, imagePath; detectedItem = LLM output (camelCase top-level only if we map). |
| Wardrobe item | Firestore `wardrobe_items/{itemId}` | camelCase | Backend: itemId, userId, imageUrl (Storage), timesWorn*, lastWornDate, addedAt. User/LLM: name, description, category, tags. |

This keeps the **image → JSON (vision) → Firebase** format consistent and documentable for the backend and any FE that might read Firestore directly (e.g. admin).
