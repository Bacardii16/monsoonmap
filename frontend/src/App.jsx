import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import StatsBar from "./components/StatsBar.jsx";
import FilterChips from "./components/FilterChips.jsx";
import MapView from "./components/MapView.jsx";
import ReportsList from "./components/ReportsList.jsx";
import ReportForm from "./components/ReportForm.jsx";
import GlobeIntro from "./components/GlobeIntro.jsx";
import { fetchReports, createReport, upvoteReport, clearReport, reverseGeocode } from "./api.js";

const INTRO_FADE_MS = 450;
const THEME_STORAGE_KEY = "monsoonmap-theme";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // No saved preference yet — fall back to the OS/browser preference.
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const filterLabels = {
  clear: "clear",
  minor: "minor",
  difficult: "difficult",
  impassable: "impassable",
  small: "small pothole",
  medium: "medium pothole",
  large: "large pothole",
  hazardous: "hazardous pothole",
};

export default function App() {
  const [reports, setReports] = useState([]);
  // True only until the very first fetch resolves (success or failure), so
  // the sidebar can show a loading skeleton instead of briefly flashing
  // "0 active reports" / "No reports match this filter yet" before real
  // data has had a chance to arrive.
  const [reportsLoading, setReportsLoading] = useState(true);
  // typeFilter narrows by report type ("all" | "waterlogging" | "pothole");
  // severityFilter further narrows within that type ("all" or a severity key).
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [placingMode, setPlacingMode] = useState(false);
  const [pendingLoc, setPendingLoc] = useState(null);
  const [pendingAreaName, setPendingAreaName] = useState("");
  const [resolvingArea, setResolvingArea] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [latestReportId, setLatestReportId] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);
  // Set when a sidebar report list item is clicked, so MapView can pan/zoom
  // to it and pop its InfoWindow open. A fresh object each time (even for
  // the same report) so re-clicking the same item still re-triggers it.
  const [focusRequest, setFocusRequest] = useState(null);
  const [burstRequest, setBurstRequest] = useState(null);

  // 'showing' -> globe spins and dives in; 'leaving' -> cross-fading out;
  // 'done' -> unmounted, flat map fully in control. The rest of the app
  // (data fetching, map, etc.) mounts immediately underneath so it's ready
  // the moment the globe finishes its dive.
  const [introPhase, setIntroPhase] = useState("showing");

  function handleGlobeArrive() {
    setIntroPhase("leaving");
    setTimeout(() => setIntroPhase("done"), INTRO_FADE_MS);
  }

  function handleShowGlobe() {
    setIntroPhase("showing");
  }

  useEffect(() => {
    loadReports();
    // Refresh every 60s so the map stays live
    const interval = setInterval(loadReports, 60000);
    return () => clearInterval(interval);
  }, []);

  // Reflect the theme choice on <html> (so plain CSS variables can react to
  // it via the [data-theme="light"] selector) and remember it for next time.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  async function loadReports() {
    try {
      const data = await fetchReports();
      setReports(data);
    } catch (err) {
      console.error("Failed to load reports:", err);
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    if (!latestReportId) return;
    const timeout = setTimeout(() => setLatestReportId(null), 1200);
    return () => clearTimeout(timeout);
  }, [latestReportId]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (severityFilter !== "all" && r.severity !== severityFilter) return false;
      return true;
    });
  }, [reports, typeFilter, severityFilter]);

  function handleTypeFilterChange(next) {
    setTypeFilter(next);
    setSeverityFilter("all");
  }

  const activeFilterLabel =
    severityFilter !== "all"
      ? filterLabels[severityFilter]
      : typeFilter !== "all"
      ? typeFilter === "pothole"
        ? "pothole"
        : "waterlogging"
      : null;

  function handleStartPlacing() {
    setPlacingMode(true);
    setSheetOpen(false);
  }

  function handleClearLocation() {
    setPendingLoc(null);
    setPendingAreaName("");
  }

  async function handlePickLocation(latlng) {
    setPendingLoc(latlng);
    setPendingAreaName("");
    setPlacingMode(false);
    setSheetOpen(true);

    // Auto-fill a human-readable area name via the backend's geocoding
    // proxy. If it's not configured or fails, the report still submits
    // fine without one — this is purely a nice-to-have.
    setResolvingArea(true);
    const areaName = await reverseGeocode(latlng.lat, latlng.lng);
    setPendingAreaName(areaName);
    setResolvingArea(false);
  }

  async function handleSubmit({ type, severity, photo }) {
    if (!pendingLoc) return;
    setSubmitting(true);
    try {
      const created = await createReport({
        lat: pendingLoc.lat,
        lng: pendingLoc.lng,
        type,
        severity,
        areaName: pendingAreaName,
        photoFile: photo,
      });
      await loadReports();
      setLatestReportId(created._id || created.id);
      setBurstRequest({ position: { lat: pendingLoc.lat, lng: pendingLoc.lng }, severity, ts: Date.now() });
      setSheetOpen(false);
      setPendingLoc(null);
      setPendingAreaName("");
      showToast("Report submitted — thanks for helping others");
    } catch (err) {
      console.error(err);
      showToast("Something went wrong. Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpvote(id) {
    try {
      await upvoteReport(id);
      // Update the local copy so the count is right if the popup reopens,
      // without needing a full refetch.
      setReports((prev) =>
        prev.map((r) =>
          (r._id || r.id) === id ? { ...r, upvotes: (r.upvotes || 0) + 1 } : r
        )
      );
    } catch (err) {
      console.error("Failed to upvote report:", err);
    }
  }

  async function handleClear(id) {
    try {
      const result = await clearReport(id);
      if (result.deleted) {
        // Enough people confirmed it — remove it from the map immediately
        // rather than waiting for the next full fetch.
        setReports((prev) => prev.filter((r) => (r._id || r.id) !== id));
        showToast("Marked as cleared — thanks for the update");
      } else {
        setReports((prev) =>
          prev.map((r) => ((r._id || r.id) === id ? { ...r, clearVotes: result.report.clearVotes } : r))
        );
        showToast("Thanks — a few more confirmations and it'll be removed");
      }
    } catch (err) {
      console.error("Failed to mark report as cleared:", err);
      showToast("Something went wrong. Try again.", "error");
    }
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type, ts: Date.now() });
    setTimeout(() => setToast(null), 2600);
  }

  function handleFocusReport(report) {
    const id = report._id || report.id;
    setFocusRequest({
      id,
      position: { lat: report.location.lat, lng: report.location.lng },
      ts: Date.now(),
    });
  }

  async function handleShare(report) {
    const id = report._id || report.id;
    const url = new URL(window.location.href);
    url.searchParams.set("report", id);
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast("Link copied — opens straight to this report");
    } catch (err) {
      console.error("Clipboard write failed:", err);
      showToast("Couldn't copy the link. Try again.", "error");
    }
  }

  // Deep-link support: if the page was opened with ?report=<id> (e.g. from
  // a link someone shared via the popup's share button), jump straight to
  // that report once it shows up in the fetched list. Runs once — guarded
  // by hasHandledDeepLink so switching filters afterward doesn't re-trigger
  // the fly-to on every reports refresh.
  const hasHandledDeepLink = useRef(false);
  useEffect(() => {
    if (hasHandledDeepLink.current || reports.length === 0) return;
    const sharedId = new URLSearchParams(window.location.search).get("report");
    if (!sharedId) {
      hasHandledDeepLink.current = true;
      return;
    }
    const match = reports.find((r) => (r._id || r.id) === sharedId);
    if (match) {
      handleFocusReport(match);
      hasHandledDeepLink.current = true;
    }
  }, [reports]);

  return (
    <div className="mm-layout">
      {introPhase !== "done" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1200,
            opacity: introPhase === "leaving" ? 0 : 1,
            transition: `opacity ${INTRO_FADE_MS}ms ease`,
            pointerEvents: introPhase === "leaving" ? "none" : "auto",
          }}
        >
          <GlobeIntro onArrive={handleGlobeArrive} theme={theme} />
        </div>
      )}

      <aside className={`mm-sidebar${sidebarCollapsed ? " mm-sidebar-collapsed" : ""}`}>
        <Header
          reportCount={reports.length}
          onShowGlobe={handleShowGlobe}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <StatsBar reports={reports} loading={reportsLoading} />
        <FilterChips
          typeFilter={typeFilter}
          onTypeChange={handleTypeFilterChange}
          severityFilter={severityFilter}
          onSeverityChange={setSeverityFilter}
        />

        <div style={{ padding: "14px 20px 6px" }}>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Report waterlogging or a pothole"
            className="mm-interactive mm-sheen-cta"
            style={{
              width: "100%",
              background: "linear-gradient(135deg, var(--brand), var(--accent-2))",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: 14.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              boxShadow: "0 8px 22px var(--glow)",
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Report an issue
          </button>
        </div>

        {/* Fading divider — a plain border here looked like a stray line;
            fading it out at both ends reads as a soft section break instead. */}
        <div
          style={{
            height: 1,
            margin: "8px 20px 0",
            background: "linear-gradient(90deg, transparent, var(--line) 20%, var(--line) 80%, transparent)",
          }}
        />

        <ReportsList
          reports={filteredReports}
          onSelect={handleFocusReport}
          activeId={focusRequest?.id}
          loading={reportsLoading}
          filterKey={`${typeFilter}:${severityFilter}`}
        />
      </aside>

      <button
        onClick={() => setSidebarCollapsed((c) => !c)}
        aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        className={`mm-glass mm-interactive mm-sidebar-toggle${sidebarCollapsed ? " mm-collapsed" : ""}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.4"
          style={{ transform: sidebarCollapsed ? "rotate(180deg)" : "none", transition: "transform 0.3s ease" }}
        >
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="mm-map-area">
        <MapView
          reports={filteredReports}
          filterLabel={activeFilterLabel}
          placingMode={placingMode}
          onPickLocation={handlePickLocation}
          pendingLoc={pendingLoc}
          onUpvote={handleUpvote}
          onClear={handleClear}
          onShare={handleShare}
          latestReportId={latestReportId}
          focusRequest={focusRequest}
          theme={theme}
          burstRequest={burstRequest}
        />

        {placingMode && (
          <div
            style={{
              position: "absolute",
              top: 64,
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--brand)",
              color: "#fff",
              padding: "9px 16px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              zIndex: 600,
              boxShadow: "0 6px 18px var(--glow)",
              whiteSpace: "nowrap",
            }}
          >
            Click the map to drop a pin
          </div>
        )}
      </div>

      <ReportForm
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        pendingLoc={pendingLoc}
        pendingAreaName={pendingAreaName}
        resolvingArea={resolvingArea}
        onStartPlacing={handleStartPlacing}
        onClearLocation={handleClearLocation}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: `translateX(-50%) translateY(${toast ? 0 : 20}px)`,
          background:
            toast?.type === "error"
              ? "linear-gradient(135deg, #ff7a7a, var(--impassable))"
              // Deliberately NOT var(--brand) here — brand is crimson in
              // this palette, which would make "success" and "error" both
              // read as red. --clear (the "clear/no issue" severity green)
              // already means "good" elsewhere in this app, so reusing it
              // keeps the success toast unambiguous.
              : "linear-gradient(135deg, #6ee7b7, var(--clear))",
          color: toast?.type === "error" ? "#2a0d0d" : "#062e1d",
          padding: "12px 20px",
          borderRadius: 10,
          fontSize: 13.5,
          fontWeight: 500,
          zIndex: 1000,
          opacity: toast ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity .25s ease, transform .25s ease",
          whiteSpace: "nowrap",
          boxShadow:
            toast?.type === "error" ? "0 8px 22px rgba(255,92,92,0.35)" : "0 8px 22px rgba(62,213,152,0.35)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflow: "hidden",
        }}
      >
        {toast?.type === "error" ? (
          <svg
            key={`error-${toast?.ts}`}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            style={{ flexShrink: 0 }}
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              className="mm-draw-in"
              style={{ strokeDasharray: 57, strokeDashoffset: 57 }}
            />
            <path
              d="M12 8v5M12 16h.01"
              strokeLinecap="round"
              className="mm-draw-in"
              style={{ strokeDasharray: 9, strokeDashoffset: 9, animationDelay: "0.3s" }}
            />
          </svg>
        ) : (
          <svg
            key={`success-${toast?.ts}`}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M20 6L9 17l-5-5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mm-draw-in"
              style={{ strokeDasharray: 24, strokeDashoffset: 24 }}
            />
          </svg>
        )}
        {toast?.msg}
        {toast && (
          <div
            key={toast.ts}
            className="mm-toast-drain"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              bottom: 4,
              height: 2,
              borderRadius: 2,
              background: "currentColor",
              opacity: 0.35,
              transformOrigin: "left",
            }}
          />
        )}
      </div>
    </div>
  );
}