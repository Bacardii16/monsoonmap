import { SEVERITY_COLORS, SEVERITY_LABELS } from "../constants.js";

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// Scrollable list of the currently-filtered reports, newest first. Clicking
// one asks the map to pan/zoom to it and open its popup — gives the sidebar
// a real job to do on a wide desktop layout instead of empty space.
export default function ReportsList({ reports, onSelect, activeId, loading, filterKey }) {
  const sorted = [...reports].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return (
    <div className="mm-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 12px 20px" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--slate)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          padding: "10px 8px 8px",
        }}
      >
        Recent reports
      </div>

      {loading &&
        [0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px" }}>
            <div className="mm-skeleton" style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="mm-skeleton" style={{ width: `${70 - i * 8}%`, height: 13, marginBottom: 6 }} />
              <div className="mm-skeleton" style={{ width: "40%", height: 11 }} />
            </div>
          </div>
        ))}

      {!loading && sorted.length === 0 && (
        <div style={{ padding: "24px 8px", fontSize: 12.5, color: "var(--slate)", textAlign: "center" }}>
          <svg width="46" height="34" viewBox="0 0 64 48" fill="none" style={{ marginBottom: 6, opacity: 0.85 }}>
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
          <div>No reports match this filter yet.</div>
        </div>
      )}

      {sorted.map((r, i) => {
        const id = r._id || r.id;
        const isActive = id === activeId;
        const isPothole = r.type === "pothole";
        return (
          <button
            // Folding filterKey into the key forces every row to remount
            // (rather than React reusing the existing DOM node for a report
            // that stays visible across the filter change) whenever the
            // active filter changes, so the whole visible list replays its
            // staggered fade-in — a crossfade-like transition on filter
            // switch instead of the list just silently snapping to the new
            // set.
            key={`${filterKey}-${id}`}
            onClick={() => onSelect(r)}
            className="mm-list-item mm-fade-up"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              padding: "10px",
              borderRadius: 10,
              border: `1px solid ${isActive ? "var(--accent)" : "var(--line)"}`,
              borderLeft: `3px solid ${SEVERITY_COLORS[r.severity] || "#999"}`,
              background: isActive ? "var(--card-2)" : "rgba(255,255,255,0.02)",
              boxShadow: isActive ? "none" : "0 1px 3px rgba(0,0,0,0.15)",
              cursor: "pointer",
              marginBottom: 6,
              animationDelay: `${Math.min(i, 8) * 30}ms`,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                flexShrink: 0,
                borderRadius: isPothole ? "50%" : "50% 50% 50% 0",
                transform: isPothole ? "none" : "rotate(-45deg)",
                background: SEVERITY_COLORS[r.severity] || "#999",
                border: "1px solid var(--mist)",
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                dir="auto"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.location.areaName || "Unnamed location"}
              </div>
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 1 }}>
                {isPothole ? "🕳️" : "💧"} {SEVERITY_LABELS[r.severity] || r.severity} · {timeAgo(r.createdAt)}
              </div>
            </div>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--slate)"
              strokeWidth="2"
              className="mm-chevron"
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}