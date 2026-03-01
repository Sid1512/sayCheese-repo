import { mockRequest, shouldForceMockApi } from "./mockApi";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

function getToken() {
  return localStorage.getItem("dayadapt_token");
}

async function request(path, options = {}) {
  if (shouldForceMockApi()) {
    return await mockRequest(path, options);
  }

  const token = getToken();

  const headers = {
    ...options.headers,
  };

  // Only set Content-Type to JSON if we're not sending FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    console.warn(`API fetch failed for ${path}. Falling back to mock API.`, err);
    return await mockRequest(path, options);
  }

  // Handle no content responses (e.g. DELETE 204)
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  // Token expired or invalid — clear session
  if (res.status === 401) {
    localStorage.removeItem("dayadapt_token");
    localStorage.removeItem("dayadapt_user");
    window.location.href = "/onboarding";
    return;
  }

  if (!res.ok) {
    const error = new Error(data?.error?.message || "API error");
    error.code = data?.error?.code;
    error.status = res.status;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),

  post: (path, body) =>
    request(path, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: (path, body) =>
    request(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: (path) =>
    request(path, {
      method: "DELETE",
    }),
};
