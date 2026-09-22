// Central home-base coordinates for the app. Kept in one place so the
// Leaflet map and the 3D globe intro always agree on where "India" is.
export const INDIA_LAT = 22.5937;
export const INDIA_LNG = 78.9629;

// {lat, lng} object form — Leaflet accepts this anywhere it accepts a
// [lat, lng] tuple, so no conversion is needed elsewhere.
export const INDIA_CENTER = { lat: INDIA_LAT, lng: INDIA_LNG };
// Loose bounding box around the Indian mainland + islands, with a bit of
// margin so panning near the border doesn't feel clipped.
export const INDIA_BOUNDS_SW = { lat: 5.0, lng: 66.0 };
export const INDIA_BOUNDS_NE = { lat: 37.5, lng: 99.0 };

// Single source of truth for both report types' severity scales, shared by
// ReportForm, FilterChips, MapView, and StatsBar so colors/labels/keys
// never drift apart between components. Severity keys are intentionally
// disjoint between the two types (no overlapping strings) so a flat
// `severity` filter works across both without ambiguity.
export const WATER_SEVERITIES = [
  { key: "clear", label: "Clear", color: "#3ED598" },
  { key: "minor", label: "Minor", color: "#FFD166" },
  { key: "difficult", label: "Difficult", color: "#FF9E4A" },
  { key: "impassable", label: "Impassable", color: "#FF5C5C" },
];

export const POTHOLE_SEVERITIES = [
  { key: "small", label: "Small", color: "#C9A66B" },
  { key: "medium", label: "Medium", color: "#B5702F" },
  { key: "large", label: "Large", color: "#8B4513" },
  { key: "hazardous", label: "Hazardous", color: "#5C2E0C" },
];

export const SEVERITY_LABELS = Object.fromEntries(
  [...WATER_SEVERITIES, ...POTHOLE_SEVERITIES].map((s) => [s.key, s.label])
);
export const SEVERITY_COLORS = Object.fromEntries(
  [...WATER_SEVERITIES, ...POTHOLE_SEVERITIES].map((s) => [s.key, s.color])
);