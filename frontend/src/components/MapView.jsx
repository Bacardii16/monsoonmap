import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import places from "../data/places.js";
import { searchPlaces } from "../api.js";
import { fetchCurrentWeather } from "../weather.js";
import { useRoutePlanner } from "../routePlanning.js";
import RoutePlannerPanel from "./RoutePlannerPanel.jsx";
import {
  INDIA_CENTER,
  INDIA_BOUNDS_SW,
  INDIA_BOUNDS_NE,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from "../constants.js";

const severityColor = SEVERITY_COLORS;
const severityLabel = SEVERITY_LABELS;

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };

// Below this zoom level, individual pins are hidden entirely rather than
// clustered — at the nationwide view hundreds of pins would just overlap
// into an unreadable mess. Zoom in past this and they appear one by one.
const MIN_ZOOM_FOR_PINS = 8;

// Free OpenStreetMap raster tiles — no API key, no billing, ever. One tile
// source is used for both themes; dark mode is faked with a CSS filter
// (see `[data-theme="dark"] .leaflet-tile-pane` in index.css) rather than a
// separate dark-tile provider, since free dark-tile providers require a
// paid plan. This matches an approach this project already used before.
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Roughly India (with margin) — panning is capped here so the map doesn't
// wander off into the middle of an ocean. maxBoundsViscosity < 1 keeps it
// from feeling like a hard, jarring wall right at the border.
const INDIA_MAX_BOUNDS = L.latLngBounds(
  [INDIA_BOUNDS_SW.lat, INDIA_BOUNDS_SW.lng],
  [INDIA_BOUNDS_NE.lat, INDIA_BOUNDS_NE.lng]
);

// Leaflet's divIcon draws a plain white square by default — this strips
// that so only our own custom-styled inner element shows.
const DIV_ICON_BASE_CLASS = "mm-div-icon";

// Renders the same teardrop-shaped (waterlogging) / circular (pothole)
// marker used before, now as a Leaflet divIcon so it sits at the right
// lat/lng and still picks up the mm-pulse-marker / mm-land-marker CSS
// animations from index.css. The icon's own HTML is a plain string (no
// React event handlers inside it) — clicks are handled by the surrounding
// <Marker eventHandlers>, not by anything inside the icon itself.
function makePinIcon({ severity, type, dropIn }) {
  const pulse = severity === "impassable" || severity === "hazardous";
  const isPothole = type === "pothole";
  const classes = ["mm-marker", dropIn ? "mm-land-marker" : "", pulse ? "mm-pulse-marker" : ""]
    .filter(Boolean)
    .join(" ");

  const style = isPothole
    ? `width:20px;height:20px;border-radius:50%;background:${severityColor[severity] || "#8B4513"};border:2px solid var(--mist);box-shadow:0 2px 5px rgba(0,0,0,0.5);position:absolute;top:0;left:0;`
    : `width:20px;height:20px;border-radius:50% 50% 50% 0;--rot:-45deg;background:${severityColor[severity] || "#999"};border:2px solid var(--mist);box-shadow:0 2px 5px rgba(0,0,0,0.5);position:absolute;top:0;left:0;`;

  return L.divIcon({
    className: DIV_ICON_BASE_CLASS,
    html: `<div style="position:relative;width:22px;height:22px;cursor:pointer;"><div class="${classes}" style="${style}"></div></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

// A quick expanding-ring "tap" acknowledgment at a pin's location, shown
// for a moment right when it's clicked — gives the click some physical
// feedback before the camera even starts flying, rather than the flyTo
// being the only sign the click registered.
function makeRippleIcon() {
  return L.divIcon({
    className: DIV_ICON_BASE_CLASS,
    html: `<div class="mm-click-ripple" style="width:36px;height:36px;border-radius:50%;border:2px solid var(--accent);"></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// Ring + pin marker for a searched destination, matching the old
// makeDestinationIcon() look.
function makeDestinationIcon() {
  const html = `
    <div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
      <div class="mm-ring-marker" style="position:absolute;width:26px;height:26px;border-radius:50%;border:2px solid var(--accent);"></div>
      <div class="mm-land-marker" style="width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--accent);border:2px solid var(--mist);"></div>
    </div>`;
  return L.divIcon({
    className: DIV_ICON_BASE_CLASS,
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 22],
  });
}

// lastFlightKey guards against a second tap on the same destination
// restarting the whole animation from a transient, not-yet-settled state.
let lastFlightKey = null;
let activeFlyToHandler = null;

// Leaflet has a built-in cinematic "fly to" (map.flyTo), unlike Google Maps
// — no hand-rolled requestAnimationFrame tweening needed here anymore.
// This wrapper just adds: a guard against re-triggering the same flight,
// an onArrive callback (Leaflet's flyTo doesn't take one natively — we
// listen for the "moveend" event it fires once the animation settles), and
// a plain instant jump when the user prefers reduced motion.
function smoothFlyTo(map, position, targetZoom = 15, onArrive) {
  if (!map) return;

  const key = `${position.lat.toFixed(5)},${position.lng.toFixed(5)},${targetZoom}`;
  if (key === lastFlightKey) {
    onArrive?.();
    return;
  }
  lastFlightKey = key;

  if (activeFlyToHandler) {
    map.off("moveend", activeFlyToHandler);
    activeFlyToHandler = null;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    map.setView([position.lat, position.lng], targetZoom);
    onArrive?.();
    return;
  }

  activeFlyToHandler = function handleMoveEnd() {
    map.off("moveend", activeFlyToHandler);
    activeFlyToHandler = null;
    onArrive?.();
  };
  map.on("moveend", activeFlyToHandler);
  map.flyTo([position.lat, position.lng], targetZoom, { duration: 1.6 });
}

// Small floating button that re-centers the map on India
// Straight-line distance in km between two lat/lng points — good enough
// for "is a hazard within a few km of you", not meant for routing-grade
// precision.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const HAZARD_CHECK_RADIUS_KM = 3;

// Opt-in geolocation check (never runs without the user tapping the
// button) against the current report list for anything impassable/
// hazardous nearby. Self-contained: does its own location lookup, distance
// math against the `reports` prop MapView already has, and shows its own
// dismissing banner — nothing here needs to reach App.jsx.
function NearbyHazardCheck({ reports, mapRef }) {
  const [status, setStatus] = useState("idle"); // idle | checking | safe | warning | error
  const [nearby, setNearby] = useState([]);
  const dismissTimerRef = useRef(null);

  function scheduleDismiss() {
    clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setStatus("idle"), 7000);
  }
  useEffect(() => () => clearTimeout(dismissTimerRef.current), []);

  function runCheck() {
    if (!navigator.geolocation) {
      setStatus("error");
      scheduleDismiss();
      return;
    }
    setStatus("checking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const severe = reports.filter((r) => r.severity === "impassable" || r.severity === "hazardous");
        const near = severe
          .map((r) => ({ r, km: haversineKm(latitude, longitude, r.location.lat, r.location.lng) }))
          .filter((x) => x.km <= HAZARD_CHECK_RADIUS_KM)
          .sort((a, b) => a.km - b.km);
        setNearby(near);
        setStatus(near.length > 0 ? "warning" : "safe");
        scheduleDismiss();
        const map = mapRef.current;
        if (map) smoothFlyTo(map, { lat: latitude, lng: longitude }, 13);
      },
      () => {
        setStatus("error");
        scheduleDismiss();
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const bannerStyle = {
    warning: { background: "var(--impassable)", color: "#fff" },
    safe: { background: "var(--clear)", color: "#08110a" },
    error: { background: "var(--card-2)", color: "var(--ink)", border: "1px solid var(--line)" },
    checking: { background: "var(--card-2)", color: "var(--ink)", border: "1px solid var(--line)" },
  }[status];

  return (
    <>
      <button
        onClick={runCheck}
        aria-label="Check for hazards near my current location"
        title="Check hazards near me"
        className="mm-glass mm-interactive"
        style={{
          position: "absolute",
          top: 98,
          right: 10,
          zIndex: 500,
          width: "var(--fab-size, 34px)",
          height: "var(--fab-size, 34px)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
          padding: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2">
          <path d="M12 21s7-6.4 7-12a7 7 0 10-14 0c0 5.6 7 12 7 12z" />
          <path d="M12 7v4M12 14v.01" strokeLinecap="round" />
        </svg>
      </button>

      {status !== "idle" && (
        <div
          role="status"
          className="mm-fade-in-down"
          style={{
            position: "absolute",
            top: 100,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 600,
            maxWidth: "min(320px, 80%)",
            borderRadius: 10,
            padding: "9px 14px",
            fontSize: 12.5,
            fontWeight: 500,
            textAlign: "center",
            boxShadow: "0 8px 22px rgba(0,0,0,0.4)",
            ...bannerStyle,
          }}
        >
          {status === "checking" && "Checking your location…"}
          {status === "warning" &&
            `⚠️ ${nearby.length} severe report${nearby.length === 1 ? "" : "s"} within ${HAZARD_CHECK_RADIUS_KM}km of you`}
          {status === "safe" && `You're clear — no severe reports within ${HAZARD_CHECK_RADIUS_KM}km`}
          {status === "error" && "Couldn't get your location — check your browser's location permission"}
        </div>
      )}
    </>
  );
}

function RecenterButton({ mapRef }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      onClick={() => {
        const map = mapRef.current;
        if (!map) return;
        smoothFlyTo(map, INDIA_CENTER, 5);
        setSpinning(true);
        setTimeout(() => setSpinning(false), 500);
      }}
      aria-label="Recenter map on India"
      className="mm-glass mm-interactive"
      style={{
        position: "absolute",
        top: 58,
        right: 10,
        zIndex: 500,
        width: "var(--fab-size, 34px)",
        height: "var(--fab-size, 34px)",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
        padding: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2"
        style={{
          transform: spinning ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.5s ease",
        }}
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// Search bar with autocomplete that flies the map to a chosen place.
// Search results come from the backend's free OpenStreetMap geocoding proxy
// (Nominatim) — separate from the map tiles above, but the same free stack.
// Falls back to a small local list of major India-wide places if the
// backend is unreachable or returns nothing.
function highlightMatch(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: "var(--accent)", fontWeight: 700 }}>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  );
}

function SearchBar({ mapRef, onDestination }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  const inputRef = useRef(null);
  const [noResults, setNoResults] = useState(false);

  // Press "/" anywhere on the page to jump to the search bar, as long as
  // focus isn't already in a text field (so it doesn't hijack normal typing
  // in the report form, for instance).
  useEffect(() => {
    function handleGlobalKeyDown(e) {
      if (e.key !== "/") return;
      const active = document.activeElement;
      const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
      if (isTyping) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function handleChange(e) {
    const q = e.target.value;
    setQuery(q);
    const trimmed = q.trim();

    if (!trimmed) {
      setMatches([]);
      setNoResults(false);
      return;
    }
    setNoResults(false);

    clearTimeout(debounceRef.current);
    // Debounced ~400ms — Nominatim's usage policy caps requests to about
    // 1/second, so we don't fire one on every keystroke.
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      const results = await searchPlaces(trimmed);

      // Ignore stale responses if the user kept typing
      if (requestId !== requestIdRef.current) return;

      if (results.length > 0) {
        setMatches(results.slice(0, 5));
        return;
      }
      const lower = trimmed.toLowerCase();
      const local = places.filter((p) => p.name.toLowerCase().includes(lower)).slice(0, 5);
      setMatches(local);
      setNoResults(local.length === 0);
    }, 400);
  }

  function clearSearch() {
    setQuery("");
    setMatches([]);
    setNoResults(false);
    inputRef.current?.focus();
  }

  function flyToPlace(place) {
    setQuery(place.name);
    setMatches([]);
    setNoResults(false);

    const map = mapRef.current;
    if (!map) return;

    const position = { lat: place.lat, lng: place.lng };
    smoothFlyTo(map, position, 15.5, () => onDestination(position, place.name));
  }

  function handleKeyDown(e) {
    if (e.key !== "Enter" || matches.length === 0) return;
    flyToPlace(matches[0]);
  }

  return (
    <div style={{ position: "absolute", top: 10, left: 10, right: 54, zIndex: 500 }}>
      <div style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            color: "var(--slate)",
          }}
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search a road, area, or city, e.g. Erla Road, Mumbai"
          autoComplete="off"
          aria-label="Search for a road, area, or city in India"
          className="mm-glass"
          style={{
            width: "100%",
            color: "var(--ink)",
            borderRadius: 10,
            padding: "9px 34px 9px 32px",
            fontSize: 13,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        />
        {!query && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 10.5,
              color: "var(--slate)",
              border: "1px solid var(--line)",
              borderRadius: 4,
              padding: "1px 5px",
              pointerEvents: "none",
            }}
          >
            /
          </span>
        )}
        {query && (
          <button
            onClick={clearSearch}
            aria-label="Clear search"
            className="mm-interactive"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--card-2)",
              border: "1px solid var(--line)",
              color: "var(--slate)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {matches.length > 0 && (
        <div
          role="listbox"
          className="mm-glass mm-fade-in-down"
          style={{
            borderRadius: 10,
            marginTop: 4,
            overflow: "hidden",
            boxShadow: "0 8px 22px rgba(0,0,0,0.4)",
          }}
        >
          {matches.map((p) => (
            <div
              key={`${p.lat},${p.lng}`}
              role="option"
              aria-selected="false"
              tabIndex={0}
              onClick={() => flyToPlace(p)}
              onKeyDown={(e) => e.key === "Enter" && flyToPlace(p)}
              style={{
                padding: "9px 12px",
                fontSize: 13,
                color: "var(--ink)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 21s7-6.4 7-12a7 7 0 10-14 0c0 5.6 7 12 7 12z" />
                <circle cx="12" cy="9" r="2.3" />
              </svg>
              {highlightMatch(p.name, query)}
            </div>
          ))}
        </div>
      )}
      {noResults && (
        <div
          className="mm-glass mm-fade-in-down"
          style={{
            borderRadius: 10,
            marginTop: 4,
            padding: "10px 12px",
            fontSize: 12.5,
            color: "var(--slate)",
            boxShadow: "0 8px 22px rgba(0,0,0,0.4)",
          }}
        >
          No matches for "{query}" — try a different spelling or a nearby landmark.
        </div>
      )}
    </div>
  );
}

// Animates a number counting up toward `target` over ~400ms instead of the
// digit just jumping — same technique as StatsBar's count-up (duplicated
// locally rather than shared, since it's a ~15-line hook and not worth
// extracting a shared utils file for yet).
function useCountUp(target, durationMs = 400) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return value;
}

function ReportPopup({ report, onUpvote, onClear, onShare, onViewPhoto }) {
  const [votes, setVotes] = useState(report.upvotes || 0);
  const displayedVotes = useCountUp(votes);
  const [voted, setVoted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPlusOne, setShowPlusOne] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearedConfirmed, setClearedConfirmed] = useState(false);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentWeather(report.location.lat, report.location.lng).then((data) => {
      if (!cancelled) setWeather(data);
    });
    return () => {
      cancelled = true;
    };
  }, [report.location.lat, report.location.lng]);

  const handleUpvote = async () => {
    if (voted) return;
    setVotes((v) => v + 1);
    setVoted(true);
    setShowPlusOne(true);
    setTimeout(() => setShowPlusOne(false), 700);
    if (onUpvote) await onUpvote(report._id || report.id);
  };

  const handleClear = async () => {
    if (clearing || clearedConfirmed) return;
    setClearing(true);
    setClearedConfirmed(true);
    if (onClear) await onClear(report._id || report.id);
    setClearing(false);
  };

  const handleShare = () => {
    onShare?.(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, maxWidth: 210 }} className="mm-fade-up">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{
            fontFamily: "'Newsreader', serif",
            fontWeight: 600,
            fontSize: 14.5,
            color: "var(--ink)",
            overflowWrap: "break-word",
            wordBreak: "break-word",
            minWidth: 0,
          }}
          dir="auto"
        >
          {report.location.areaName || "Reported location"}
        </div>
        <button
          onClick={handleShare}
          aria-label="Copy a link to this report"
          title="Copy link to this report"
          className={`mm-interactive ${copied ? "mm-pop-once" : ""}`}
          style={{
            background: "none",
            border: "none",
            padding: 2,
            color: copied ? "var(--accent)" : "var(--slate)",
            cursor: "pointer",
            flexShrink: 0,
            display: "flex",
          }}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M13.5 6.5l4-4a3 3 0 114.2 4.2l-4 4M10.5 17.5l-4 4a3 3 0 11-4.2-4.2l4-4M8 16l8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
      <div style={{ color: "var(--slate)", marginTop: 2, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: severityColor[report.severity] || "var(--slate)",
            flexShrink: 0,
          }}
        />
        {report.type === "pothole" ? "\u{1F573}\uFE0F " : "\u{1F4A7} "}
        {severityLabel[report.severity] || report.severity} ·{" "}
        {new Date(report.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      {weather && (
        <div
          title={`${weather.label}, ${weather.precipitationMm}mm/h precipitation right now`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10.5,
            color: weather.isRaining ? "var(--difficult)" : "var(--slate)",
            background: "var(--mist)",
            border: "1px solid var(--line)",
            borderRadius: 999,
            padding: "2px 8px",
            marginBottom: 8,
          }}
        >
          <span aria-hidden="true">{weather.icon}</span>
          {weather.isRaining ? `Raining now, ${weather.tempC}°C` : `${weather.label}, ${weather.tempC}°C`}
        </div>
      )}
      {report.notes && (
        <div
          style={{
            color: "var(--slate)",
            fontSize: 11.5,
            marginBottom: 8,
            fontStyle: "italic",
            overflowWrap: "break-word",
            wordBreak: "break-word",
          }}
        >
          {report.notes}
        </div>
      )}
      {!report.notes && <div style={{ marginBottom: 8 }} />}
      {report.photoUrl && (
        <button
          onClick={() => onViewPhoto?.(report.photoUrl)}
          aria-label="View full-size photo"
          className="mm-interactive"
          style={{
            position: "relative",
            display: "block",
            width: "100%",
            padding: 0,
            border: "1px solid var(--line)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 8,
            cursor: "zoom-in",
            background: "var(--mist)",
          }}
        >
          <img
            src={report.photoUrl}
            alt="Reported condition"
            style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 5,
              right: 5,
              background: "rgba(0,0,0,0.55)",
              borderRadius: 6,
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10" cy="10" r="6" />
              <path d="M20 20l-5-5M8 10h4M10 8v4" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      )}
      <div style={{ position: "relative" }}>
        {showPlusOne && (
          <span aria-hidden="true" className="mm-float-up" style={{ color: "var(--accent)" }}>
            +1
          </span>
        )}
        <button
          onClick={handleUpvote}
          disabled={voted}
          aria-label={voted ? "Confirmed" : `Confirm this report is still accurate, currently ${votes} confirmations`}
          className={voted ? "mm-pop-once" : "mm-interactive"}
          style={{
            width: "100%",
            fontSize: 12,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid var(--line)",
            background: voted ? "var(--mist)" : "var(--card-2)",
            color: "var(--ink)",
            cursor: voted ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {voted ? "Thanks for confirming" : `Still like this (${displayedVotes})`}
        </button>
      </div>
      <button
        onClick={handleClear}
        disabled={clearedConfirmed}
        aria-label={clearedConfirmed ? "Marked as cleared" : "Report that this has cleared up or been fixed"}
        className="mm-interactive"
        style={{
          width: "100%",
          fontSize: 11,
          padding: "5px 8px",
          marginTop: 5,
          borderRadius: 6,
          border: "none",
          background: "none",
          color: clearedConfirmed ? "var(--clear)" : "var(--slate)",
          cursor: clearedConfirmed ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ flexShrink: 0 }}>
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        {clearedConfirmed ? "Thanks — marked as cleared" : "This has cleared up / been fixed"}
      </button>
    </div>
  );
}

// Friendly message shown when a severity filter has no matching reports,
// so an empty map doesn't read as broken.
function EmptyState({ label }) {
  return (
    <div
      className="mm-fade-in"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 400,
        background: "var(--card-2)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: "14px 18px",
        textAlign: "center",
        maxWidth: "70%",
        pointerEvents: "none",
      }}
    >
      <svg width="58" height="42" viewBox="0 0 64 48" fill="none" style={{ marginBottom: 8 }}>
        {/* Sun peeking out from behind the cloud — "clear skies" rather than
            a generic sad/empty icon, since no reports matching a filter is
            actually good news in this app. */}
        <g stroke="var(--accent-2)" strokeWidth="1.6" strokeLinecap="round" opacity="0.75">
          <path d="M46 8V4M53.5 12.5l2.8-2.8M56 19h4" />
        </g>
        <circle cx="46" cy="15" r="7" stroke="var(--accent-2)" strokeWidth="1.6" opacity="0.75" />
        <path
          d="M18 34h26a7.5 7.5 0 000-15 10.5 10.5 0 00-20-3A8.5 8.5 0 0018 34z"
          stroke="var(--slate)"
          strokeWidth="1.6"
        />
      </svg>
      <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
        No {label} reports right now
      </div>
      <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 2 }}>
        Clear skies — or try a different filter
      </div>
    </div>
  );
}

// Small floating key explaining marker shapes/colors, bottom-left of the
// map — without it there's no way to tell what a given pin color or shape
// means without clicking every one.
function MapLegend() {
  const [open, setOpen] = useState(false);
  const severities = [
    { key: "clear", label: "Clear" },
    { key: "minor", label: "Minor" },
    { key: "difficult", label: "Difficult" },
    { key: "impassable", label: "Impassable" },
  ];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show map legend"
        title="Map legend"
        className="mm-glass mm-interactive"
        style={{
          position: "absolute",
          left: 10,
          bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          zIndex: 500,
          width: "var(--fab-size, 34px)",
          height: "var(--fab-size, 34px)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
          padding: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5M12 7.5v.5" strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="mm-glass mm-fade-in"
      style={{
        position: "absolute",
        left: 10,
        bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        zIndex: 500,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 11.5,
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        color: "var(--ink)",
      }}
    >
      <button
        onClick={() => setOpen(false)}
        aria-label="Hide legend"
        className="mm-interactive"
        style={{
          position: "absolute",
          top: -9,
          right: -9,
          background: "var(--card-2)",
          border: "1px solid var(--line)",
          borderRadius: "50%",
          width: 20,
          height: 20,
          padding: 0,
          color: "var(--slate)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
        }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
      <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: "var(--slate)", flexShrink: 0 }} />
          Waterlogging
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--slate)", flexShrink: 0 }} />
          Pothole
        </span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {severities.map((s) => (
          <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--slate)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: `var(--${s.key})`, flexShrink: 0 }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Small colored-particle burst, played once at a report's location right
// after a successful submit — a more physical "this landed here"
// confirmation than the toast alone. Rendered as a static (non-interactive)
// divIcon since it's a one-shot animation with no clicks to handle; the
// parent unmounts it shortly after (see the burstRequest effect below).
function makeBurstIcon(severity) {
  const color = severityColor[severity] || "var(--accent)";
  const COUNT = 10;
  const particles = Array.from({ length: COUNT }, (_, i) => {
    const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 24 + Math.random() * 20;
    return {
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      delay: Math.random() * 60,
    };
  });
  const spans = particles
    .map(
      (p) =>
        `<span class="mm-burst-particle" style="background:${color};--mm-tx:${p.tx}px;--mm-ty:${p.ty}px;animation-delay:${p.delay}ms;"></span>`
    )
    .join("");
  return L.divIcon({
    className: DIV_ICON_BASE_CLASS,
    html: `<div style="position:relative;width:0;height:0;pointer-events:none;">${spans}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

// Custom popup card, rendered via react-leaflet's own <Popup> as a
// standalone layer (not attached to a marker), with Leaflet's default
// chrome stripped via the "mm-custom-popup" CSS class (see index.css) so
// our own card design shows instead. This actually improves on the old
// Google OverlayView version: Leaflet's Popup auto-closes on an outside
// map click for free, which OverlayView couldn't do without extra code.
function CustomPopup({ position, onClose, children }) {
  return (
    <Popup
      position={[position.lat, position.lng]}
      className="mm-custom-popup"
      closeButton={false}
      autoPan={false}
      eventHandlers={{ remove: onClose }}
    >
      <div
        className="mm-fade-up"
        style={{
          position: "relative",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          padding: "14px 16px",
          minWidth: 180,
          maxWidth: 230,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="mm-interactive"
          style={{
            position: "absolute",
            top: -9,
            right: -9,
            background: "var(--card-2)",
            border: "1px solid var(--line)",
            borderRadius: "50%",
            width: 22,
            height: 22,
            padding: 0,
            color: "var(--slate)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </Popup>
  );
}

// Full-size photo viewer, shown when a report popup's thumbnail is clicked.
function PhotoLightbox({ url, onClose }) {
  return (
    <div
      onClick={onClose}
      className="mm-fade-in"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1000,
        background: "rgba(5,6,15,0.85)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
        padding: 24,
      }}
    >
      <img
        src={url}
        alt="Reported condition, full size"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          borderRadius: 10,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          cursor: "default",
        }}
      />
      <button
        onClick={onClose}
        aria-label="Close photo"
        className="mm-interactive"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "var(--card-2)",
          border: "1px solid var(--line)",
          borderRadius: "50%",
          width: 34,
          height: 34,
          color: "var(--ink)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// Bridges Leaflet's imperative map instance into React: grabs the live map
// object into mapRef (so buttons/effects outside <MapContainer> can drive
// it), reports zoom changes for clustering, and forwards plain map clicks
// (for "place a new report here" mode). This has to live *inside*
// <MapContainer> since useMap()/useMapEvents() only work in that context —
// there's no prop on <MapContainer> itself for "give me the instance and
// let me listen for clicks."
function MapBridge({ mapRef, onZoomChange, onMapClick }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    onZoomChange(map.getZoom());
  }, [map]);
  // Leaflet only auto-detects real browser window resizes — it has no way
  // to know when its own container changes size for another reason (e.g.
  // the sidebar collapsing/expanding, which changes the map area's width
  // via a CSS transition, not a window resize). Without this, the map
  // keeps rendering at its old size and leaves a blank strip where the
  // container grew.
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
    click: (e) => onMapClick(e),
  });
  return null;
}

export default function MapView({
  reports,
  filterLabel,
  placingMode,
  onPickLocation,
  pendingLoc,
  onUpvote,
  onClear,
  onShare,
  latestReportId,
  focusRequest,
  theme,
  burstRequest,
}) {
  const mapRef = useRef(null);
  const [activeReportId, setActiveReportId] = useState(null);
  const [destination, setDestination] = useState(null); // { position, name }
  const [lightboxUrl, setLightboxUrl] = useState(null);
  // Local, self-clearing copy of burstRequest — the parent just fires a
  // fresh {position, severity, ts} each time a report is submitted; this
  // component owns clearing it after the burst animation finishes so the
  // parent doesn't need its own timer for that.
  const [activeBurst, setActiveBurst] = useState(null);
  useEffect(() => {
    if (!burstRequest) return;
    setActiveBurst(burstRequest);
    const t = setTimeout(() => setActiveBurst(null), 800);
    return () => clearTimeout(t);
  }, [burstRequest]);

  // Self-clearing "tap" ripple shown briefly at wherever a pin was just
  // clicked — set directly by each pin's click handler below, not driven
  // by a prop like activeBurst is.
  const [clickRipple, setClickRipple] = useState(null);
  useEffect(() => {
    if (!clickRipple) return;
    const t = setTimeout(() => setClickRipple(null), 550);
    return () => clearTimeout(t);
  }, [clickRipple]);

  const [zoomLevel, setZoomLevel] = useState(5);

  // Route planning: risk-scores each alternative against the current
  // report list. Uses whatever `reports` this component already received
  // (i.e. respects the active sidebar filter) — a deliberate simplification
  // rather than a bug, but worth knowing: if someone's filtered down to
  // "Potholes only," route risk scoring only sees potholes too.
  const routePlanner = useRoutePlanner(reports);

  // Fit the map to whichever route is currently selected, once routes come
  // back or the selection changes. flyToBounds (not plain fitBounds) so
  // this actually travels there with the same smooth motion as everywhere
  // else in the app, rather than a more abrupt pan/zoom.
  useEffect(() => {
    const map = mapRef.current;
    const route = routePlanner.routes[routePlanner.selectedIndex];
    if (!map || !route || route.path.length === 0) return;
    const bounds = L.latLngBounds(route.path.map((p) => [p.lat, p.lng]));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.fitBounds(bounds, { padding: [60, 60] });
    } else {
      map.flyToBounds(bounds, { padding: [60, 60], duration: 1.4 });
    }
  }, [routePlanner.routes, routePlanner.selectedIndex]);

  const handleMapClick = useCallback(
    (e) => {
      if (placingMode) {
        onPickLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
        return;
      }
      // Marker/pin clicks don't reach this handler (Leaflet stops
      // propagation for marker clicks by default), so this only fires for
      // clicks on open map area — matching the old "close popup on map
      // click" behavior (which Leaflet's Popup now also does on its own).
      setActiveReportId(null);
      setDestination(null);
    },
    [placingMode, onPickLocation]
  );

  const handleDestination = useCallback((position, name) => {
    setDestination({ position, name });
  }, []);

  // Fly to whatever report was targeted (from the sidebar list, for
  // instance), then open its popup once arrived — shared logic between
  // the search bar and direct marker clicks, so all three entry points feel
  // consistent.
  useEffect(() => {
    if (!focusRequest || !mapRef.current) return;
    smoothFlyTo(mapRef.current, focusRequest.position, 15, () => setActiveReportId(focusRequest.id));
  }, [focusRequest]);

  const destinationIcon = useMemo(() => makeDestinationIcon(), []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer
        center={[INDIA_CENTER.lat, INDIA_CENTER.lng]}
        zoom={5}
        minZoom={4}
        zoomControl={false}
        maxBounds={INDIA_MAX_BOUNDS}
        maxBoundsViscosity={0.8}
        style={MAP_CONTAINER_STYLE}
        className={placingMode ? "mm-placing-mode" : ""}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ZoomControl position="bottomright" />
        <MapBridge mapRef={mapRef} onZoomChange={setZoomLevel} onMapClick={handleMapClick} />

        {zoomLevel >= MIN_ZOOM_FOR_PINS &&
          reports.map((r) => {
            const id = r._id || r.id;
            const position = { lat: r.location.lat, lng: r.location.lng };
            return (
              <Marker
                key={id}
                position={[position.lat, position.lng]}
                icon={makePinIcon({ severity: r.severity, type: r.type, dropIn: id === latestReportId })}
                eventHandlers={{
                  click: () => {
                    setClickRipple({ position, ts: Date.now() });
                    if (id === activeReportId) {
                      setActiveReportId(null);
                      return;
                    }
                    const map = mapRef.current;
                    // Only zoom IN if we're currently further out than a
                    // comfortable "reading" zoom — clicking a pin while
                    // already zoomed in close shouldn't zoom back out to 15.
                    const targetZoom = map ? Math.max(map.getZoom() ?? 15, 15) : 15;
                    smoothFlyTo(map, position, targetZoom, () => setActiveReportId(id));
                  },
                }}
              />
            );
          })}

        {reports.map((r) => {
          const id = r._id || r.id;
          if (id !== activeReportId) return null;
          const position = { lat: r.location.lat, lng: r.location.lng };
          return (
            <CustomPopup key={`popup-${id}`} position={position} onClose={() => setActiveReportId(null)}>
              <ReportPopup report={r} onUpvote={onUpvote} onClear={onClear} onShare={onShare} onViewPhoto={setLightboxUrl} />
            </CustomPopup>
          );
        })}

        {pendingLoc && (
          <Marker
            key={`pending-${pendingLoc.lat}-${pendingLoc.lng}`}
            position={[pendingLoc.lat, pendingLoc.lng]}
            icon={makePinIcon({ severity: "minor", type: "waterlogging", dropIn: true })}
          />
        )}

        {activeBurst && (
          <Marker
            key={activeBurst.ts}
            position={[activeBurst.position.lat, activeBurst.position.lng]}
            icon={makeBurstIcon(activeBurst.severity)}
            interactive={false}
          />
        )}

        {clickRipple && (
          <Marker
            key={clickRipple.ts}
            position={[clickRipple.position.lat, clickRipple.position.lng]}
            icon={makeRippleIcon()}
            interactive={false}
          />
        )}

        {destination && (
          <>
            <Marker position={[destination.position.lat, destination.position.lng]} icon={destinationIcon} />
            <CustomPopup position={destination.position} onClose={() => setDestination(null)}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{destination.name}</div>
            </CustomPopup>
          </>
        )}

        {/* Route alternatives: the non-selected ones render thin and dim
            underneath, the selected one bold on top — colored by whichever
            badge it earned (both/neither is possible; safest takes visual
            priority as the more decision-relevant signal). Sorted so the
            selected route draws last (Leaflet layers stack in draw order,
            there's no numeric z-index prop like Google's Polyline had). */}
        {routePlanner.routes
          .map((r, i) => ({ r, i }))
          .sort((a, b) => (a.i === routePlanner.selectedIndex ? 1 : b.i === routePlanner.selectedIndex ? -1 : 0))
          .map(({ r, i }) => {
            const isSelected = i === routePlanner.selectedIndex;
            const color = r.isSafest ? "var(--clear)" : r.isShortest ? "var(--accent)" : "var(--slate)";
            return (
              <Polyline
                key={i}
                positions={r.path.map((p) => [p.lat, p.lng])}
                pathOptions={{
                  color,
                  opacity: isSelected ? 0.95 : 0.35,
                  weight: isSelected ? 5 : 3,
                }}
                eventHandlers={{ click: () => routePlanner.setSelectedIndex(i) }}
              />
            );
          })}
      </MapContainer>

      <SearchBar mapRef={mapRef} onDestination={handleDestination} />
      <RecenterButton mapRef={mapRef} />
      <NearbyHazardCheck reports={reports} mapRef={mapRef} />
      <MapLegend />

      {!routePlanner.panelOpen && (
        <button
          onClick={() => routePlanner.setPanelOpen(true)}
          aria-label="Plan a route"
          title="Plan a route"
          className="mm-interactive"
          style={{
            position: "absolute",
            top: 58,
            left: 10,
            zIndex: 500,
            height: 34,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            boxShadow: "0 4px 14px var(--glow)",
            padding: "0 14px 0 12px",
            border: "none",
            background: "var(--brand)",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="19" r="2.5" />
            <circle cx="18" cy="5" r="2.5" />
            <path d="M8.2 17.8L15 9M15 9h-4M15 9v4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Plan a route
        </button>
      )}
      <RoutePlannerPanel planner={routePlanner} />

      {zoomLevel < MIN_ZOOM_FOR_PINS && reports.length > 0 && (
        <div
          className="mm-glass mm-fade-in"
          style={{
            position: "absolute",
            bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 500,
            borderRadius: 999,
            padding: "7px 16px",
            fontSize: 12,
            color: "var(--slate)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Zoom in to see {reports.length} report{reports.length === 1 ? "" : "s"}
        </div>
      )}
      {reports.length === 0 && filterLabel && <EmptyState label={filterLabel} />}
      {lightboxUrl && <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}