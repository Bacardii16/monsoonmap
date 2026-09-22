import { useRef, useState } from "react";
import { searchPlaces } from "./api.js";

// How much each severity contributes to a route's risk score. Water
// severities and pothole sizes share one scale (both roughly "how bad is
// this for a vehicle to pass") so they can be summed together meaningfully
// — "clear" contributes nothing since it's explicitly a non-issue report.
const RISK_WEIGHTS = {
  clear: 0,
  minor: 1,
  difficult: 2,
  impassable: 4,
  small: 1,
  medium: 2,
  large: 3,
  hazardous: 4,
};

// A report only counts against a route if it's within this many meters of
// the path — otherwise literally every report in the city would count
// against every route regardless of how far away it actually is.
const RISK_BUFFER_METERS = 250;

// Equirectangular approximation (fine at city/route scale, much cheaper
// than proper great-circle math) for turning lat/lng into local meters
// around a reference point, so distance-to-segment can use plain 2D math.
function toLocalMeters(point, ref) {
  const latRad = (ref.lat * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRad);
  return {
    x: (point.lng - ref.lng) * mPerDegLng,
    y: (point.lat - ref.lat) * mPerDegLat,
  };
}

function distanceToSegmentMeters(point, segStart, segEnd) {
  const ref = segStart;
  const p = toLocalMeters(point, ref);
  const a = { x: 0, y: 0 };
  const b = toLocalMeters(segEnd, ref);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  const dx = p.x - closestX;
  const dy = p.y - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

function minDistanceToPath(point, path) {
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distanceToSegmentMeters(point, path[i], path[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

// Sums the risk weight of every report within RISK_BUFFER_METERS of any
// point along the route path. A report near multiple close-together
// segments is only ever counted once (it's evaluated against the whole
// path's minimum distance, not per-segment).
function scoreRoute(path, reports) {
  let score = 0;
  const nearby = [];
  for (const r of reports) {
    const weight = RISK_WEIGHTS[r.severity] ?? 0;
    if (weight === 0) continue; // "clear" reports can't make a route riskier
    const d = minDistanceToPath({ lat: r.location.lat, lng: r.location.lng }, path);
    if (d <= RISK_BUFFER_METERS) {
      score += weight;
      nearby.push(r);
    }
  }
  return { score, nearby };
}

function riskLabel(score) {
  if (score === 0) return "Low";
  if (score <= 3) return "Moderate";
  return "High";
}

// Drives the whole route-planning panel: from/to search-with-autocomplete
// (reusing the same backend place search as the main search bar), calling
// OSRM's free public routing API for alternatives once both ends are
// picked, and scoring each alternative against the current report list.
export function useRoutePlanner(reports) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromMatches, setFromMatches] = useState([]);
  const [toMatches, setToMatches] = useState([]);
  const [fromPlace, setFromPlace] = useState(null); // { lat, lng, name }
  const [toPlace, setToPlace] = useState(null);
  const [routes, setRoutes] = useState([]); // [{ path, distanceMeters, durationSeconds, score, nearby, isSafest, isShortest }]
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Separate debounce/stale-response-guard state per field — "from" and
  // "to" are searched independently, so one field's typing shouldn't cancel
  // or race against the other's.
  const fromDebounceRef = useRef(null);
  const fromRequestIdRef = useRef(0);
  const toDebounceRef = useRef(null);
  const toRequestIdRef = useRef(0);

  // Debounced ~400ms, matching the main search bar — Nominatim's usage
  // policy caps requests to about 1/second, so this can't fire on every
  // keystroke.
  function debouncedSearch(query, setMatches, debounceRef, requestIdRef) {
    clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setMatches([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      const results = await searchPlaces(trimmed);
      if (requestId !== requestIdRef.current) return; // stale — user kept typing
      setMatches(results.slice(0, 5));
    }, 400);
  }

  function selectFrom(place) {
    clearTimeout(fromDebounceRef.current);
    setFromPlace({ lat: place.lat, lng: place.lng, name: place.name });
    setFromQuery(place.name);
    setFromMatches([]);
  }

  function selectTo(place) {
    clearTimeout(toDebounceRef.current);
    setToPlace({ lat: place.lat, lng: place.lng, name: place.name });
    setToQuery(place.name);
    setToMatches([]);
  }

  async function findRoutes() {
    if (!fromPlace || !toPlace) {
      setError("Pick both a starting point and a destination first.");
      return;
    }
    setLoading(true);
    setError("");
    setRoutes([]);

    try {
      // OSRM's free public routing service — no API key or billing needed.
      // Coordinates go lng,lat (opposite order from what we store elsewhere).
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${fromPlace.lng},${fromPlace.lat};${toPlace.lng},${toPlace.lat}` +
        `?alternatives=true&overview=full&geometries=geojson`;

      const res = await fetch(url);
      const data = await res.json();
      console.log(
        "OSRM response:",
        data.routes?.[0]?.geometry,
        "points:",
        data.routes?.[0]?.geometry?.coordinates?.length
      );

      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        setError("No routes found between those two points.");
        setLoading(false);
        return;
      }

      const scored = data.routes.map((route) => {
        // OSRM gives [lng, lat] pairs; the rest of this file expects {lat, lng}.
        const path = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
        const distanceMeters = route.distance;
        const durationSeconds = route.duration;
        const { score, nearby } = scoreRoute(path, reports);
        return { path, distanceMeters, durationSeconds, score, nearby };
      });

      const shortestIdx = scored.reduce(
        (best, r, i) => (r.distanceMeters < scored[best].distanceMeters ? i : best),
        0
      );
      const safestIdx = scored.reduce(
        (best, r, i) =>
          r.score < scored[best].score || (r.score === scored[best].score && r.distanceMeters < scored[best].distanceMeters)
            ? i
            : best,
        0
      );

      const final = scored.map((r, i) => ({
        ...r,
        isShortest: i === shortestIdx,
        isSafest: i === safestIdx,
      }));

      setRoutes(final);
      setSelectedIndex(safestIdx);
    } catch (err) {
      console.error("Routing request failed:", err);
      setError("Couldn't find a route between those two points. Try different locations.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFromQuery("");
    setToQuery("");
    setFromMatches([]);
    setToMatches([]);
    setFromPlace(null);
    setToPlace(null);
    setRoutes([]);
    setSelectedIndex(0);
    setError("");
  }

  return {
    panelOpen,
    setPanelOpen,
    fromQuery,
    setFromQuery: (q) => {
      setFromQuery(q);
      setFromPlace(null);
      debouncedSearch(q, setFromMatches, fromDebounceRef, fromRequestIdRef);
    },
    toQuery,
    setToQuery: (q) => {
      setToQuery(q);
      setToPlace(null);
      debouncedSearch(q, setToMatches, toDebounceRef, toRequestIdRef);
    },
    fromMatches,
    toMatches,
    selectFrom,
    selectTo,
    routes,
    selectedIndex,
    setSelectedIndex,
    loading,
    error,
    findRoutes,
    reset,
    riskLabel,
  };
}