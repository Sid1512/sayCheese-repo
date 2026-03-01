import { api } from "./api";

export async function getWardrobeUtilization(period = "month") {
  return await api.get(`/insights/wardrobe-utilization?period=${period}`);
}