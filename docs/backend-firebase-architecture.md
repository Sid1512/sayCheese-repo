# Backend & Database — Firebase Architecture

## Stack

- **Firebase Firestore** — NoSQL database for user profiles and wardrobe items (and wear logs).
- **Firebase Storage** — Clothing photos uploaded by users.
- **Firebase Hosting** — Deployment of the Node.js API (via Cloud Functions or a Node app behind Hosting).

## Firestore Collections

### `users`

- **Document ID:** `userId` (e.g. `usr_abc123`).
- **Fields:**  
  `email`, `name`, `passwordHash`, `createdAt`, `updatedAt`,  
  `location` (e.g. `{ city, lat, lon }`),  
  `preferences` (e.g. `{ default_activity, mood_selector_enabled }`).

### `wardrobe_items`

- **Document ID:** `itemId` (e.g. `itm_001`).
- **Fields:**  
  `userId`, `name`, `category`, `imageUrl` (Firebase Storage URL), `tags` (warmth, breathability, waterproof, occasion[], color, user_comfort),  
  `timesWornLast7Days`, `timesWornLast30Days`, `lastWornDate`, `addedAt`.
- **Composite index:** `userId` + `category` (and optionally `occasion`) for filtered list.

### `wear_logs`

- **Document ID:** `logId` (e.g. `log_abc456`).
- **Fields:**  
  `userId`, `date` (YYYY-MM-DD), `activity`, `itemIds[]`, `createdAt`.
- **Composite index:** `userId` + `date` for “get log by user and date range”.

### Optional: `scans`

- **Document ID:** `scanId` (e.g. `scn_xyz789`).
- **Fields:**  
  `userId`, `status`, `detectedItem` (same shape as wardrobe item), `createdAt`.  
  Used to persist scan results before user confirms and creates a wardrobe item.

## Firebase Storage

- **Path pattern:** `users/{userId}/wardrobe/{itemId}.jpg` (or `scans/{userId}/{scanId}.jpg` for scan uploads).
- **Rules:** Only authenticated user can read/write their own `users/{userId}/...` path.
- **URL:** After upload, use the download URL as `image_url` in Firestore (or use a CDN in front if needed).

## Firebase Hosting + API

- **Option A:** Node.js (Express/Fastify) app runs elsewhere (e.g. Cloud Run, VPS); Hosting is for frontend only.
- **Option B:** API implemented as **Firebase Cloud Functions** (Node.js), then callable via a single Hosting URL (e.g. `https://<project>.web.app/api/v1/...`) by routing `/api/*` to a function.
- **Option C:** Firebase Hosting “rewrites” to a Cloud Run service that runs the Node API.

For “Backend on Firebase Hosting”, Option B (Cloud Functions) is the usual approach: one Firebase project, one Hosting site, API as functions.

## Auth

- Use **Firebase Authentication** (email/password) or keep **custom JWT** issued after verifying email/password (stored in Firestore `users`).  
- If custom JWT: sign with `JWT_SECRET`; validate in middleware and resolve `userId` from token, then allow access only to that user’s Firestore documents and Storage paths.

## Env / API keys

- **Firebase:** `FIREBASE_PROJECT_ID`, service account JSON path or `GOOGLE_APPLICATION_CREDENTIALS` for Admin SDK in the Node backend.
- **Open-Meteo:** no key; Weather API + Air Quality API URLs in env.
- **Anthropic:** `ANTHROPIC_API_KEY` for vision and reasoning.

See project `.env.example` for the full list.
