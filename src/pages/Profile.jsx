import { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import { useTheme } from "../App";
import { analyzeClothingItem } from "../services/claude";
import { storage } from "../services/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

export default function Profile() {
  const { user, wardrobe, addWardrobeItem } = useApp();
  const { isDark } = useTheme();
  const [selectedItem, setSelectedItem] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  const text = isDark ? "text-white" : "text-gray-900";
  const textMuted = isDark ? "text-white/60" : "text-gray-500";
  const textFaint = isDark ? "text-white/40" : "text-gray-400";
  const card = isDark ? "bg-white/10 border-white/20" : "bg-black/10 border-black/20";
  const cardInner = isDark ? "bg-white/10" : "bg-black/10";
  const modalBg = isDark ? "bg-blue-950" : "bg-white";
  const addBtn = isDark ? "bg-white text-blue-900 hover:bg-blue-50" : "bg-gray-900 text-white hover:bg-gray-800";
  const closeBtn = isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-900";

  const sustainabilityColor = (score) => {
    if (score >= 4) return "text-green-500";
    if (score >= 3) return "text-yellow-500";
    return "text-red-500";
  };

  const categoryEmoji = (cat) => {
    const map = { tops: "👕", bottoms: "👖", outerwear: "🧥", footwear: "👟", accessories: "🎩" };
    return map[cat] || "👔";
  };

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64Full = ev.target.result;
      const base64 = base64Full.split(",")[1];
      setPreview(base64Full);
      setAnalyzing(true);
      try {
        const attributes = await analyzeClothingItem(base64, file.type);
        const storageRef = ref(storage, `wardrobes/${user.id}/${Date.now()}_${file.name}`);
        await uploadString(storageRef, base64Full, "data_url");
        const photoURL = await getDownloadURL(storageRef);
        await addWardrobeItem({ ...attributes, photoURL });
        setPreview(null);
      } catch (err) {
        console.error(err);
        alert("Failed to analyze item. Please try again.");
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }

  const groupedWardrobe = wardrobe.reduce((acc, item) => {
    const cat = item.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-md mx-auto">
      <h1 className={`${text} text-2xl font-bold mb-6`}>Profile</h1>

      {/* User Card */}
      <div className={`${card} backdrop-blur-md border rounded-3xl p-5 mb-6`}>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-2xl flex-shrink-0"
            style={{
              borderColor: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.2)",
              backgroundColor:
                user?.skinTone === "Light" ? "#FDDBB4" :
                user?.skinTone === "Medium" ? "#D4A574" :
                user?.skinTone === "Tan" ? "#C68642" : "#8D5524",
            }}
          >
            {user?.gender === "Male" ? "👨" : user?.gender === "Female" ? "👩" : "🧑"}
          </div>
          <div className="flex-1">
            <h2 className={`${text} text-xl font-bold`}>{user?.name}</h2>
            <p className={`${textMuted} text-sm`}>{user?.age} years • {user?.gender}</p>
            <p className={`${textFaint} text-xs`}>{user?.height}cm • {user?.weight}kg</p>
          </div>
        </div>
        <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/10" : "border-black/10"}`}>
          <p className={`${textFaint} text-xs mb-2`}>Style preferences</p>
          <div className="flex flex-wrap gap-2">
            {user?.stylePreference?.map((s) => (
              <span key={s} className={`${cardInner} ${text} text-xs px-3 py-1 rounded-full`}>{s}</span>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className={`${textFaint} text-xs mb-1`}>Priority</p>
          <span className="bg-blue-400/20 text-blue-500 text-xs px-3 py-1 rounded-full capitalize">
            {user?.comfortPriority}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className={`${text} text-2xl font-bold`}>{wardrobe.length}</p>
          <p className={`${textFaint} text-xs`}>Total Items</p>
        </div>
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className="text-green-500 text-2xl font-bold">
            {wardrobe.filter((i) => (i.sustainabilityScore || 0) >= 4).length}
          </p>
          <p className={`${textFaint} text-xs`}>Eco Items</p>
        </div>
        <div className={`${card} border rounded-2xl p-3 text-center`}>
          <p className="text-blue-500 text-2xl font-bold">
            {wardrobe.filter((i) => (i.wornCount || 0) === 0).length}
          </p>
          <p className={`${textFaint} text-xs`}>Unworn</p>
        </div>
      </div>

      {/* Add Button */}
      <button
        onClick={() => { setTimeout(() => fileRef.current?.click(), 100); }}
        className={`w-full ${addBtn} font-bold py-4 rounded-2xl mb-6 flex items-center justify-center gap-2 transition-all`}
      >
        <span className="text-xl">📸</span> Add Wardrobe Item
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhoto}
      />

      {/* Analyzing */}
      {analyzing && (
        <div className={`${card} backdrop-blur-md border rounded-3xl p-6 mb-6 text-center`}>
          {preview && (
            <img src={preview} alt="preview" className="w-32 h-32 object-cover rounded-2xl mx-auto mb-4" />
          )}
          <div className="text-4xl mb-3 animate-bounce">🔍</div>
          <p className={`${text} font-medium`}>Claude is analyzing your item...</p>
          <p className={`${textFaint} text-sm mt-1`}>Detecting category, warmth, sustainability & more</p>
        </div>
      )}

      {/* Wardrobe */}
      {Object.keys(groupedWardrobe).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedWardrobe).map(([category, items]) => (
            <div key={category}>
              <p className={`${textMuted} text-sm font-medium mb-3 capitalize`}>
                {categoryEmoji(category)} {category}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`${card} border rounded-2xl p-3 text-left hover:opacity-80 transition-all`}
                  >
                    {item.photoURL ? (
                      <img src={item.photoURL} alt={item.name} className="w-full h-28 object-cover rounded-xl mb-2" />
                    ) : (
                      <div className={`w-full h-28 ${cardInner} rounded-xl mb-2 flex items-center justify-center text-3xl`}>
                        {categoryEmoji(item.category)}
                      </div>
                    )}
                    <p className={`${text} text-sm font-medium truncate`}>{item.name}</p>
                    <p className={`${textFaint} text-xs capitalize`}>{item.color}</p>
                    <div className="flex justify-between mt-1">
                      <span className={`text-xs ${sustainabilityColor(item.sustainabilityScore)}`}>
                        ♻️ {item.sustainabilityScore}/5
                      </span>
                      <span className={`${textFaint} text-xs`}>Worn {item.wornCount || 0}x</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">👗</div>
          <p className={`${text} font-medium`}>No items yet</p>
          <p className={`${textFaint} text-sm mt-1`}>Tap the button above to add your first item</p>
        </div>
      )}

      {/* Item Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className={`${modalBg} border ${isDark ? "border-white/20" : "border-black/10"} rounded-3xl p-5 w-full max-w-md`}
            onClick={(e) => e.stopPropagation()}
          >
            {selectedItem.photoURL && (
              <img src={selectedItem.photoURL} alt={selectedItem.name} className="w-full h-56 object-cover rounded-2xl mb-4" />
            )}
            <h3 className={`${text} text-xl font-bold mb-1`}>{selectedItem.name}</h3>
            <p className={`${textFaint} text-sm capitalize mb-4`}>{selectedItem.category} • {selectedItem.color}</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Warmth</p>
                <p className={`${text} font-medium`}>{"🔥".repeat(selectedItem.warmth)}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Breathability</p>
                <p className={`${text} font-medium`}>{"💨".repeat(selectedItem.breathability)}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Waterproof</p>
                <p className={`${text} font-medium`}>{selectedItem.waterproof ? "✅ Yes" : "❌ No"}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Sustainability</p>
                <p className={`font-medium ${sustainabilityColor(selectedItem.sustainabilityScore)}`}>
                  {selectedItem.sustainabilityScore}/5
                </p>
              </div>
            </div>
            <div className={`${cardInner} rounded-xl p-3 mb-4`}>
              <p className={`${textFaint} text-xs mb-1`}>Occasions</p>
              <div className="flex flex-wrap gap-2">
                {selectedItem.occasion?.map((o) => (
                  <span key={o} className={`${cardInner} ${text} text-xs px-2 py-1 rounded-full capitalize`}>{o}</span>
                ))}
              </div>
            </div>
            {selectedItem.wornCount > 0 && (
              <div className="bg-green-500/10 border border-green-400/20 rounded-xl p-3 mb-4">
                <p className="text-green-500 text-sm">♻️ Worn {selectedItem.wornCount} times — great sustainability!</p>
              </div>
            )}
            <button onClick={() => setSelectedItem(null)} className={`w-full ${closeBtn} py-3 rounded-2xl font-medium`}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}