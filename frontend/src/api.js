import axios from "axios";

// Locally, "/api" alone works because Vite's dev server proxies it to the
// backend (see vite.config.js) — frontend and backend share an origin
// there. In production, once they're deployed as separate services on
// different domains, VITE_API_BASE_URL points straight at the deployed
// backend's URL instead.
const api = axios.create({ baseURL: `${import.meta.env.VITE_API_BASE_URL || ""}/api` });

export async function fetchReports(type) {
  const res = await api.get("/reports", { params: type ? { type } : {} });
  return res.data;
}

export async function createReport({ lat, lng, type, severity, areaName, photoFile }) {
  const formData = new FormData();
  formData.append("lat", lat);
  formData.append("lng", lng);
  formData.append("type", type || "waterlogging");
  formData.append("severity", severity);
  if (areaName) formData.append("areaName", areaName);
  if (photoFile) formData.append("photo", photoFile);

  const res = await api.post("/reports", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function upvoteReport(id) {
  const res = await api.patch(`/reports/${id}/upvote`);
  return res.data;
}

// Returns { deleted: true } once enough people confirm a report has
// cleared up, or { deleted: false, report } if more confirmations are
// still needed.
export async function clearReport(id) {
  const res = await api.patch(`/reports/${id}/clear`);
  return res.data;
}

// Turns a dropped pin's coordinates into a readable area name (e.g. "Hindmata")
// via the backend, which proxies OpenStreetMap's free Nominatim service.
export async function reverseGeocode(lat, lng) {
  try {
    const res = await api.get("/geocode/reverse", { params: { lat, lng } });
    return res.data.areaName || "";
  } catch (err) {
    console.warn("Reverse geocoding failed, continuing without an area name:", err);
    return "";
  }
}

// Searches for a place/road name within India, used by the search bar's
// autocomplete. Also proxied through the backend (Nominatim requires a
// descriptive User-Agent, which only a server can reliably set).
export async function searchPlaces(query) {
  try {
    const res = await api.get("/geocode/search", { params: { q: query } });
    return res.data || [];
  } catch (err) {
    console.warn("Place search failed:", err);
    return [];
  }
}

export default api;