# DayAdapt — Frontend

React + Vite + Tailwind CSS. Deployed on Vercel.

---

## Setup

```bash
cd frontend
npm install
npm run dev
```

Create a `.env` file:

```
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

For production, set `VITE_API_BASE_URL` to your Render backend URL in Vercel environment variables.

---

## Pages

| Route | Page | Description |
|---|---|---|
| `/onboarding` | Onboarding | Welcome, login, register, demo entry |
| `/` | Home | Daily outfit recommendation + wear logging |
| `/wardrobe` | Wardrobe | Scan, browse, edit, and delete items |
| `/profile` | Profile | Stats, insights, outfit history, item editing |

---

## Key Architecture

**`AppContext`** — Global state for `user`, `weather`, `wardrobe`, `location`, `locationName`, `demoMode`. Initialises on mount: fetches weather (with geolocation), then loads profile and wardrobe if logged in.

**`api.js`** — All API calls go through a central `request()` function. In demo mode, all `POST`, `PATCH`, and `DELETE` requests are silently blocked and return a fake success. `GET` requests pass through normally.

**Recommendation cache** — Stored in `localStorage` keyed by `{ user_id, date, occasion, wardrobe_signature }`. Automatically invalidated when wardrobe changes or a new day begins.

**Manual picks** — Stored separately in `localStorage` under `dayadapt_manual_picks_v1`. Persists across recommendation refreshes so "Choose other" selections survive.

---

## Demo Mode (Upcoming)

Clicking "Try Demo" on the welcome screen logs into a pre-seeded demo account and sets `dayadapt_demo_mode=true` in localStorage. A banner is shown on every page. All write operations are blocked. Clicking "Exit Demo" logs out and clears the flag.

---

## Date & Timezone

All date logic uses `locationDate(currentTime, timezone)` from `services/weather.js`. This extracts the local date from Open-Meteo's `current.time` string (already in the location's timezone) rather than using device UTC. This ensures wear log dates, "Today/Yesterday" labels, and cache keys are always correct for the user's location.

---

## Services

| File | Responsibility |
|---|---|
| `api.js` | Central fetch wrapper with auth headers, 401 handling, demo mode blocking |
| `auth.js` | Login, register, logout, token storage |
| `wardrobe.js` | Scan, list, add, update, delete items |
| `wearLog.js` | Log wear, get history, remove item from log |
| `recommendations.js` | Get recommendation |
| `insights.js` | Wardrobe utilization |
| `user.js` | Get and update profile |
| `weather.js` | Fetch weather + air quality, `locationDate()`, `reverseGeocode()` |