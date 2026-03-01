import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useTheme } from "../App";
import { getWardrobeUtilization } from "../services/insights";

export default function Profile() {
  const { user, wardrobe, handleLogout } = useApp();
  const { isDark } = useTheme();
  const [insights, setInsights] = useState(null);
  const [insightsPeriod, setInsightsPeriod] = useState("month");
  const [insightsLoading, setInsightsLoading] = useState(false);

  const text = isDark ? "text-white" : "text-gray-900";
  const textMuted = isDark ? "text-white/60" : "text-gray-500";
  const textFaint = isDark ? "text-white/40" : "text-gray-400";
  const card = isDark ? "bg-white/10 border-white/20" : "bg-black/10 border-black/20";
  const cardInner = isDark ? "bg-white/10" : "bg-black/10";
  const ctaBtn = isDark ? "bg-white text-blue-900 hover:bg-blue-50" : "bg-gray-900 text-white hover:bg-gray-800";
  const tabActive = isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white";
  const tabInactive = isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-800";

  async function loadInsights(period) {
    setInsightsLoading(true);
    try {
      const data = await getWardrobeUtilization(period);
      setInsights(data);
    } catch (err) {
      console.error(err);
    } finally {
      setInsightsLoading(false);
    }
  }

  useEffect(() => {
    loadInsights(insightsPeriod);
  }, [insightsPeriod]);

  const skinColor =
    user?.preferences?.skinTone === "Light" ? "#FDDBB4" :
    user?.preferences?.skinTone === "Medium" ? "#D4A574" :
    user?.preferences?.skinTone === "Tan" ? "#C68642" : "#8D5524";

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-md mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className={`${text} text-2xl font-bold`}>Profile</h1>
        <button
          onClick={handleLogout}
          className={`${textFaint} text-sm hover:${text} transition-all`}
        >
          Sign out
        </button>
      </div>

      <div className={`${card} backdrop-blur-md border rounded-3xl p-5 mb-4`}>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl flex-shrink-0"
            style={{
              borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)",
              backgroundColor: skinColor,
            }}
          >
            {user?.preferences?.gender === "Male" ? "👨" :
             user?.preferences?.gender === "Female" ? "👩" : "🧑"}
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

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className={`${text} text-2xl font-bold`}>{wardrobe.length}</p>
          <p className={`${textFaint} text-xs`}>Total Items</p>
        </div>
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className="text-green-500 text-2xl font-bold">
            {wardrobe.filter((i) => (i.tags?.sustainabilityScore || 0) >= 4).length}
          </p>
          <p className={`${textFaint} text-xs`}>Eco Items</p>
        </div>
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className="text-blue-400 text-2xl font-bold">
            {wardrobe.filter((i) => !i.last_worn_date).length}
          </p>
          <p className={`${textFaint} text-xs`}>Unworn</p>
        </div>
      </div>

      <Link
        to="/wardrobe"
        className={`block w-full ${ctaBtn} font-bold py-4 rounded-2xl mb-6 text-center transition-all`}
      >
        Open Wardrobe
      </Link>

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
    </div>
  );
}
