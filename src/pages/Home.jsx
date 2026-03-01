import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { getWeatherDescription } from "../services/weather";
import { getOutfitRecommendation } from "../services/claude";
import { useTheme } from "../App";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

const OCCASIONS = ["Casual", "Work", "Formal", "Sport", "Outdoor", "Date Night"];

export default function Home() {
    const { user, weather, wardrobe, locationName, updateUserPrefs, incrementWornCount } = useApp();
    const { isDark } = useTheme();
    const [occasion, setOccasion] = useState("Casual");
    const [recommendation, setRecommendation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [activeTab, setActiveTab] = useState("outfit");

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
        if (weather && user) fetchRecommendation();
    }, [weather, occasion]);

    async function fetchRecommendation() {
        setLoading(true);
        setFeedback(null);
        try {
            const current = weather.current;
            const weatherSummary = {
                temperature: current.temperature_2m,
                feelsLike: current.apparent_temperature,
                humidity: current.relative_humidity_2m,
                precipitation: current.precipitation,
                windSpeed: current.wind_speed_10m,
                uvIndex: current.uv_index,
                condition: getWeatherDescription(current.weather_code),
            };
            const rec = await getOutfitRecommendation(weatherSummary, wardrobe, occasion, user.preferences);
            setRecommendation(rec);
            if (rec.outfit) rec.outfit.forEach((name) => {
                const item = wardrobe.find((w) => w.name === name);
                if (item) incrementWornCount(item.id);
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleFeedback(liked) {
        setFeedback(liked);
        if (recommendation) {
            await updateUserPrefs({
                [liked ? "likedOutfits" : "dislikedOutfits"]: [
                    ...(user.preferences?.[liked ? "likedOutfits" : "dislikedOutfits"] || []),
                    { outfit: recommendation.outfit, occasion, date: new Date().toISOString() },
                ],
            });
        }
    }

    const current = weather?.current;
    const weatherDesc = current ? getWeatherDescription(current.weather_code) : null;

    // Greeting based on location's local time
    const greeting = (() => {
        const timezone = weather?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const hour = new Date(new Date().toLocaleString("en-US", { timeZone: timezone })).getHours();
        if (hour >= 5 && hour < 12) return "Good morning";
        if (hour >= 12 && hour < 17) return "Good afternoon";
        if (hour >= 17 && hour < 21) return "Good evening";
        return "Good night";
    })();



    const radarData = recommendation?.readinessBreakdown
        ? [
            { subject: "Comfort", value: recommendation.readinessBreakdown.comfort },
            { subject: "Activity", value: recommendation.readinessBreakdown.activityMatch },
            { subject: "Weather", value: recommendation.readinessBreakdown.weatherRisk },
            { subject: "Outfit", value: recommendation.readinessBreakdown.outfitSuitability },
            { subject: "Eco", value: recommendation.readinessBreakdown.sustainability },
        ]
        : [];

    return (
        <div className="min-h-screen pb-24 px-4 pt-6 max-w-md mx-auto">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <p className={`${textMuted} text-sm`}>{greeting},</p>
                    <h1 className={`${text} text-2xl font-bold`}>{user?.name} 👋</h1>
                </div>
                <div className="text-right">
                    <p className={`${textFaint} text-xs`}>
                        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </p>
                </div>
            </div>

            {/* Weather Card */}
            {current && weatherDesc && (
                <div className={`${card} backdrop-blur-md border rounded-3xl p-5 mb-4`}>
                    {/* Location */}
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
                    <div className={`flex gap-4 mt-4 pt-4 border-t ${isDark ? "border-white/10" : "border-black/10"}`}>
                        <div className="text-center">
                            <p className={`${textFaint} text-xs`}>Humidity</p>
                            <p className={`${text} text-sm font-medium`}>{current.relative_humidity_2m}%</p>
                        </div>
                        <div className="text-center">
                            <p className={`${textFaint} text-xs`}>Wind</p>
                            <p className={`${text} text-sm font-medium`}>{Math.round(current.wind_speed_10m)} km/h</p>
                        </div>
                        <div className="text-center">
                            <p className={`${textFaint} text-xs`}>UV Index</p>
                            <p className={`${text} text-sm font-medium`}>{current.uv_index}</p>
                        </div>
                        <div className="text-center">
                            <p className={`${textFaint} text-xs`}>Rain</p>
                            <p className={`${text} text-sm font-medium`}>{current.precipitation}mm</p>
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
                            onClick={() => setOccasion(o)}
                            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${occasion === o ? pill : pillInactive
                                }`}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                {["outfit", "activities", "score"].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${activeTab === tab ? tabActive : tabInactive
                            }`}
                    >
                        {tab === "outfit" ? "👗 Outfit" : tab === "activities" ? "🎯 Activities" : "📊 Score"}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {loading && (
                <div className={`${card} backdrop-blur-md border rounded-3xl p-8 text-center`}>
                    <div className="text-4xl mb-3 animate-bounce">🤔</div>
                    <p className={`${text} font-medium`}>Analyzing your wardrobe...</p>
                    <p className={`${textFaint} text-sm mt-1`}>Matching with today's weather</p>
                </div>
            )}

            {/* Outfit Tab */}
            {!loading && recommendation && activeTab === "outfit" && (
                <div className="space-y-4">
                    <div className={`${card} backdrop-blur-md border rounded-3xl p-5`}>
                        <div className="flex items-start gap-4">
                            {/* Avatar */}
                            <div className="flex-shrink-0">
                                <div className="relative w-20 h-28">
                                    <div
                                        className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full"
                                        style={{
                                            backgroundColor:
                                                user?.skinTone === "Light" ? "#FDDBB4" :
                                                    user?.skinTone === "Medium" ? "#D4A574" :
                                                        user?.skinTone === "Tan" ? "#C68642" : "#8D5524",
                                        }}
                                    />
                                    <div className="absolute top-9 left-1/2 -translate-x-1/2 w-12 h-14 bg-blue-400/60 rounded-lg" />
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-1">
                                        <div className="w-4 h-8 bg-blue-800/60 rounded-b-lg" />
                                        <div className="w-4 h-8 bg-blue-800/60 rounded-b-lg" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1">
                                <p className={`${textMuted} text-xs mb-2`}>Today's outfit for {occasion}</p>
                                {recommendation.noOutfitFound ? (
                                    <div>
                                        <p className="text-yellow-500 text-sm mb-2">⚠️ No perfect match in wardrobe</p>
                                        <p className={`${textMuted} text-sm`}>{recommendation.genericSuggestion}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {recommendation.outfit.map((item, i) => (
                                            <div key={i} className={`${cardInner} rounded-xl px-3 py-2`}>
                                                <p className={`${text} text-sm font-medium`}>{item}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className={`${textFaint} text-xs mt-3 italic`}>{recommendation.reasoning}</p>
                            </div>
                        </div>
                    </div>

                    {/* Alerts */}
                    {recommendation.alerts?.length > 0 && (
                        <div className="bg-orange-500/20 border border-orange-400/30 rounded-2xl p-4">
                            <p className="text-orange-500 font-medium text-sm mb-2">⚠️ Alerts</p>
                            {recommendation.alerts.map((alert, i) => (
                                <p key={i} className="text-orange-600 text-sm">{alert}</p>
                            ))}
                        </div>
                    )}

                    {/* Feedback */}
                    {feedback === null ? (
                        <div className={`${card} backdrop-blur-md border rounded-2xl p-4`}>
                            <p className={`${textMuted} text-sm mb-3 text-center`}>How's this recommendation?</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleFeedback(true)}
                                    className="flex-1 bg-green-500/20 border border-green-400/30 text-green-600 py-2 rounded-xl text-sm font-medium hover:bg-green-500/30 transition-all"
                                >
                                    👍 Love it
                                </button>
                                <button
                                    onClick={() => handleFeedback(false)}
                                    className="flex-1 bg-red-500/20 border border-red-400/30 text-red-500 py-2 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-all"
                                >
                                    👎 Not for me
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`${card} border rounded-2xl p-4 text-center`}>
                            <p className={`${text} text-sm`}>{feedback ? "Great! We'll remember that 💚" : "Got it! We'll improve 🔄"}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Activities Tab */}
            {!loading && recommendation && activeTab === "activities" && (
                <div className={`${card} backdrop-blur-md border rounded-3xl p-5`}>
                    <p className={`${text} font-semibold mb-4`}>Suggested for today</p>
                    <div className="space-y-3">
                        {recommendation.activities?.map((activity, i) => (
                            <div key={i} className={`flex items-center gap-3 ${cardInner} rounded-2xl px-4 py-3`}>
                                <span className="text-2xl">
                                    {i === 0 ? "🏃" : i === 1 ? "☕" : i === 2 ? "📚" : i === 3 ? "🌿" : "🎨"}
                                </span>
                                <p className={`${text} text-sm`}>{activity}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Score Tab */}
            {!loading && recommendation && activeTab === "score" && (
                <div className="space-y-4">
                    <div className={`${card} backdrop-blur-md border rounded-3xl p-5 text-center`}>
                        <p className={`${textMuted} text-sm mb-1`}>Daily Readiness Score</p>
                        <p className={`${text} text-7xl font-thin`}>{recommendation.readinessScore}</p>
                        <p className={`${textFaint} text-sm`}>/ 100</p>
                    </div>
                    <div className={`${card} backdrop-blur-md border rounded-3xl p-5`}>
                        <p className={`${text} font-medium mb-4 text-center`}>Breakdown</p>
                        <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                                <PolarGrid stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} />
                                <PolarAngleAxis
                                    dataKey="subject"
                                    tick={{ fill: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", fontSize: 12 }}
                                />
                                <Radar dataKey="value" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} />
                            </RadarChart>
                        </ResponsiveContainer>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {radarData.map((d) => (
                                <div key={d.subject} className={`${cardInner} rounded-xl px-3 py-2 flex justify-between`}>
                                    <span className={`${textMuted} text-xs`}>{d.subject}</span>
                                    <span className={`${text} text-xs font-medium`}>{d.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Empty wardrobe */}
            {!loading && !recommendation && wardrobe.length === 0 && (
                <div className={`${card} backdrop-blur-md border rounded-3xl p-8 text-center`}>
                    <div className="text-5xl mb-3">👗</div>
                    <p className={`${text} font-medium`}>Your wardrobe is empty</p>
                    <p className={`${textFaint} text-sm mt-1`}>Add items in your Profile to get outfit recommendations</p>
                </div>
            )}
        </div>
    );
}