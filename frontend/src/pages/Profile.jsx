import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { locationDate } from "../services/weather";
import { useTheme } from "../App";
import { getWardrobeUtilization } from "../services/insights";
import { getWearLog, removeItemFromLog } from "../services/wearLog";
import { updateWardrobeItem } from "../services/wardrobe";

const OCCASIONS = ["casual", "work", "gym", "party"];
const OCCASION_LABELS = { casual: "Casual", work: "Work", gym: "Gym", party: "Party" };

export default function Profile() {
  const { user, wardrobe, weather, handleLogout, refreshWardrobe } = useApp();
  const { isDark } = useTheme();

  const [activeSection, setActiveSection] = useState("insights");
  const [insights, setInsights] = useState(null);
  const [insightsPeriod, setInsightsPeriod] = useState("week");
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  const [outfitHistory, setOutfitHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [editItem, setEditItem] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── Theme tokens ──
  const text      = isDark ? "text-white"       : "text-gray-900";
  const textMuted = isDark ? "text-white/60"    : "text-gray-500";
  const textFaint = isDark ? "text-white/40"    : "text-gray-400";
  const card      = isDark ? "bg-white/10 border-white/20" : "bg-black/10 border-black/20";
  const cardInner = isDark ? "bg-white/10"      : "bg-black/10";
  const ctaBtn    = isDark ? "bg-white text-blue-900 hover:bg-blue-50" : "bg-gray-900 text-white hover:bg-gray-800";
  const tabActive = isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white";
  const tabInactive = isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-800";
  const inputBg   = isDark
    ? "bg-white/10 border-white/20 text-white placeholder-white/40 focus:border-white/60"
    : "bg-black/5 border-black/20 text-gray-900 placeholder-gray-400 focus:border-black/50";
  const pillActive   = isDark ? "bg-white text-blue-900 border-white" : "bg-gray-900 text-white border-gray-900";
  const pillInactive = isDark ? "bg-white/10 text-white border-white/20" : "bg-black/5 text-gray-900 border-black/20";

  async function loadInsights(period) {
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const data = await getWardrobeUtilization(period);
      setInsights(data);
    } catch (err) {
      setInsights(null);
      setInsightsError(err?.message || "Failed to load insights.");
    } finally {
      setInsightsLoading(false);
    }
  }

  async function loadOutfitHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      // Use location-aware today date, then subtract 29 days
      const todayStr = locationDate(weather?.current?.time, weather?.timezone);
      const from = new Date(todayStr + "T12:00:00Z");
      from.setUTCDate(from.getUTCDate() - 29);
      const fromStr = from.toISOString().slice(0, 10);
      const data = await getWearLog({ from: fromStr });
      setOutfitHistory(data?.entries || []);
    } catch (err) {
      setHistoryError(err?.message || "Failed to load outfit history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleRemoveItem(logId, itemId) {
    try {
      const result = await removeItemFromLog(logId, itemId);
      setOutfitHistory((prev) =>
        result.items_remaining === 0
          // Whole log deleted — remove the entry
          ? prev.filter((e) => e.log_id !== logId)
          // Partial — remove just this item from the entry
          : prev.map((e) =>
              e.log_id === logId
                ? { ...e, items: e.items.filter((i) => String(i.item_id) !== String(itemId)) }
                : e
            )
      );
      await refreshWardrobe();
    } catch (err) {
      alert(err?.message || "Failed to remove item from log.");
    }
  }

  useEffect(() => {
    // Refresh wardrobe on mount so worn-this-week counts are always current
    refreshWardrobe();
  }, []);

  useEffect(() => {
    if (activeSection === "insights") loadInsights(insightsPeriod);
    if (activeSection === "history" && !outfitHistory) loadOutfitHistory();
  }, [activeSection, insightsPeriod]);

  async function handleSaveEdit() {
    if (!editItem) return;
    setEditSaving(true);
    try {
      await updateWardrobeItem(editItem.item_id, {
        name: editItem.name,
        layer: editItem.layer,
        tags: {
          warmth: editItem.tags.warmth,
          breathability: editItem.tags.breathability,
          waterproof: editItem.tags.waterproof,
          occasion: editItem.tags.occasion,
          color: editItem.tags.color,
        },
      });
      await refreshWardrobe();
      setEditItem(null);
    } catch (err) {
      alert(err?.message || "Failed to save changes.");
    } finally {
      setEditSaving(false);
    }
  }

  function toggleOccasion(occ) {
    setEditItem((prev) => {
      const current = prev.tags.occasion || [];
      const next = current.includes(occ)
        ? current.filter((o) => o !== occ)
        : [...current, occ];
      return { ...prev, tags: { ...prev.tags, occasion: next } };
    });
  }

  const skinColor =
    user?.preferences?.skinTone === "Light" ? "#FDDBB4" :
    user?.preferences?.skinTone === "Medium" ? "#D4A574" :
    user?.preferences?.skinTone === "Tan" ? "#C68642" : "#8D5524";

  // Group outfit history by date
  const groupedHistory = outfitHistory
    ? outfitHistory.reduce((acc, entry) => {
        const date = entry.date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(entry);
        return acc;
      }, {})
    : {};

  function formatDate(dateStr) {
    const d = new Date(dateStr + "T12:00:00Z");
    // Use location-aware today from weather, not device clock
    const todayStr = locationDate(weather?.current?.time, weather?.timezone);
    const yesterdayDate = new Date(todayStr + "T12:00:00Z");
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
    if (dateStr === todayStr) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  }

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-md mx-auto">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className={`${text} text-2xl font-bold`}>Profile</h1>
        <button onClick={handleLogout} className="text-white/40 text-sm hover:text-white transition-all">
          Sign out
        </button>
      </div>

      {/* User card */}
      <div className={`${card} backdrop-blur-md border rounded-3xl p-5 mb-4`}>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl flex-shrink-0"
            style={{ borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)", backgroundColor: skinColor }}
          >
            {user?.preferences?.gender === "Male" ? "👨" : user?.preferences?.gender === "Female" ? "👩" : "🧑"}
          </div>
          <div className="flex-1">
            <h2 className={`${text} text-xl font-bold`}>{user?.name}</h2>
            <p className={`${textMuted} text-sm`}>{user?.email}</p>
            {user?.preferences?.age && (
              <p className={`${textFaint} text-xs`}>
                {user.preferences.age} years
                {user.preferences.height ? ` • ${user.preferences.height}cm` : ""}
                {user.preferences.weight ? ` • ${user.preferences.weight}kg` : ""}
              </p>
            )}
          </div>
        </div>
        {user?.preferences?.stylePreference?.length > 0 && (
          <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/10" : "border-black/10"}`}>
            <p className={`${textFaint} text-xs mb-2`}>Style preferences</p>
            <div className="flex flex-wrap gap-2">
              {user.preferences.stylePreference.map((s) => (
                <span key={s} className={`${cardInner} ${text} text-xs px-3 py-1 rounded-full`}>{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Wardrobe stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className={`${text} text-2xl font-bold`}>{wardrobe.length}</p>
          <p className={`${textFaint} text-xs`}>Total Items</p>
        </div>
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className="text-green-400 text-2xl font-bold">
            {wardrobe.filter((i) => (i.times_worn_last_7_days ?? 0) > 0).length}
          </p>
          <p className={`${textFaint} text-xs`}>Worn This Week</p>
        </div>
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className="text-blue-400 text-2xl font-bold">
            {wardrobe.filter((i) => !i.last_worn_date).length}
          </p>
          <p className={`${textFaint} text-xs`}>Unworn</p>
        </div>
      </div>

      <Link to="/wardrobe" className={`block w-full ${ctaBtn} font-bold py-4 rounded-2xl mb-6 text-center transition-all`}>
        Open Wardrobe
      </Link>

      {/* Section tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "insights", label: "📊 Insights" },
          { key: "history",  label: "👗 History" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
              activeSection === s.key ? tabActive : tabInactive
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── INSIGHTS SECTION ── */}
      {activeSection === "insights" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {["week", "month"].map((p) => (
              <button
                key={p}
                onClick={() => setInsightsPeriod(p)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                  insightsPeriod === p ? tabActive : tabInactive
                }`}
              >
                This {p}
              </button>
            ))}
          </div>

          {insightsLoading && (
            <div className={`${card} border rounded-3xl p-8 text-center`}>
              <div className="text-4xl mb-3 animate-bounce">📊</div>
              <p className={`${text} font-medium`}>Loading insights...</p>
            </div>
          )}

          {!insightsLoading && insightsError && (
            <div className={`${card} border rounded-2xl p-4`}>
              <p className="text-red-400 text-sm font-medium">{insightsError}</p>
            </div>
          )}

          {!insightsLoading && insights && (
            <>
              <div className={`${card} border rounded-2xl p-4`}>
                <p className={`${text} font-medium mb-1`}>Summary</p>
                <p className={`${textMuted} text-sm`}>{insights.summary}</p>
                <p className={`${textFaint} text-xs mt-2`}>
                  {insights.from} → {insights.to} • {insights.total_wears} total wears
                </p>
              </div>

              <div className={`${card} border rounded-2xl p-4`}>
                <p className={`${text} font-medium mb-3`}>Item Utilization</p>
                <div className="space-y-3">
                  {[...insights.items]
                    .sort((a, b) => a.times_worn - b.times_worn)
                    .map((item) => (
                      <div key={item.item_id} className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className={`${text} text-sm font-medium`}>{item.name}</p>
                          <p className={`${textFaint} text-xs`}>
                            Last worn: {item.last_worn_date || "Never"}
                          </p>
                        </div>
                        <div className="text-right ml-3">
                          <p className={`${item.times_worn === 0 ? "text-red-400" : item.times_worn < 3 ? "text-yellow-400" : "text-green-400"} font-bold text-sm`}>
                            {item.times_worn}x
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── OUTFIT HISTORY SECTION ── */}
      {activeSection === "history" && (
        <div className="space-y-4">
          {historyLoading && (
            <div className={`${card} border rounded-3xl p-8 text-center`}>
              <div className="text-4xl mb-3 animate-bounce">👗</div>
              <p className={`${text} font-medium`}>Loading outfit history...</p>
            </div>
          )}

          {!historyLoading && historyError && (
            <div className={`${card} border rounded-2xl p-4`}>
              <p className="text-red-400 text-sm font-medium">{historyError}</p>
            </div>
          )}

          {!historyLoading && outfitHistory && outfitHistory.length === 0 && (
            <div className={`${card} border rounded-3xl p-8 text-center`}>
              <div className="text-5xl mb-3">👗</div>
              <p className={`${text} font-medium`}>No outfits logged yet</p>
              <p className={`${textFaint} text-sm mt-1`}>Log your outfit from the home screen to see your history here</p>
            </div>
          )}

          {!historyLoading && Object.entries(groupedHistory)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, entries]) => {
              // Collect unique occasions for the day
              const occasions = [...new Set(
                entries.flatMap((e) => Array.isArray(e.activities) ? e.activities : (e.activity ? [e.activity] : [])).filter(Boolean)
              )];
              return (
                <div key={date} className={`${card} border rounded-2xl p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className={`${text} font-semibold`}>{formatDate(date)}</p>
                    {occasions.length > 0 && (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {occasions.map((occ) => (
                          <span key={occ} className={`${cardInner} ${textFaint} text-xs px-2 py-1 rounded-full capitalize`}>
                            {OCCASION_LABELS[occ] || occ}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {entries.flatMap((e) => e.items.map((item) => ({ ...item, log_id: e.log_id }))).map((item, i) => {
                      const wardrobeItem = wardrobe.find(
                        (w) => String(w.item_id) === String(item.item_id)
                      );
                      return (
                        <div key={i} className="flex items-center gap-3">
                          {wardrobeItem?.image_url ? (
                            <img
                              src={wardrobeItem.image_url}
                              alt={item.name}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm ${cardInner}`}>
                              👕
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`${text} text-sm truncate`}>{item.name}</p>
                            {wardrobeItem && (
                              <p className={`${textFaint} text-xs capitalize`}>{wardrobeItem.category}</p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {wardrobeItem && (
                              <button
                                onClick={() => setEditItem({ ...wardrobeItem })}
                                className={`text-xs px-2 py-1 rounded-lg ${cardInner} ${textFaint}`}
                              >
                                ✏️
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveItem(item.log_id, item.item_id)}
                              className="text-xs px-2 py-1 rounded-lg text-red-400/60 hover:text-red-400 transition-all"
                              title="Remove from log"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {/* ── EDIT ITEM MODAL ── */}
      {editItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4"
          onClick={() => setEditItem(null)}
        >
          <div
            className={`${isDark ? "bg-blue-950" : "bg-white"} border ${isDark ? "border-white/20" : "border-black/10"} rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`${text} text-lg font-bold mb-1`}>Edit Item</h3>
            <p className={`${textMuted} text-sm mb-4`}>Update details for this wardrobe item</p>

            {editItem.image_url && (
              <img src={editItem.image_url} alt={editItem.name} className="w-full h-40 object-cover rounded-2xl mb-4" />
            )}

            {/* Name */}
            <div className="mb-3">
              <p className={`${textFaint} text-xs mb-1`}>Name</p>
              <input
                className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${inputBg}`}
                value={editItem.name}
                onChange={(e) => setEditItem((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            {/* Layer (tops only) */}
            {editItem.category === "top" && (
              <div className="mb-3">
                <p className={`${textFaint} text-xs mb-2`}>Layer type</p>
                <div className="flex gap-2">
                  {["inner", "outer"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setEditItem((p) => ({ ...p, layer: l }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all border ${
                        (editItem.layer ?? "inner") === l ? pillActive : pillInactive
                      }`}
                    >
                      {l === "inner" ? "👕 Inner" : "🧥 Outer"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Warmth */}
            <div className="mb-3">
              <p className={`${textFaint} text-xs mb-2`}>Warmth</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setEditItem((p) => ({ ...p, tags: { ...p.tags, warmth: n } }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      editItem.tags.warmth === n
                        ? isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white"
                        : `${cardInner} ${text}`
                    }`}
                  >
                    {"🔥".repeat(n)}
                  </button>
                ))}
              </div>
            </div>

            {/* Breathability */}
            <div className="mb-3">
              <p className={`${textFaint} text-xs mb-2`}>Breathability</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setEditItem((p) => ({ ...p, tags: { ...p.tags, breathability: n } }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      editItem.tags.breathability === n
                        ? isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white"
                        : `${cardInner} ${text}`
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Waterproof */}
            <div className="mb-3">
              <p className={`${textFaint} text-xs mb-2`}>Waterproof</p>
              <div className="flex gap-2">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    onClick={() => setEditItem((p) => ({ ...p, tags: { ...p.tags, waterproof: val } }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                      editItem.tags.waterproof === val ? pillActive : pillInactive
                    }`}
                  >
                    {val ? "✅ Yes" : "❌ No"}
                  </button>
                ))}
              </div>
            </div>

            {/* Occasions */}
            <div className="mb-4">
              <p className={`${textFaint} text-xs mb-2`}>Occasions</p>
              <div className="flex flex-wrap gap-2">
                {["casual", "work", "athletic", "smart_casual", "party"].map((occ) => (
                  <button
                    key={occ}
                    onClick={() => toggleOccasion(occ)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-all ${
                      (editItem.tags.occasion || []).includes(occ) ? pillActive : pillInactive
                    }`}
                  >
                    {occ.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setEditItem(null)}
                className={`flex-1 ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-900"} py-3 rounded-2xl font-medium text-sm`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className={`flex-1 ${isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white"} py-3 rounded-2xl font-bold text-sm disabled:opacity-40`}
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}