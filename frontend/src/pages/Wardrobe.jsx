import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useTheme } from "../App";
import { addWardrobeItem, deleteWardrobeItem, scanItem, updateWardrobeItem } from "../services/wardrobe";

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
  const [editItem, setEditItem] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
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
      top: "👕", bottom: "👖", footwear: "👟", accessory: "🎩",
    };
    return map[cat] || "👔";
  };


  const slotToCategories = {
    top_inner: ["top"],  // inner layer — filter further by layer in picker
    top_outer: ["top"],  // outer layer — filter further by layer in picker
    bottom: ["bottom"],
    footwear: ["footwear"],
    optional: ["accessory"],
  };

  // For top slots, further filter by layer within the category
  const slotLayerFilter = {
    top_inner: "inner",
    top_outer: "outer",
  };

  const allowedCategories = slotToCategories[pickSlot] || [];

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
      setSelectedItem(null);
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
        layer: scanResult.layer ?? null,
        image_url: scanResult.image_url,
        tags: { ...scanResult.tags },
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
    navigate(`${returnTo}?pickedSlot=${encodeURIComponent(pickSlot)}&pickedItemId=${encodeURIComponent(pickedItemId)}`);
  }

  function handlePickNone() {
    navigate(`${returnTo}?pickedSlot=${encodeURIComponent(pickSlot)}&pickedItemId=none`);
  }

  const sourceWardrobe = isPickerMode
    ? wardrobe.filter((item) => {
        if (!allowedCategories.includes(item.category)) return false;
        const layerFilter = slotLayerFilter[pickSlot];
        if (!layerFilter) return true;
        // For top_inner: show items with layer='inner' OR layer=null (legacy items)
        // For top_outer: show items with layer='outer' only
        if (layerFilter === 'inner') return item.layer === 'inner' || item.layer == null;
        return item.layer === layerFilter;
      })
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
          <p className={`${textFaint} text-sm mt-1`}>Detecting category, warmth, and more</p>
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
                      <span className={`${textFaint} text-xs`}>
                        {item.times_worn_last_30_days ?? item.times_worn ?? 0}x worn
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
              {scanResult.category === "top" && (
                <div className={`col-span-2 ${cardInner} rounded-xl p-3`}>
                  <p className={`${textFaint} text-xs mb-2`}>Layer type</p>
                  <div className="flex gap-2">
                    {["inner", "outer"].map((l) => (
                      <button
                        key={l}
                        onClick={() => setScanResult((p) => ({ ...p, layer: l }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                          (scanResult.layer ?? "inner") === l
                            ? isDark ? "bg-white text-blue-900" : "bg-gray-900 text-white"
                            : cardInner + " " + text
                        }`}
                      >
                        {l === "inner" ? "👕 Inner (t-shirt, shirt)" : "🧥 Outer (hoodie, cardigan)"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Warmth</p>
                <p className={`${text} text-sm font-medium`}>{"🔥".repeat(scanResult.tags?.warmth || 1)}</p>
              </div>
              <div className={`${cardInner} rounded-xl p-3`}>
                <p className={`${textFaint} text-xs`}>Waterproof</p>
                <p className={`${text} text-sm font-medium`}>{scanResult.tags?.waterproof ? "✅ Yes" : "❌ No"}</p>
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
                onClick={() => setEditItem({ ...selectedItem })}
                className={`flex-1 ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-gray-900"} py-3 rounded-2xl font-medium text-sm`}
              >
                ✏️ Edit
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
      {/* ── EDIT ITEM MODAL ── */}
      {!isPickerMode && editItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center p-4"
          onClick={() => setEditItem(null)}
        >
          <div
            className={`${isDark ? "bg-blue-950" : "bg-white"} border ${isDark ? "border-white/20" : "border-black/10"} rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`${text} text-lg font-bold mb-1`}>Edit Item</h3>
            <p className={`${textMuted} text-sm mb-4`}>Update details for this item</p>

            {editItem.image_url && (
              <img src={editItem.image_url} alt={editItem.name} className="w-full h-40 object-cover rounded-2xl mb-4" />
            )}

            {/* Name */}
            <div className="mb-3">
              <p className={`${textFaint} text-xs mb-1`}>Name</p>
              <input
                className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none ${isDark ? "bg-white/10 border-white/20 text-white placeholder-white/40" : "bg-black/5 border-black/20 text-gray-900"}`}
                value={editItem.name}
                onChange={(e) => setEditItem((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            {/* Layer — tops only */}
            {editItem.category === "top" && (
              <div className="mb-3">
                <p className={`${textFaint} text-xs mb-2`}>Layer type</p>
                <div className="flex gap-2">
                  {["inner", "outer"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setEditItem((p) => ({ ...p, layer: l }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                        (editItem.layer ?? "inner") === l
                          ? isDark ? "bg-white text-blue-900 border-white" : "bg-gray-900 text-white border-gray-900"
                          : isDark ? "bg-white/10 text-white border-white/20" : "bg-black/5 text-gray-900 border-black/20"
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
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                      editItem.tags.waterproof === val
                        ? isDark ? "bg-white text-blue-900 border-white" : "bg-gray-900 text-white border-gray-900"
                        : isDark ? "bg-white/10 text-white border-white/20" : "bg-black/5 text-gray-900 border-black/20"
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
                      (editItem.tags.occasion || []).includes(occ)
                        ? isDark ? "bg-white text-blue-900 border-white" : "bg-gray-900 text-white border-gray-900"
                        : isDark ? "bg-white/10 text-white border-white/20" : "bg-black/5 text-gray-900 border-black/20"
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