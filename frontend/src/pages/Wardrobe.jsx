import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useTheme } from "../App";
import { addWardrobeItem, deleteWardrobeItem, scanItem } from "../services/wardrobe";

const WARDROBE_PICK_KEY = "dayadapt_wardrobe_pick";

export default function Wardrobe() {
  const { wardrobe, refreshWardrobe } = useApp();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedItem, setSelectedItem] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const fileRef = useRef();

  const text = isDark ? "text-white" : "text-gray-900";
  const textMuted = isDark ? "text-white/60" : "text-gray-500";
  const textFaint = isDark ? "text-white/40" : "text-gray-400";
  const card = isDark ? "bg-white/10 border-white/20" : "bg-black/10 border-black/20";
  const cardInner = isDark ? "bg-white/10" : "bg-black/10";
  const modalBg = isDark ? "bg-blue-950" : "bg-white";
  const addBtn = isDark ? "bg-white text-blue-900 hover:bg-blue-50" : "bg-gray-900 text-white hover:bg-gray-800";
  const closeBtn = isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-900";
  const pickSlot = searchParams.get("pick");
  const returnTo = searchParams.get("returnTo") || "/";
  const isPickerMode = !!pickSlot;

  const categoryEmoji = (cat) => {
    const map = {
      top: "👕", bottom: "👖", footwear: "👟",
      jacket: "🧥", thermal: "🧣", scarf: "🧣",
      hat: "🧢", gloves: "🧤", facemask: "😷",
      umbrella: "☂️", accessories: "🎩",
    };
    return map[cat] || "👔";
  };

  const sustainabilityColor = (score) => {
    if (score >= 4) return "text-green-500";
    if (score >= 3) return "text-yellow-500";
    return "text-red-500";
  };

  const slotToCategories = {
    top: ["top"],
    bottom: ["bottom"],
    footwear: ["footwear"],
    optional: ["thermal", "jacket", "scarf", "hat", "gloves", "facemask", "umbrella", "accessories"],
  };

  const allowedCategories = slotToCategories[pickSlot] || [];

  async function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    setScanResult(null);
    try {
      const result = await scanItem(file);
      setScanResult({
        ...result.detected_item,
        editName: result.detected_item.name,
        editComfort: result.detected_item.tags?.user_comfort || 3,
      });
    } catch (err) {
      alert("Failed to scan item. Please try again.");
      console.error(err);
    } finally {
      setScanning(false);
      e.target.value = "";
    }
  }

  async function handleConfirmScan() {
    if (!scanResult) return;
    setSaving(true);
    try {
      await addWardrobeItem({
        name: scanResult.editName,
        description: scanResult.description,
        category: scanResult.category,
        image_url: scanResult.image_url,
        tags: {
          ...scanResult.tags,
          user_comfort: scanResult.editComfort,
        },
      });
      setScanResult(null);
      await refreshWardrobe();
    } catch (err) {
      alert("Failed to save item. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(itemId) {
    if (!confirm("Remove this item from your wardrobe?")) return;
    setDeleting(itemId);
    try {
      await deleteWardrobeItem(itemId);
      setSelectedItem(null);
      await refreshWardrobe();
    } catch (err) {
      alert("Failed to delete item.");
      console.error(err);
    } finally {
      setDeleting(null);
    }
  }

  function handlePick(item) {
    const pickedItemId = item.item_id || item.id;
    localStorage.setItem(
      WARDROBE_PICK_KEY,
      JSON.stringify({ slot: pickSlot, item, pickedAt: Date.now() })
    );
    navigate(`${returnTo}?pickedSlot=${encodeURIComponent(pickSlot)}&pickedItemId=${encodeURIComponent(pickedItemId)}`);
  }

  function handlePickNone() {
    localStorage.setItem(
      WARDROBE_PICK_KEY,
      JSON.stringify({ slot: pickSlot, item: null, pickedAt: Date.now(), none: true })
    );
    navigate(`${returnTo}?pickedSlot=${encodeURIComponent(pickSlot)}&pickedItemId=none`);
  }

  const sourceWardrobe = isPickerMode
    ? wardrobe.filter((item) => allowedCategories.includes(item.category))
    : wardrobe;

  const groupedWardrobe = sourceWardrobe.reduce((acc, item) => {
    const cat = item.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen pb-24 px-4 pt-6 max-w-md mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className={`${text} text-2xl font-bold`}>
          {isPickerMode ? `Pick ${pickSlot}` : "Wardrobe"}
        </h1>
        {isPickerMode && (
          <button
            onClick={() => navigate(returnTo)}
            className={`${textFaint} text-sm`}
          >
            Cancel
          </button>
        )}
      </div>

      {isPickerMode && (
        <div className={`${card} border rounded-2xl p-3 mb-4`}>
          <p className={`${text} text-sm`}>
            Select an item to use as your <span className="font-bold capitalize">{pickSlot}</span> for today.
          </p>
          <button
            onClick={handlePickNone}
            className={`mt-3 text-xs px-3 py-2 rounded-xl ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-700"}`}
          >
            Wear none for this slot
          </button>
        </div>
      )}

      {!isPickerMode && (
        <>
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

          <button
            onClick={() => fileRef.current?.click()}
            className={`w-full ${addBtn} font-bold py-4 rounded-2xl mb-4 flex items-center justify-center gap-2 transition-all`}
          >
            <span className="text-xl">📸</span> Add Wardrobe Item
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </>
      )}

      {!isPickerMode && scanning && (
        <div className={`${card} backdrop-blur-md border rounded-3xl p-6 mb-4 text-center`}>
          <div className="text-4xl mb-3 animate-bounce">🔍</div>
          <p className={`${text} font-medium`}>Analyzing your item...</p>
          <p className={`${textFaint} text-sm mt-1`}>Detecting category, warmth, sustainability & more</p>
        </div>
      )}

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
                    key={item.item_id || item.id}
                    onClick={() => (isPickerMode ? handlePick(item) : setSelectedItem(item))}
                    className={`${card} border rounded-2xl p-3 text-left hover:opacity-80 transition-all`}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-28 object-cover rounded-xl mb-2"
                      />
                    ) : (
                      <div className={`w-full h-28 ${cardInner} rounded-xl mb-2 flex items-center justify-center text-3xl`}>
                        {categoryEmoji(item.category)}
                      </div>
                    )}
                    <p className={`${text} text-sm font-medium truncate`}>{item.name}</p>
                    <p className={`${textFaint} text-xs capitalize`}>{item.tags?.color}</p>
                    <div className="flex justify-between mt-1">
                      {item.tags?.sustainabilityScore && (
                        <span className={`text-xs ${sustainabilityColor(item.tags.sustainabilityScore)}`}>
                          ♻️ {item.tags.sustainabilityScore}/5
                        </span>
                      )}
                      <span className={`${textFaint} text-xs`}>
                        {item.times_worn ?? 0}x worn
                      </span>
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

      {!isPickerMode && scanResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className={`${modalBg} border ${isDark ? "border-white/20" : "border-black/10"} rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto`}>
            <h3 className={`${text} text-lg font-bold mb-1`}>Confirm Item</h3>
            <p className={`${textMuted} text-sm mb-4`}>Review and edit before saving</p>

            {scanResult.image_url && (
              <img
                src={scanResult.image_url}
                alt="scanned item"
                className="w-full h-48 object-cover rounded-2xl mb-4"
              />
            )}

            <div className="mb-3">
              <p className={`${textFaint} text-xs mb-1`}>Name</p>
              <input
                className={`w-full ${cardInner} border ${isDark ? "border-white/20" : "border-black/20"} rounded-xl px-3 py-2 ${text} text-sm focus:outline-none`}
                value={scanResult.editName}
                onChange={(e) => setScanResult((p) => ({ ...p, editName: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Category</p>
                <p className={`${text} text-sm font-medium capitalize`}>{scanResult.category}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Color</p>
                <p className={`${text} text-sm font-medium capitalize`}>{scanResult.tags?.color}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Warmth</p>
                <p className={`${text} text-sm font-medium`}>{"🔥".repeat(scanResult.tags?.warmth || 1)}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Waterproof</p>
                <p className={`${text} text-sm font-medium`}>{scanResult.tags?.waterproof ? "✅ Yes" : "❌ No"}</p>
              </div>
              {scanResult.tags?.sustainabilityScore && (
                <div className={`${cardInner} rounded-xl p-3`}>
                  <p className={`${textFaint} text-xs`}>Sustainability</p>
                  <p className={`font-medium text-sm ${sustainabilityColor(scanResult.tags.sustainabilityScore)}`}>
                    {scanResult.tags.sustainabilityScore}/5
                  </p>
                </div>
              )}
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Confidence</p>
                <p className={`${text} text-sm font-medium`}>{Math.round((scanResult.confidence || 0) * 100)}%</p>
              </div>
            </div>

            <div className="mb-4">
              <p className={`${textFaint} text-xs mb-2`}>How comfortable is this item? (1–5)</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScanResult((p) => ({ ...p, editComfort: n }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                      scanResult.editComfort === n
                        ? isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white"
                        : cardInner + " " + text
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {scanResult.description && (
              <div className={`${cardInner} rounded-xl p-3 mb-4`}>
                <p className={`${textFaint} text-xs mb-1`}>Description</p>
                <p className={`${textMuted} text-sm`}>{scanResult.description}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setScanResult(null)}
                className={`flex-1 ${closeBtn} py-3 rounded-2xl font-medium text-sm`}
              >
                Discard
              </button>
              <button
                onClick={handleConfirmScan}
                disabled={saving}
                className={`flex-1 ${isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white"} py-3 rounded-2xl font-bold text-sm disabled:opacity-40`}
              >
                {saving ? "Saving..." : "Save to Wardrobe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isPickerMode && selectedItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className={`${modalBg} border ${isDark ? "border-white/20" : "border-black/10"} rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            {selectedItem.image_url && (
              <img
                src={selectedItem.image_url}
                alt={selectedItem.name}
                className="w-full h-56 object-cover rounded-2xl mb-4"
              />
            )}
            <h3 className={`${text} text-xl font-bold mb-1`}>{selectedItem.name}</h3>
            <p className={`${textFaint} text-sm capitalize mb-1`}>
              {selectedItem.category} • {selectedItem.tags?.color}
            </p>
            {selectedItem.description && (
              <p className={`${textMuted} text-sm mb-4`}>{selectedItem.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Warmth</p>
                <p className={`${text} font-medium`}>{"🔥".repeat(selectedItem.tags?.warmth || 1)}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Breathability</p>
                <p className={`${text} font-medium`}>{"💨".repeat(selectedItem.tags?.breathability || 1)}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Waterproof</p>
                <p className={`${text} font-medium`}>{selectedItem.tags?.waterproof ? "✅ Yes" : "❌ No"}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Comfort</p>
                <p className={`${text} font-medium`}>{selectedItem.tags?.user_comfort || "—"}/5</p>
              </div>
            </div>

            {selectedItem.tags?.occasion?.length > 0 && (
              <div className={`${cardInner} rounded-xl p-3 mb-4`}>
                <p className={`${textFaint} text-xs mb-1`}>Occasions</p>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.tags.occasion.map((o) => (
                    <span key={o} className={`${cardInner} ${text} text-xs px-2 py-1 rounded-full capitalize`}>{o}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => handleDelete(selectedItem.item_id || selectedItem.id)}
                disabled={deleting === (selectedItem.item_id || selectedItem.id)}
                className="flex-1 bg-red-500/20 border border-red-400/30 text-red-400 py-3 rounded-2xl font-medium text-sm disabled:opacity-40"
              >
                {deleting ? "Deleting..." : "🗑️ Remove"}
              </button>
              <button
                onClick={() => setSelectedItem(null)}
                className={`flex-1 ${closeBtn} py-3 rounded-2xl font-medium text-sm`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
