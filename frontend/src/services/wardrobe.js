import { api } from "./api";

export async function getWardrobe(params = {}) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.occasion) query.set("occasion", params.occasion);
  if (params.limit) query.set("limit", params.limit);
  if (params.offset) query.set("offset", params.offset);
  const qs = query.toString();
  return await api.get(`/wardrobe${qs ? `?${qs}` : ""}`);
}

export async function scanItem(imageFile, categoryHint = null) {
  const formData = new FormData();
  formData.append("image", imageFile);
  if (categoryHint) formData.append("category_hint", categoryHint);
  return await api.post("/wardrobe/scan", formData);
}

export async function addWardrobeItem(item) {
  return await api.post("/wardrobe/items", item);
}

export async function getWardrobeItem(itemId) {
  return await api.get(`/wardrobe/items/${itemId}`);
}

export async function updateWardrobeItem(itemId, updates) {
  return await api.patch(`/wardrobe/items/${itemId}`, updates);
}

export async function deleteWardrobeItem(itemId) {
  return await api.delete(`/wardrobe/items/${itemId}`);
}