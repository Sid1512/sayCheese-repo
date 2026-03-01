import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { getWeatherDescription, locationDate } from "../services/weather";
import { getRecommendation } from "../services/recommendations";
import { logWear } from "../services/wearLog";
import { useTheme } from "../App";

const OCCASIONS = ["casual", "work", "formal", "gym", "outdoor", "outdoor_brunch"];
const MOODS = [
  { value: "confident", emoji: "💪", label: "Confident" },
  { value: "relaxed", emoji: "😌", label: "Relaxed" },
  { value: "energised", emoji: "⚡", label: "Energised" },
];

const OCCASION_LABELS = {
  casual: "Casual",
  work: "Work",
  formal: "Formal",
  gym: "Gym",
  outdoor: "Outdoor",
  outdoor_brunch: "Brunch",
};

const SELECTED_OUTFIT_KEY = "dayadapt_selected_outfit_v1";
const RECOMMENDATION_CACHE_KEY = "dayadapt_recommendation_cache_v1";
const HOME_STATE_KEY = "dayadapt_home_state_v1";

export default function Home() {
  const { user, weather, wardrobe, location, locationName } = useApp();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [occasion, setOccasion] = useState("casual");
  const [mood, setMood] = useState("relaxed");
  const [homeStateHydrated, setHomeStateHydrated] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [selectedOutfit, setSelectedOutfit] = useState({
    top: null,
    bottom: null,
    footwear: null,
    optional: null,
  });
  const [clearedSlots, setClearedSlots] = useState({
    top: false,
    bottom: false,
    footwear: false,
  });
  const [selectedOutfitHydrated, setSelectedOutfitHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [activeTab, setActiveTab] = useState("outfit");
  const [wearLogged, setWearLogged] = useState(false);
  const todayDate = locationDate(weather?.current?.time, weather?.timezone);

  const wardrobeSignature = useMemo(() => {
    if (!Array.isArray(wardrobe) || wardrobe.length === 0) return "empty";
    return wardrobe
      .map((item) => {
        const id = item?.item_id || item?.id || "";
        const tags = item?.tags || {};
        return JSON.stringify({
          id,
          name: item?.name || "",
          category: item?.category || "",
          warmth: tags?.warmth ?? null,
          breathability: tags?.breathability ?? null,
          waterproof: tags?.waterproof ?? null,
          occasion: Array.isArray(tags?.occasion) ? [...tags.occasion].sort() : [],
          color: tags?.color ?? "",
          user_comfort: tags?.user_comfort ?? null,
          last_worn_date: item?.last_worn_date || null,
          times_worn_last_30_days: item?.times_worn_last_30_days ?? null,
        });
      })
      .sort()
      .join("|");
  }, [wardrobe]);

  const recommendationCacheKey = useMemo(
    () =>
      JSON.stringify({
        user_id: user?.user_id || user?.id || "anonymous",
        date: todayDate,
        occasion,
        mood,
        wardrobe_signature: wardrobeSignature,
      }),
    [user?.user_id, user?.id, todayDate, occasion, mood, wardrobeSignature]
  );

  const text = isDark ? "text-white" : "text-gray-900";
  const textMuted = isDark ? "text-white/60" : "text-gray-500";
  const textFaint = isDark ? "text-white/40" : "text-gray-400";
  const card = isDark ? "bg-white/10 border-white/20" : "bg-black/10 border-black/20";
  const cardInner = isDark ? "bg-white/10" : "bg-black/10";
  const pill = isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white";
  const pillInactive = isDark ? "bg-white/10 text-white border border-white/20" : "bg-black/10 text-gray-800 border border-black/20";
  const tabActive = isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white";
  const tabInactive = isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-800";

  useEffect(() => {
    const raw = localStorage.getItem(HOME_STATE_KEY);
    if (!raw) {
      setHomeStateHydrated(true);
      return;
    }

    try {
      const saved = JSON.parse(raw);
      if (saved?.occasion && OCCASIONS.includes(saved.occasion)) {
        setOccasion(saved.occasion);
      }
      if (saved?.mood && MOODS.some((m) => m.value === saved.mood)) {
        setMood(saved.mood);
      }
    } catch {
      // ignore malformed local data
    } finally {
      setHomeStateHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!homeStateHydrated) return;
    localStorage.setItem(
      HOME_STATE_KEY,
      JSON.stringify({
        occasion,
        mood,
      })
    );
  }, [occasion, mood, homeStateHydrated]);

  useEffect(() => {
    if (!homeStateHydrated) return;
    if (weather && user) fetchRecommendation();
  }, [weather, user, recommendationCacheKey, homeStateHydrated]);

  useEffect(() => {
    const raw = localStorage.getItem(SELECTED_OUTFIT_KEY);
    if (!raw) {
      setSelectedOutfitHydrated(true);
      return;
    }

    try {
      const saved = JSON.parse(raw);
      if (
        saved?.date === locationDate(weather?.current?.time, weather?.timezone) &&
        saved?.occasion === occasion &&
        saved?.mood === mood &&
        saved?.selectedOutfit
      ) {
        setSelectedOutfit(saved.selectedOutfit);
        setClearedSlots(saved.clearedSlots || { top: false, bottom: false, footwear: false });
      }
    } catch {
      // ignore malformed local data
    } finally {
      setSelectedOutfitHydrated(true);
    }
  }, [occasion, mood]);

  // Track which recommendation_id we last applied so we can tell when a fresh one arrives.
  const [appliedRecId, setAppliedRecId] = useState(null);

  useEffect(() => {
    if (!recommendation?.outfit) return;
    const recId = recommendation.recommendation_id ?? null;
    const isNewRec = recId !== appliedRecId;

    setSelectedOutfit((prev) => ({
      // If this is a brand-new recommendation (occasion/mood changed), always write its slots
      // so stale items from the previous recommendation are never shown.
      // If only clearedSlots changed (user toggling a slot), preserve their manual picks.
      top: clearedSlots.top ? null : (isNewRec ? recommendation.outfit.top || null : prev.top || recommendation.outfit.top || null),
      bottom: clearedSlots.bottom ? null : (isNewRec ? recommendation.outfit.bottom || null : prev.bottom || recommendation.outfit.bottom || null),
      footwear: clearedSlots.footwear ? null : (isNewRec ? recommendation.outfit.footwear || null : prev.footwear || recommendation.outfit.footwear || null),
      optional: isNewRec ? (recommendation.outfit.optional || []) : (prev.optional !== null ? prev.optional : (recommendation.outfit.optional || [])),
    }));

    if (isNewRec) setAppliedRecId(recId);
  }, [recommendation, clearedSlots]);

  useEffect(() => {
    const pickedSlot = searchParams.get("pickedSlot");
    const pickedItemId = searchParams.get("pickedItemId");
    if (!pickedSlot || !pickedItemId) return;

    if (pickedItemId === "none") {
      if (pickedSlot === "optional") {
        setSelectedOutfit((prev) => ({
          ...prev,
          optional: [],
        }));
      } else {
        setSelectedOutfit((prev) => ({
          ...prev,
          [pickedSlot]: null,
        }));
        setClearedSlots((prev) => ({ ...prev, [pickedSlot]: true }));
      }
      setWearLogged(false);
      navigate("/", { replace: true });
      return;
    }

    const pickedItem = wardrobe.find(
      (item) => String(item.item_id || item.id) === String(pickedItemId)
    );
    if (pickedItem) {
      setSelectedOutfit((prev) => ({
        ...prev,
        [pickedSlot]: pickedSlot === "optional" ? [pickedItem] : pickedItem,
      }));
      if (pickedSlot !== "optional") {
        setClearedSlots((prev) => ({ ...prev, [pickedSlot]: false }));
      }
      setWearLogged(false);
    }

    navigate("/", { replace: true });
  }, [searchParams, wardrobe, navigate]);


  useEffect(() => {
    if (!selectedOutfitHydrated) return;
    localStorage.setItem(
      SELECTED_OUTFIT_KEY,
      JSON.stringify({
        date: locationDate(weather?.current?.time, weather?.timezone),
        occasion,
        mood,
        selectedOutfit,
        clearedSlots,
      })
    );
  }, [selectedOutfit, clearedSlots, occasion, mood, selectedOutfitHydrated]);

  async function fetchRecommendation() {
    const cachedRaw = localStorage.getItem(RECOMMENDATION_CACHE_KEY);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached?.key === recommendationCacheKey && cached?.recommendation) {
          setRecommendation(cached.recommendation);
          return;
        }
      } catch {
        // ignore malformed cache
      }
    }

    setLoading(true);
    setFeedback(null);
    setWearLogged(false);
    try {
      const rec = await getRecommendation({
        activity: occasion,
        mood,
        location: location
          ? { lat: location.lat, lon: location.lon }
          : undefined,
        currentTime: weather?.current?.time,
        timezone: weather?.timezone,
      });
      setRecommendation(rec);
      localStorage.setItem(
        RECOMMENDATION_CACHE_KEY,
        JSON.stringify({
          key: recommendationCacheKey,
          recommendation: rec,
          savedAt: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogWear() {
    if (!recommendation) return;
    try {
      const optionalItems = selectedOutfit.optional?.length
        ? selectedOutfit.optional
        : (selectedOutfit.optional === null ? (recommendation.outfit?.optional || []) : []);
      const itemIds = [
        selectedOutfit.top?.item_id || selectedOutfit.top?.id,
        selectedOutfit.bottom?.item_id || selectedOutfit.bottom?.id,
        selectedOutfit.footwear?.item_id || selectedOutfit.footwear?.id,
        ...optionalItems.map((o) => o?.item_id || o?.id),
      ].filter(Boolean);
      const uniqueItemIds = [...new Set(itemIds.map((id) => String(id).trim()).filter(Boolean))];
      if (uniqueItemIds.length === 0) {
        setFeedback({
          type: "error",
          message: "Select at least one outfit item before logging.",
        });
        return;
      }

      const result = await logWear({
        activity: occasion,
        item_ids: uniqueItemIds,
        currentTime: weather?.current?.time,
        timezone: weather?.timezone,
      });
      setWearLogged(true);
      setFeedback({
        type: "success",
        message: `Outfit logged (${result?.items_logged || uniqueItemIds.length} items).`,
      });
    } catch (err) {
      console.error("Failed to log wear:", err);
      setFeedback({
        type: "error",
        message: err?.message || "Failed to log outfit. Try again.",
      });
    }
  }

  const current = weather?.current;
  const environmental = weather?.environmental || {};
  const weatherDesc = current ? getWeatherDescription(current.weather_code) : null;

  const greeting = (() => {
    // current.time is e.g. "2026-03-01T14:30" — already local to the location
    const hour = weather?.current?.time
      ? new Date(weather.current.time).getHours()
      : new Date(new Date().toLocaleString("en-US", { timeZone: weather?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone })).getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Good night";
  })();

  const severityColor = (severity) => {
    if (severity === "warning") return "bg-orange-500/20 border-orange-400/30 text-orange-400";
    if (severity === "info") return "bg-blue-500/20 border-blue-400/30 text-blue-300";
    return "bg-white/10 border-white/20 text-white/60";
  };

  const severityIcon = (type) => {
    if (type === "thermal") return "🌡️";
    if (type === "uv") return "☀️";
    if (type === "aqi") return "💨";
    if (type === "pollen") return "🤧";
    if (type === "wind") return "🌬️";
    if (type === "rain") return "🌧️";
    return "⚠️";
  };

  const weatherHealthInsights = (() => {
    if (!weather?.current) return [];

    const insights = [];
    const uv = Number(current.uv_index || 0);
    const rainNow = Number(current.precipitation || 0);
    const rainProb = Array.isArray(weather.hourly?.precipitation_probability)
      ? Math.max(...weather.hourly.precipitation_probability.slice(0, 8).map((n) => Number(n || 0)))
      : 0;
    const currentTemp = Number(current.temperature_2m || 0);
    const nextTemps = Array.isArray(weather.hourly?.temperature_2m)
      ? weather.hourly.temperature_2m.slice(0, 12).map((n) => Number(n || 0))
      : [];
    const minNextTemp = nextTemps.length ? Math.min(...nextTemps) : currentTemp;
    const drop = currentTemp - minNextTemp;
    const aqi = Number(environmental.us_aqi || 0);
    const pollenMax = Math.max(
      Number(environmental.pollen_grass || 0),
      Number(environmental.pollen_tree || 0),
      Number(environmental.pollen_weed || 0)
    );

    if (uv >= 6) {
      insights.push({
        type: "uv",
        severity: uv >= 8 ? "warning" : "info",
        message: `UV is ${uv.toFixed(1)}. Consider sunscreen and more skin coverage.`,
      });
    }

    if (rainNow >= 0.3 || rainProb >= 60) {
      insights.push({
        type: "rain",
        severity: rainProb >= 75 ? "warning" : "info",
        message: `Rain is likely (${Math.round(rainProb)}% chance). A waterproof outer layer is recommended.`,
      });
    }

    if (drop >= 5) {
      insights.push({
        type: "thermal",
        severity: drop >= 8 ? "warning" : "info",
        message: `Temperature may drop by ${Math.round(drop)}° today. Keep an extra layer ready.`,
      });
    }

    if (aqi >= 60) {
      insights.push({
        type: "aqi",
        severity: aqi >= 100 ? "warning" : "info",
        message: `AQI is ${Math.round(aqi)}. Limit prolonged outdoor exposure if sensitive.`,
      });
    }

    if (pollenMax >= 2) {
      insights.push({
        type: "pollen",
        severity: pollenMax >= 3 ? "warning" : "info",
        message: `Pollen is elevated (${pollenMax.toFixed(1)}). Consider a mask if you have allergies.`,
      });
    }

    return insights;
  })();

  const combinedHealthInsights = [
    ...(recommendation?.health_insights || []),
    ...weatherHealthInsights,
  ];

  const wardrobeById = useMemo(() => {
    const map = new Map();
    for (const item of wardrobe || []) {
      const id = String(item?.item_id || item?.id || "");
      if (id) map.set(id, item);
    }
    return map;
  }, [wardrobe]);

  function resolveOutfitItem(item) {
    if (!item) return null;
    const id = String(item?.item_id || item?.id || "");
    if (!id) return item;
    const full = wardrobeById.get(id);
    if (!full) return item;
    return {
      ...full,
      ...item,
      item_id: id,
      id,
    };
  }

  function getItemImage(item) {
    return item?.image_url || item?.imageUrl || null;
  }

  const outfitSlots = recommendation?.outfit
    ? [
        { key: "top", label: "Top", item: resolveOutfitItem(selectedOutfit.top || recommendation.outfit.top) },
        { key: "bottom", label: "Bottom", item: resolveOutfitItem(selectedOutfit.bottom || recommendation.outfit.bottom) },
        { key: "footwear", label: "Footwear", item: resolveOutfitItem(selectedOutfit.footwear || recommendation.outfit.footwear) },
      ].filter((s) => s.item)
    : [];
  const visibleOutfitSlots = outfitSlots.filter((slot) => !clearedSlots[slot.key]);

  function restoreSlot(slotKey) {
    if (!recommendation?.outfit) return;
    const recommendedItem = recommendation.outfit[slotKey] || null;
    setSelectedOutfit((prev) => ({
      ...prev,
      [slotKey]: recommendedItem,
    }));
    setClearedSlots((prev) => ({ ...prev, [slotKey]: false }));
    setWearLogged(false);
  }
  const optionalItems = selectedOutfit.optional?.length
    ? selectedOutfit.optional
    : (selectedOutfit.optional === null ? (recommendation?.outfit?.optional || []) : []);

  function openWardrobePicker(slot) {
    navigate(`/wardrobe?pick=${slot}&returnTo=%2F`);
  }

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-md mx-auto">

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className={`${textMuted} text-sm`}>{greeting},</p>
          <h1 className={`${text} text-2xl font-bold`}>{user?.name} 👋</h1>
        </div>
        <p className={`${textFaint} text-xs text-right mt-1`}>
          {weather?.current?.time
            ? new Date(weather.current.time).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
            : new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: weather?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone })}
        </p>
      </div>

      {/* Weather Card */}
      {current && weatherDesc && (
        <div className={`${card} backdrop-blur-md border rounded-3xl p-5 mb-4`}>
          <div className="flex items-center gap-1 mb-3">
            <span className="text-sm">📍</span>
            <p className={`${textMuted} text-sm`}>{locationName || "Detecting location..."}</p>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-6xl mb-1">{weatherDesc.icon}</div>
              <p className={`${textMuted} text-sm`}>{weatherDesc.label}</p>
            </div>
            <div className="text-right">
              <p className={`${text} text-5xl font-thin`}>{Math.round(current.temperature_2m)}°</p>
              <p className={`${textMuted} text-sm`}>Feels {Math.round(current.apparent_temperature)}°</p>
            </div>
          </div>
          <div className={`grid grid-cols-3 gap-3 mt-4 pt-4 border-t ${isDark ? "border-white/10" : "border-black/10"}`}>
            <div className="text-center">
              <p className={`${textFaint} text-xs`}>Humidity</p>
              <p className={`${text} text-sm font-medium`}>{current.relative_humidity_2m}%</p>
            </div>
            <div className="text-center">
              <p className={`${textFaint} text-xs`}>Wind</p>
              <p className={`${text} text-sm font-medium`}>{Math.round(current.wind_speed_10m)} km/h</p>
            </div>
            <div className="text-center">
              <p className={`${textFaint} text-xs`}>UV</p>
              <p className={`${text} text-sm font-medium`}>{current.uv_index}</p>
            </div>
            <div className="text-center">
              <p className={`${textFaint} text-xs`}>Rain</p>
              <p className={`${text} text-sm font-medium`}>{current.precipitation}mm</p>
            </div>
            <div className="text-center">
              <p className={`${textFaint} text-xs`}>AQI</p>
              <p className={`${text} text-sm font-medium`}>
                {environmental.us_aqi !== undefined && environmental.us_aqi !== null
                  ? Math.round(environmental.us_aqi)
                  : "—"}
              </p>
            </div>
            <div className="text-center">
              <p className={`${textFaint} text-xs`}>Pollen</p>
              <p className={`${text} text-sm font-medium`}>
                {Math.max(
                  Number(environmental.pollen_grass || 0),
                  Number(environmental.pollen_tree || 0),
                  Number(environmental.pollen_weed || 0)
                ).toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Occasion Selector */}
      <div className="mb-4">
        <p className={`${textMuted} text-sm mb-2`}>What's your occasion today?</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {OCCASIONS.map((o) => (
            <button
              key={o}
              onClick={() => {
                setOccasion(o);
                setRecommendation(null);
                setSelectedOutfit({ top: null, bottom: null, footwear: null, optional: null });
                setClearedSlots({ top: false, bottom: false, footwear: false });
                setWearLogged(false);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                occasion === o ? pill : pillInactive
              }`}
            >
              {OCCASION_LABELS[o]}
            </button>
          ))}
        </div>
      </div>

      {/* Mood Selector */}
      <div className="mb-4">
        <p className={`${textMuted} text-sm mb-2`}>How do you want to feel today?</p>
        <div className="grid grid-cols-3 gap-2">
          {MOODS.map((m) => (
            <button
              key={m.value}
              onClick={() => {
                setMood(m.value);
                setRecommendation(null);
                setSelectedOutfit({ top: null, bottom: null, footwear: null, optional: null });
                setClearedSlots({ top: false, bottom: false, footwear: false });
                setWearLogged(false);
              }}
              className={`py-3 rounded-2xl border text-sm font-medium transition-all flex flex-col items-center gap-1 ${
                mood === m.value ? pill : pillInactive
              }`}
            >
              <span className="text-xl">{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {["outfit", "health", "activities"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
              activeTab === tab ? tabActive : tabInactive
            }`}
          >
            {tab === "outfit" ? "👗 Outfit" : tab === "health" ? "🏥 Health" : "🎯 Activities"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className={`${card} backdrop-blur-md border rounded-3xl p-8 text-center`}>
          <div className="text-4xl mb-3 animate-bounce">🤔</div>
          <p className={`${text} font-medium`}>Building your outfit...</p>
          <p className={`${textFaint} text-sm mt-1`}>
            Matching {OCCASION_LABELS[occasion]} • {MOODS.find(m => m.value === mood)?.label} mood
          </p>
        </div>
      )}

      {/* ── OUTFIT TAB ── */}
      {!loading && recommendation && activeTab === "outfit" && (
        <div className="space-y-4">

          {/* Outfit Slots */}
          <div className={`${card} backdrop-blur-md border rounded-3xl p-5`}>
            <div className="space-y-2">
              <p className={`${textMuted} text-xs mb-1`}>
                {OCCASION_LABELS[occasion]} • {MOODS.find(m => m.value === mood)?.emoji} {MOODS.find(m => m.value === mood)?.label}
              </p>

              {/* Non-negotiable slots */}
              {visibleOutfitSlots.map((slot) => (
                <div key={slot.key} className={`${cardInner} rounded-xl p-2`}>
                  <div className="flex items-start gap-3">
                    {getItemImage(slot.item) ? (
                      <img
                        src={getItemImage(slot.item)}
                        alt={slot.item.name || slot.label}
                        className="w-16 h-16 rounded-lg object-cover border border-white/10 flex-shrink-0"
                      />
                    ) : (
                      <div className={`w-16 h-16 rounded-lg flex items-center justify-center text-xl ${isDark ? "bg-white/10 text-white/60" : "bg-black/10 text-gray-500"}`}>
                        👕
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`${textFaint} text-xs`}>{slot.label}</p>
                      <p className={`${text} text-sm font-medium truncate`}>{slot.item.name}</p>
                      {slot.item.reason && (
                        <p className={`${textFaint} text-xs italic mt-0.5`}>{slot.item.reason}</p>
                      )}
                      <button
                        onClick={() => openWardrobePicker(slot.key)}
                        className={`mt-2 text-xs px-2 py-1 rounded-lg ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-700"}`}
                      >
                        Choose other
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {Object.entries(clearedSlots)
                .filter(([, isCleared]) => isCleared)
                .map(([slotKey]) => (
                  <div key={`cleared-${slotKey}`} className={`${cardInner} rounded-xl px-3 py-2 border ${isDark ? "border-white/10" : "border-black/10"}`}>
                    <p className={`${textFaint} text-xs capitalize`}>{slotKey}</p>
                    <p className={`${text} text-sm`}>Removed from outfit</p>
                    <button
                      onClick={() => restoreSlot(slotKey)}
                      className={`mt-2 text-xs px-2 py-1 rounded-lg ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-700"}`}
                    >
                      Add back
                    </button>
                  </div>
                ))}

              {/* Optional items */}
              {(optionalItems.length > 0 || recommendation?.outfit) && (
                <div>
                  <p className={`${textFaint} text-xs mb-1 mt-2`}>Also consider</p>
                  {optionalItems.map((rawItem, i) => {
                    const item = resolveOutfitItem(rawItem);
                    return (
                      <div key={i} className={`${cardInner} rounded-xl p-2 mb-1 border ${isDark ? "border-white/10" : "border-black/10"}`}>
                        <div className="flex items-start gap-3">
                          {getItemImage(item) ? (
                            <img
                              src={getItemImage(item)}
                              alt={item?.name || "Optional item"}
                              className="w-14 h-14 rounded-lg object-cover border border-white/10 flex-shrink-0"
                            />
                          ) : (
                            <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-lg ${isDark ? "bg-white/10 text-white/60" : "bg-black/10 text-gray-500"}`}>
                              🧥
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`${text} text-sm font-medium truncate`}>{item?.name}</p>
                            {item?.reason && (
                              <p className={`${textFaint} text-xs italic mt-0.5`}>{item.reason}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => openWardrobePicker("optional")}
                    className={`mt-1 text-xs px-2 py-1 rounded-lg ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-700"}`}
                  >
                    Choose optional from wardrobe
                  </button>
                </div>
              )}
            </div>

            {/* Explanation */}
            {recommendation.explanation && (
              <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/10" : "border-black/10"}`}>
                <p className={`${textMuted} text-sm italic`}>{recommendation.explanation}</p>
              </div>
            )}
          </div>

          {/* Alternatives */}
          {recommendation.alternatives?.length > 0 && (
            <div className={`${card} backdrop-blur-md border rounded-2xl p-4`}>
              <p className={`${text} text-sm font-semibold mb-3`}>🔄 Alternatives</p>
              <div className="space-y-2">
                {recommendation.alternatives.map((alt, i) => (
                  <div key={i} className={`${cardInner} rounded-xl px-3 py-2`}>
                    <p className={`${textFaint} text-xs capitalize`}>Instead of {alt.replaces}</p>
                    <p className={`${text} text-sm font-medium`}>{alt.name}</p>
                    {alt.reason && (
                      <p className={`${textFaint} text-xs italic mt-0.5`}>{alt.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wear Log Button */}
          <div className={`${card} backdrop-blur-md border rounded-2xl p-4`}>
            {!wearLogged ? (
              <div>
                <p className={`${textMuted} text-sm mb-3 text-center`}>Wearing this today?</p>
                <button
                  onClick={handleLogWear}
                  className={`w-full ${isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white"} font-bold py-3 rounded-xl transition-all`}
                >
                  ✅ Log Today's Outfit
                </button>
                {feedback?.message && (
                  <p
                    className={`mt-3 text-xs text-center ${
                      feedback.type === "error"
                        ? "text-red-400"
                        : isDark
                        ? "text-emerald-300"
                        : "text-emerald-700"
                    }`}
                  >
                    {feedback.message}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className={`${text} text-sm text-center`}>
                  Outfit logged! 👗 Your wardrobe stats are updated.
                </p>
                {feedback?.message && (
                  <p
                    className={`mt-2 text-xs text-center ${
                      feedback.type === "error"
                        ? "text-red-400"
                        : isDark
                        ? "text-emerald-300"
                        : "text-emerald-700"
                    }`}
                  >
                    {feedback.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HEALTH TAB ── */}
      {!loading && activeTab === "health" && (
        <div className="space-y-3">
          {combinedHealthInsights.length > 0 ? (
            combinedHealthInsights.map((insight, i) => (
              <div
                key={i}
                className={`border rounded-2xl p-4 ${severityColor(insight.severity)}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{severityIcon(insight.type)}</span>
                  <p className="font-medium text-sm capitalize">{insight.type} {insight.severity}</p>
                </div>
                <p className="text-sm opacity-90">{insight.message}</p>
              </div>
            ))
          ) : (
            <div className={`${card} backdrop-blur-md border rounded-3xl p-8 text-center`}>
              <div className="text-5xl mb-3">✅</div>
              <p className={`${text} font-medium`}>No health alerts today</p>
              <p className={`${textFaint} text-sm mt-1`}>Conditions look safe and comfortable</p>
            </div>
          )}

          {/* Readiness Score */}
          {recommendation?.readiness_score !== undefined && (
            <div className={`${card} backdrop-blur-md border rounded-3xl p-5 text-center`}>
              <p className={`${textMuted} text-sm mb-1`}>Daily Readiness Score</p>
              <p className={`${text} text-7xl font-thin`}>{recommendation.readiness_score}</p>
              <p className={`${textFaint} text-sm`}>/ 100</p>
            </div>
          )}
        </div>
      )}

      {/* ── ACTIVITIES TAB ── */}
      {!loading && recommendation && activeTab === "activities" && (
        <div className={`${card} backdrop-blur-md border rounded-3xl p-5`}>
          <p className={`${text} font-semibold mb-4`}>Suggested for today</p>
          {recommendation.activities?.length > 0 ? (
            <div className="space-y-3">
              {recommendation.activities.map((activity, i) => (
                <div key={i} className={`flex items-center gap-3 ${cardInner} rounded-2xl px-4 py-3`}>
                  <span className="text-2xl">
                    {i === 0 ? "🏃" : i === 1 ? "☕" : i === 2 ? "📚" : i === 3 ? "🌿" : "🎨"}
                  </span>
                  <p className={`${text} text-sm`}>{activity}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className={`${textMuted} text-sm`}>No activity suggestions available.</p>
          )}
        </div>
      )}

      {/* Empty wardrobe state */}
      {!loading && !recommendation && wardrobe.length === 0 && (
        <div className={`${card} backdrop-blur-md border rounded-3xl p-8 text-center`}>
          <div className="text-5xl mb-3">👗</div>
          <p className={`${text} font-medium`}>Your wardrobe is empty</p>
          <p className={`${textFaint} text-sm mt-1`}>Add items in your Profile to get outfit recommendations</p>
        </div>
      )}

      {/* No recommendation yet */}
      {!loading && !recommendation && wardrobe.length > 0 && (
        <div className={`${card} backdrop-blur-md border rounded-3xl p-8 text-center`}>
          <div className="text-5xl mb-3">🤔</div>
          <p className={`${text} font-medium`}>No recommendation yet</p>
          <button
            onClick={fetchRecommendation}
            className={`mt-4 px-6 py-2 rounded-xl text-sm font-medium ${pill}`}
          >
            Get Recommendation
          </button>
        </div>
      )}
    </div>
  );
}