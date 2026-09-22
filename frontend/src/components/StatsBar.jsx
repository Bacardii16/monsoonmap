import { useEffect, useRef, useState } from "react";

const severityRank = { impassable: 4, difficult: 3, minor: 2, clear: 1 };
const severityColor = {
  impassable: "var(--impassable)",
  difficult: "var(--difficult)",
  minor: "var(--minor)",
  clear: "var(--clear)",
};

// Animates a number counting up (or down) toward `target` over ~500ms
// whenever it changes, instead of the digit just jumping — small touch that
// makes the "active reports" count feel alive rather than static text.
function useCountUp(target, durationMs = 500) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out so the count settles rather than stopping abruptly.
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

export default function StatsBar({ reports, loading }) {
  // Pothole severities ("small"/"medium"/etc.) aren't part of this rank
  // scale, so only waterlogging reports are considered for "worst right
  // now" — mixing the two would make the comparison meaningless.
  const waterReports = reports.filter((r) => r.type !== "pothole");
  const potholeCount = reports.filter((r) => r.type === "pothole").length;

  const worst = waterReports.reduce((acc, r) => {
    if (!acc) return r;
    return severityRank[r.severity] > severityRank[acc.severity] ? r : acc;
  }, null);

  // Reports only store lat/lng + a free-text areaName, not a structured
  // city field, so "cities covered" is approximated by snapping each
  // report to a coarse ~55km grid cell (0.5 degrees) and counting distinct
  // cells. Good enough to show meaningful nationwide spread without a
  // schema change or a second geocoding call per report — not a precise
  // city count (two cities within ~55km of each other, like Gurugram and
  // Delhi, will merge into one cell).
  const citiesCovered = new Set(
    reports.map((r) => `${Math.round(r.location.lat / 0.5)}:${Math.round(r.location.lng / 0.5)}`)
  ).size;
  const displayedCities = useCountUp(citiesCovered);

  const cardStyle = {
    position: "relative",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "12px 14px",
    // Outer drop shadow for lift off the sidebar, plus an inset highlight
    // near the top edge (a thin lighter line) for a subtle glass-bevel
    // look, rather than a flat single shadow.
    boxShadow: "0 6px 18px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
    overflow: "hidden",
    minWidth: 0,
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
  };
  const cardBaseGradient = "linear-gradient(160deg, var(--card-2), var(--card))";
  // Cyan top edge marks the informational count card; amber marks the
  // "needs attention" card — a small but genuine use of the two accent
  // colors to separate "FYI" from "heads up" at a glance. Each also gets a
  // soft, blurred color glow blob in its corner (not just the thin top
  // border) so the accent actually reads as light/depth, not just a
  // stripe. Both layers must be in the SAME background property — a
  // separate backgroundImage declared after this would replace the base
  // gradient entirely instead of layering over it (same class of bug as
  // the multi-layer background elsewhere in this file's CSS).
  const infoCardStyle = {
    ...cardStyle,
    borderTop: "2px solid var(--accent)",
    background: `radial-gradient(120px 80px at 100% -20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent), ${cardBaseGradient}`,
  };
  const warnCardStyle = {
    ...cardStyle,
    borderTop: "2px solid var(--accent-2)",
    background: `radial-gradient(120px 80px at 100% -20%, color-mix(in srgb, var(--accent-2) 18%, transparent), transparent), ${cardBaseGradient}`,
  };

  if (loading) {
    return (
      <div
        className="mm-statsbar-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          padding: "16px 20px 14px",
          flexShrink: 0,
        }}
      >
        <div style={infoCardStyle}>
          <div className="mm-skeleton" style={{ width: "60%", height: 11, marginBottom: 8 }} />
          <div className="mm-skeleton" style={{ width: "30%", height: 24 }} />
        </div>
        <div style={warnCardStyle}>
          <div className="mm-skeleton" style={{ width: "70%", height: 11, marginBottom: 10 }} />
          <div className="mm-skeleton" style={{ width: "85%", height: 14 }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="mm-fade-up mm-statsbar-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        padding: "16px 20px 14px",
        flexShrink: 0,
        animationDelay: "30ms",
      }}
    >
      <div className="mm-stat-card" style={infoCardStyle}>
        <div style={{ fontSize: 11, color: "var(--slate)", fontWeight: 500 }}>Cities covered</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>
          {displayedCities}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--slate)", marginTop: 2 }}>
          {reports.length} report{reports.length === 1 ? "" : "s"}
          {potholeCount > 0 ? ` (${potholeCount} pothole${potholeCount === 1 ? "" : "s"})` : ""}
        </div>
      </div>
      <div className="mm-stat-card" style={warnCardStyle}>
        <div style={{ fontSize: 11, color: "var(--slate)", fontWeight: 500 }}>Worst waterlogging</div>
        {worst ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginTop: 6,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: severityColor[worst.severity],
                boxShadow: `0 0 0 3px ${severityColor[worst.severity]}22`,
                flexShrink: 0,
              }}
            />
            <span
              dir="auto"
              style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {worst.location.areaName || "Unnamed area"}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--slate)", marginTop: 6 }}>
            No reports yet
          </div>
        )}
      </div>
    </div>
  );
}