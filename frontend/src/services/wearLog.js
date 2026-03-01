import { api } from "./api";

export async function logWear({ date, activity, item_ids }) {
  return await api.post("/wear-log", {
    date: date || new Date().toISOString().split("T")[0],
    activity,
    item_ids,
  });
}

export async function getWearLog({ from, to, item_id } = {}) {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (item_id) query.set("item_id", item_id);
  const qs = query.toString();
  return await api.get(`/wear-log${qs ? `?${qs}` : ""}`);
}