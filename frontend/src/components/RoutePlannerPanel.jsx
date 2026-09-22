// Floating panel UI for route planning — pure presentation, all state and
// logic lives in the useRoutePlanner hook (routePlanning.js). Renders as a
// sibling of the map (not inside <GoogleMap>), same pattern as the search
// bar and legend.

function formatDistance(meters) {
  const km = meters / 1000;
  return km < 1 ? `${Math.round(meters)} m` : `${km.toFixed(1)} km`;
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`;
}

const riskColor = { Low: "var(--clear)", Moderate: "var(--minor)", High: "var(--impassable)" };

function PlaceInput({ label, query, onChange, matches, onSelect, placeholder }) {
  return (
    <div style={{ position: "relative" }}>
      <label style={{ fontSize: 10.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: "100%",
          marginTop: 3,
          background: "var(--card-2)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 12.5,
          color: "var(--ink)",
        }}
      />
      {matches.length > 0 && (
        <div
          className="mm-glass mm-fade-in-down"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
            marginTop: 4,
            borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
          }}
        >
          {matches.map((p, i) => (
            <button
              key={i}
              onClick={() => onSelect(p)}
              className="mm-list-item"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                fontSize: 12,
                color: "var(--ink)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoutePlannerPanel({ planner }) {
  const {
    panelOpen,
    setPanelOpen,
    fromQuery,
    setFromQuery,
    toQuery,
    setToQuery,
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
  } = planner;

  if (!panelOpen) return null;

  return (
    <div
      className="mm-glass mm-fade-in-down"
      style={{
        position: "absolute",
        top: 58,
        left: 10,
        width: 280,
        zIndex: 500,
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Plan a route</div>
        <button
          onClick={() => {
            setPanelOpen(false);
            reset();
          }}
          aria-label="Close route planner"
          className="mm-interactive"
          style={{
            background: "var(--card-2)",
            border: "none",
            borderRadius: "50%",
            width: 20,
            height: 20,
            color: "var(--slate)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <PlaceInput
          label="From"
          query={fromQuery}
          onChange={setFromQuery}
          matches={fromMatches}
          onSelect={selectFrom}
          placeholder="Starting point"
        />
        <PlaceInput
          label="To"
          query={toQuery}
          onChange={setToQuery}
          matches={toMatches}
          onSelect={selectTo}
          placeholder="Destination"
        />

        <button
          onClick={findRoutes}
          disabled={loading}
          className="mm-interactive"
          style={{
            width: "100%",
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Finding routes…" : "Find safest route"}
        </button>

        {error && <div style={{ fontSize: 11.5, color: "var(--impassable)" }}>{error}</div>}

        {routes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
            {routes.map((r, i) => {
              const label = riskLabel(r.score);
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  className="mm-interactive"
                  style={{
                    textAlign: "left",
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--line)"}`,
                    background: isSelected ? "var(--card-2)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    {r.isSafest && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--clear)",
                          border: "1px solid var(--clear)",
                          borderRadius: 4,
                          padding: "1px 5px",
                        }}
                      >
                        SAFEST
                      </span>
                    )}
                    {r.isShortest && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--accent)",
                          border: "1px solid var(--accent)",
                          borderRadius: 4,
                          padding: "1px 5px",
                        }}
                      >
                        SHORTEST
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink)" }}>
                    {formatDistance(r.distanceMeters)} · {formatDuration(r.durationSeconds)}
                  </div>
                  <div style={{ fontSize: 11, color: riskColor[label], marginTop: 2 }}>
                    Risk: {label} ({r.score}){r.nearby.length > 0 ? ` · passes ${r.nearby.length} hazard${r.nearby.length === 1 ? "" : "s"}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
