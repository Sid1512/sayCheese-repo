import { api } from "./api";

export async function register({ email, password, name }) {
  const data = await api.post("/auth/register", { email, password, name });
  localStorage.setItem("dayadapt_token", data.token);
  localStorage.setItem("dayadapt_user_id", data.user_id);
  return data;
}

export async function login({ email, password }) {
  const data = await api.post("/auth/login", { email, password });
  localStorage.setItem("dayadapt_token", data.token);
  localStorage.setItem("dayadapt_user_id", data.user_id);
  return data;
}

export function logout() {
  localStorage.removeItem("dayadapt_token");
  localStorage.removeItem("dayadapt_user_id");
  localStorage.removeItem("dayadapt_user");
}

export function getToken() {
  return localStorage.getItem("dayadapt_token");
}

export function isLoggedIn() {
  return !!localStorage.getItem("dayadapt_token");
}