// Live weather via Open-Meteo — free, no API key or billing account, and
// (unlike Nominatim) its API is designed for direct browser calls with
// CORS already enabled, so this skips the backend-proxy pattern used for
// geocoding and calls it straight from the frontend.
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes (the scheme Open-Meteo uses) collapsed into just what
// this app needs: a short label and an emoji, grouped by the ranges that
// matter for "is it raining there right now".
function describeWeatherCode(code) {
  if (code === 0) return { label: "Clear sky", icon: "☀️" };
  if (code >= 1 && code <= 3) return { label: "Partly cloudy", icon: "⛅" };
  if (code === 45 || code === 48) return { label: "Fog", icon: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", icon: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Rain", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "Snow", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Rain showers", icon: "🌧️" };
  if (code >= 95) return { label: "Thunderstorm", icon: "⛈️" };
  return { label: "—", icon: "🌡️" };
}

// Returns null on any failure — weather is a nice-to-have context badge,
// never something that should block a report popup from rendering.
export async function fetchCurrentWeather(lat, lng) {
  try {
    const res = await fetch(
      `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const current = data.current;
    if (!current) return null;

    const { label, icon } = describeWeatherCode(current.weather_code);
    return {
      tempC: Math.round(current.temperature_2m),
      precipitationMm: current.precipitation,
      isRaining: current.precipitation > 0,
      label,
      icon,
    };
  } catch (err) {
    console.warn("Weather fetch failed:", err);
    return null;
  }
}