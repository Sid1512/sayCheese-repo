import { api } from "./api";

export async function getProfile() {
  return await api.get("/user/profile");
}

export async function updateProfile(updates) {
  return await api.patch("/user/profile", updates);
}