import { api } from "./api";

export async function getRecommendation({ date, activity, mood, location }) {
  return await api.post("/recommendations", {
    date: date || new Date().toISOString().split("T")[0],
    activity,
    mood,
    location,
  });
}