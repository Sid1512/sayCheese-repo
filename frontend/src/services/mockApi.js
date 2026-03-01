const MOCK_DB_KEY = "dayadapt_mock_db_v1";
const MOCK_DB_VERSION = 2;
const MOCK_USER_ID = "mock-user-1";
const MOCK_TOKEN = "mock-token-1";

function isoDate(date = new Date()) {
  return date.toISOString().split("T")[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function createSeedWardrobe() {
  return [
    {
      item_id: "top-1",
      name: "White Moisture-Wick Tee",
      description: "Light, breathable tee for warm and humid days",
      category: "top",
      image_url: "",
      tags: { color: "white", warmth: 1, breathability: 5, waterproof: false, occasion: ["casual", "gym", "outdoor"], sustainabilityScore: 4, user_comfort: 5 },
      times_worn: 6,
      last_worn_date: daysAgo(2),
    },
    {
      item_id: "top-2",
      name: "Navy Oxford Shirt",
      description: "Mid-weight button-up for smart casual and office days",
      category: "top",
      image_url: "",
      tags: { color: "navy", warmth: 2, breathability: 3, waterproof: false, occasion: ["work", "smart_casual", "formal"], sustainabilityScore: 3, user_comfort: 4 },
      times_worn: 2,
      last_worn_date: daysAgo(6),
    },
    {
      item_id: "top-3",
      name: "Merino Base Layer",
      description: "Thermal long-sleeve base for cold mornings",
      category: "top",
      image_url: "",
      tags: { color: "charcoal", warmth: 4, breathability: 3, waterproof: false, occasion: ["casual", "outdoor"], sustainabilityScore: 4, user_comfort: 5 },
      times_worn: 1,
      last_worn_date: daysAgo(8),
    },
    {
      item_id: "bottom-1",
      name: "Black Jeans",
      description: "All-season denim for casual and cooler weather",
      category: "bottom",
      image_url: "",
      tags: { color: "black", warmth: 3, breathability: 2, waterproof: false, occasion: ["casual", "work", "outdoor"], sustainabilityScore: 3, user_comfort: 4 },
      times_worn: 3,
      last_worn_date: daysAgo(1),
    },
    {
      item_id: "bottom-2",
      name: "Beige Chinos",
      description: "Lightweight chinos for mild and warm days",
      category: "bottom",
      image_url: "",
      tags: { color: "beige", warmth: 1, breathability: 4, waterproof: false, occasion: ["casual", "work", "smart_casual"], sustainabilityScore: 4, user_comfort: 5 },
      times_worn: 2,
      last_worn_date: daysAgo(3),
    },
    {
      item_id: "bottom-3",
      name: "Athletic Joggers",
      description: "Stretch joggers for active or windy days",
      category: "bottom",
      image_url: "",
      tags: { color: "slate", warmth: 2, breathability: 4, waterproof: false, occasion: ["gym", "outdoor", "casual"], sustainabilityScore: 3, user_comfort: 5 },
      times_worn: 0,
      last_worn_date: null,
    },
    {
      item_id: "footwear-1",
      name: "White Sneakers",
      description: "Breathable low-top sneakers for dry weather",
      category: "footwear",
      image_url: "",
      tags: { color: "white", warmth: 1, breathability: 4, waterproof: false, occasion: ["casual", "gym", "outdoor"], sustainabilityScore: 3, user_comfort: 5 },
      times_worn: 5,
      last_worn_date: daysAgo(1),
    },
    {
      item_id: "footwear-2",
      name: "Waterproof Chelsea Boots",
      description: "Weatherproof boots for rain and cold",
      category: "footwear",
      image_url: "",
      tags: { color: "brown", warmth: 4, breathability: 2, waterproof: true, occasion: ["work", "formal", "outdoor"], sustainabilityScore: 4, user_comfort: 4 },
      times_worn: 2,
      last_worn_date: daysAgo(5),
    },
    {
      item_id: "jacket-1",
      name: "Light Denim Jacket",
      description: "Casual layer for breezy evenings",
      category: "jacket",
      image_url: "",
      tags: { color: "blue", warmth: 3, breathability: 3, waterproof: false, occasion: ["casual", "outdoor"], sustainabilityScore: 4, user_comfort: 4 },
      times_worn: 2,
      last_worn_date: daysAgo(4),
    },
    {
      item_id: "jacket-2",
      name: "Waterproof Parka",
      description: "Insulated rain shell for stormy weather",
      category: "jacket",
      image_url: "",
      tags: { color: "olive", warmth: 5, breathability: 2, waterproof: true, occasion: ["outdoor", "casual"], sustainabilityScore: 3, user_comfort: 4 },
      times_worn: 1,
      last_worn_date: daysAgo(7),
    },
    {
      item_id: "thermal-1",
      name: "Fleece Thermal Top",
      description: "Soft thermal layer for freezing conditions",
      category: "thermal",
      image_url: "",
      tags: { color: "gray", warmth: 5, breathability: 2, waterproof: false, occasion: ["outdoor", "casual"], sustainabilityScore: 4, user_comfort: 5 },
      times_worn: 1,
      last_worn_date: daysAgo(10),
    },
    {
      item_id: "hat-1",
      name: "Wide-Brim Sun Hat",
      description: "UPF-style hat for high UV afternoons",
      category: "hat",
      image_url: "",
      tags: { color: "tan", warmth: 1, breathability: 5, waterproof: false, occasion: ["outdoor", "casual"], sustainabilityScore: 4, user_comfort: 4 },
      times_worn: 0,
      last_worn_date: null,
    },
    {
      item_id: "umbrella-1",
      name: "Compact Umbrella",
      description: "Wind-resistant umbrella for rain alerts",
      category: "umbrella",
      image_url: "",
      tags: { color: "black", warmth: 1, breathability: 1, waterproof: true, occasion: ["outdoor", "work", "casual"], sustainabilityScore: 3, user_comfort: 4 },
      times_worn: 3,
      last_worn_date: daysAgo(9),
    },
    {
      item_id: "facemask-1",
      name: "Breathable Outdoor Mask",
      description: "Lightweight mask for poor AQI or pollen days",
      category: "facemask",
      image_url: "",
      tags: { color: "black", warmth: 1, breathability: 4, waterproof: false, occasion: ["outdoor", "gym", "casual"], sustainabilityScore: 4, user_comfort: 3 },
      times_worn: 0,
      last_worn_date: null,
    },
  ];
}

function createInitialDb() {
  return {
    version: MOCK_DB_VERSION,
    auth: {
      email: "",
      password: "",
      token: MOCK_TOKEN,
      user_id: MOCK_USER_ID,
    },
    user: {
      user_id: MOCK_USER_ID,
      name: "DayAdapt User",
      email: "user@example.com",
      preferences: {
        default_activity: "casual",
        mood_selector_enabled: true,
        age: "",
        gender: "",
        height: "",
        weight: "",
        skinTone: "Medium",
        stylePreference: [],
        comfortPriority: "comfort",
      },
    },
    wardrobe: createSeedWardrobe(),
    wearLog: [],
    lastItemSeq: 100,
  };
}

function readDb() {
  try {
    const raw = localStorage.getItem(MOCK_DB_KEY);
    if (!raw) return createInitialDb();
    const parsed = JSON.parse(raw);
    if (!parsed?.version || parsed.version < MOCK_DB_VERSION) {
      return {
        ...parsed,
        version: MOCK_DB_VERSION,
        wardrobe: createSeedWardrobe(),
        wearLog: [],
      };
    }
    return parsed;
  } catch {
    return createInitialDb();
  }
}

function writeDb(db) {
  localStorage.setItem(MOCK_DB_KEY, JSON.stringify(db));
}

function apiError(message, status = 400, code = "MOCK_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function parseBody(options) {
  const body = options?.body;
  if (!body) return {};
  if (typeof FormData !== "undefined" && body instanceof FormData) return body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function choose(items, fallback) {
  return items.length > 0 ? items[0] : fallback;
}

function getRecommendationFromWardrobe(wardrobe, mood, activity) {
  const top = choose(wardrobe.filter((i) => i.category === "top"), {
    item_id: "virtual-top",
    name: "Classic Top",
    reason: "A versatile top for daily wear.",
  });
  const bottom = choose(wardrobe.filter((i) => i.category === "bottom"), {
    item_id: "virtual-bottom",
    name: "Comfort Bottom",
    reason: "Balanced for movement and comfort.",
  });
  const footwear = choose(wardrobe.filter((i) => i.category === "footwear"), {
    item_id: "virtual-footwear",
    name: "Daily Sneakers",
    reason: "Reliable all-day support.",
  });
  const optional = wardrobe
    .filter((i) => ["jacket", "accessories", "hat", "scarf"].includes(i.category))
    .slice(0, 2)
    .map((item) => ({
      item_id: item.item_id,
      name: item.name,
      reason: "Optional layer/accessory for changing conditions.",
    }));

  return {
    outfit: {
      top: { item_id: top.item_id, name: top.name, reason: "Breathable base layer." },
      bottom: { item_id: bottom.item_id, name: bottom.name, reason: "Comfortable for your day." },
      footwear: { item_id: footwear.item_id, name: footwear.name, reason: "Good support and versatility." },
      optional,
    },
    explanation: `Mock recommendation tuned for a ${mood || "balanced"} mood and ${activity || "casual"} day.`,
    alternatives: [
      { replaces: "top", name: "Navy Oxford Shirt", reason: "Works well for a sharper look." },
      { replaces: "bottom", name: "Beige Chinos", reason: "Lighter option for comfort." },
    ],
    health_insights: [
      { type: "uv", severity: "info", message: "Apply sunscreen if you are outside for more than 20 minutes." },
    ],
    readiness_score: 82,
    activities: [
      "Take a 20-minute walk after lunch.",
      "Hydrate regularly through the afternoon.",
      "Plan one short outdoor break to reset.",
    ],
  };
}

function computeRange(period) {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (period === "week" ? 6 : 29));
  return { from: isoDate(fromDate), to: isoDate(toDate) };
}

function extractItemId(pathname) {
  const m = pathname.match(/^\/wardrobe\/items\/([^/]+)$/);
  return m ? m[1] : null;
}

function requireAuth(pathname) {
  return !pathname.startsWith("/auth/");
}

function isAuthed(token) {
  return !!token && token.startsWith("mock-token");
}

export function shouldForceMockApi() {
  return import.meta.env.VITE_USE_MOCK_API === "true";
}

export async function mockRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const [pathname, rawQuery] = path.split("?");
  const query = new URLSearchParams(rawQuery || "");
  const body = parseBody(options);
  const token = localStorage.getItem("dayadapt_token");

  const db = readDb();

  if (requireAuth(pathname) && !isAuthed(token)) {
    throw apiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (pathname === "/auth/register" && method === "POST") {
    if (!body.email || !body.password || !body.name) {
      throw apiError("Email, password, and name are required.", 400, "VALIDATION");
    }
    db.auth.email = body.email;
    db.auth.password = body.password;
    db.user = {
      ...db.user,
      name: body.name,
      email: body.email,
    };
    writeDb(db);
    return { token: db.auth.token, user_id: db.auth.user_id };
  }

  if (pathname === "/auth/login" && method === "POST") {
    if (!db.auth.email || !db.auth.password) {
      throw apiError("No mock account exists yet. Create one first.", 401, "INVALID_CREDENTIALS");
    }
    if (body.email !== db.auth.email || body.password !== db.auth.password) {
      throw apiError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }
    return { token: db.auth.token, user_id: db.auth.user_id };
  }

  if (pathname === "/user/profile" && method === "GET") {
    return db.user;
  }

  if (pathname === "/user/profile" && method === "PATCH") {
    db.user = {
      ...db.user,
      ...body,
      preferences: {
        ...(db.user.preferences || {}),
        ...(body.preferences || {}),
      },
    };
    writeDb(db);
    return db.user;
  }

  if (pathname === "/wardrobe" && method === "GET") {
    const category = query.get("category");
    const items = category
      ? db.wardrobe.filter((i) => i.category === category)
      : db.wardrobe;
    return { items };
  }

  if (pathname === "/wardrobe/scan" && method === "POST") {
    return {
      detected_item: {
        name: "Scanned Item",
        description: "Detected from photo (mock).",
        category: "top",
        image_url: "",
        tags: {
          color: "blue",
          warmth: 2,
          waterproof: false,
          sustainabilityScore: 3,
          user_comfort: 4,
        },
      },
    };
  }

  if (pathname === "/wardrobe/items" && method === "POST") {
    const id = `item-${db.lastItemSeq + 1}`;
    db.lastItemSeq += 1;
    const newItem = {
      item_id: id,
      name: body.name || "Untitled Item",
      description: body.description || "",
      category: body.category || "other",
      image_url: body.image_url || "",
      tags: body.tags || {},
      times_worn: 0,
      last_worn_date: null,
    };
    db.wardrobe.unshift(newItem);
    writeDb(db);
    return newItem;
  }

  const itemId = extractItemId(pathname);
  if (itemId) {
    const idx = db.wardrobe.findIndex((i) => i.item_id === itemId || i.id === itemId);
    if (idx === -1) throw apiError("Item not found", 404, "NOT_FOUND");

    if (method === "GET") return db.wardrobe[idx];

    if (method === "PATCH") {
      db.wardrobe[idx] = {
        ...db.wardrobe[idx],
        ...body,
        tags: { ...(db.wardrobe[idx].tags || {}), ...(body.tags || {}) },
      };
      writeDb(db);
      return db.wardrobe[idx];
    }

    if (method === "DELETE") {
      db.wardrobe.splice(idx, 1);
      writeDb(db);
      return null;
    }
  }

  if (pathname === "/recommendations" && method === "POST") {
    return getRecommendationFromWardrobe(db.wardrobe, body.mood, body.activity);
  }

  if (pathname === "/wear-log" && method === "POST") {
    const entry = {
      wear_log_id: `wear-${Date.now()}`,
      date: body.date || isoDate(),
      activity: body.activity || "casual",
      item_ids: Array.isArray(body.item_ids) ? body.item_ids : [],
    };
    db.wearLog.unshift(entry);
    entry.item_ids.forEach((id) => {
      const item = db.wardrobe.find((w) => w.item_id === id || w.id === id);
      if (item) {
        item.times_worn = (item.times_worn || 0) + 1;
        item.last_worn_date = entry.date;
      }
    });
    writeDb(db);
    return { success: true, entry };
  }

  if (pathname === "/wear-log" && method === "GET") {
    return { entries: db.wearLog };
  }

  if (pathname === "/insights/wardrobe-utilization" && method === "GET") {
    const period = query.get("period") || "month";
    const { from, to } = computeRange(period);
    const totalWears = db.wardrobe.reduce((sum, item) => sum + (item.times_worn || 0), 0);
    const unworn = db.wardrobe.filter((item) => !item.times_worn).length;
    return {
      period,
      from,
      to,
      total_wears: totalWears,
      summary:
        unworn > 0
          ? `You still have ${unworn} item(s) unworn. Try rotating them this ${period}.`
          : "Great rotation. Most items are getting used.",
      items: db.wardrobe.map((item) => ({
        item_id: item.item_id,
        name: item.name,
        times_worn: item.times_worn || 0,
        last_worn_date: item.last_worn_date || null,
      })),
    };
  }

  throw apiError(`Mock route not implemented for ${method} ${pathname}`, 404, "NOT_IMPLEMENTED");
}
