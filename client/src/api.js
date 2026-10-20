// Small wrapper around fetch() for talking to the KindConnect backend.
//
// In development the Vite dev server proxies "/api" to http://localhost:4000 (see vite.config.js).
// To point at a deployed backend instead, set VITE_API_URL=https://your-api.example.com/api

const BASE_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "kindconnect_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status; // 0 = could not reach the server at all
  }
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(
      "Cannot reach the server. Make sure the backend is running (npm run dev).",
      0
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Empty or non-JSON body - handled below.
  }

  if (!response.ok) {
    // A proxy with no backend behind it answers 500/502/504 with an empty body.
    const message =
      data?.error ||
      (response.status >= 500
        ? "The server is not responding. Make sure the backend is running (npm run dev)."
        : `Request failed (${response.status}).`);
    throw new ApiError(message, response.status);
  }

  return data;
}

export const api = {
  register: (details) => request("/auth/register", { method: "POST", body: details }),
  login: (credentials) => request("/auth/login", { method: "POST", body: credentials }),
  me: () => request("/auth/me"),

  ngos: () => request("/ngos"),
  campaigns: () => request("/campaigns"),
  createCampaign: (campaign) => request("/campaigns", { method: "POST", body: campaign }),

  donations: () => request("/donations"),
  createDonation: (donation) => request("/donations", { method: "POST", body: donation })
};
