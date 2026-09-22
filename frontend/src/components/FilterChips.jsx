import { WATER_SEVERITIES, POTHOLE_SEVERITIES } from "../constants.js";

const TYPES = [
  { key: "all", label: "All" },
  { key: "waterlogging", label: "💧 Water" },
  { key: "pothole", label: "🕳️ Potholes" },
];

function ChipRow({ items, active, onChange, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="mm-filterchips-row"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "0 20px",
        flexShrink: 0,
      }}
    >
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className="mm-chip"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${isActive ? "transparent" : "var(--line)"}`,
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12.5,
              background: isActive ? "var(--brand)" : "linear-gradient(160deg, var(--card-2), var(--card))",
              color: isActive ? "#fff" : "var(--ink)",
              fontWeight: isActive ? 600 : 400,
              whiteSpace: "nowrap",
              cursor: "pointer",
              flexShrink: 0,
              transform: isActive ? "scale(1.04)" : "scale(1)",
              transition: "transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
              boxShadow: isActive
                ? "0 4px 14px var(--glow)"
                : "0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {item.color && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: item.color,
                  flexShrink: 0,
                }}
              />
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export default function FilterChips({ typeFilter, onTypeChange, severityFilter, onSeverityChange }) {
  const severityItems =
    typeFilter === "pothole" ? POTHOLE_SEVERITIES : typeFilter === "waterlogging" ? WATER_SEVERITIES : null;

  return (
    <div className="mm-fade-up" style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10, animationDelay: "60ms" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--slate)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          padding: "0 20px",
        }}
      >
        Filters
      </div>
      <ChipRow items={TYPES} active={typeFilter} onChange={onTypeChange} ariaLabel="Filter by report type" />
      {severityItems && (
        <ChipRow
          items={[{ key: "all", label: "All severities" }, ...severityItems]}
          active={severityFilter}
          onChange={onSeverityChange}
          ariaLabel="Filter by severity"
        />
      )}
    </div>
  );
}