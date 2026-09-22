import { useEffect, useState } from "react";
import { WATER_SEVERITIES, POTHOLE_SEVERITIES } from "../constants.js";

const reportTypes = [
  { key: "waterlogging", label: "Waterlogging", icon: "💧" },
  { key: "pothole", label: "Pothole", icon: "🕳️" },
];

// Small filled checkmark badge shown on whichever type/severity card is
// currently selected — positioned top-right corner, pops in via the
// mm-check-pop animation (see index.css) rather than just appearing.
const checkBadgeStyle = {
  position: "absolute",
  top: -6,
  right: -6,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "var(--accent)",
  border: "2px solid var(--card)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export default function ReportForm({
  open,
  onClose,
  pendingLoc,
  pendingAreaName,
  resolvingArea,
  onStartPlacing,
  onClearLocation,
  onSubmit,
  submitting,
  justSubmitted,
}) {
  const [type, setType] = useState("waterlogging");
  const [severity, setSeverity] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);

  // Object URLs are only good until revoked — build a fresh one whenever
  // the selected file changes, and revoke the previous one so they don't
  // pile up in memory across several photo picks in one session.
  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const severities = type === "pothole" ? POTHOLE_SEVERITIES : WATER_SEVERITIES;
  const ready = pendingLoc && severity;
  // Specific enough to actually act on, rather than a generic "fill out
  // the form" — tells you exactly which of the two required things is
  // still missing (or both).
  const missingReason =
    !pendingLoc && !severity
      ? "Pick a location and severity to continue"
      : !pendingLoc
      ? "Pick a location on the map to continue"
      : !severity
      ? "Pick a severity to continue"
      : null;

  function handleTypeChange(nextType) {
    setType(nextType);
    // Severity scales are disjoint between types, so a previously picked
    // severity is never valid for the other type — clear it.
    setSeverity(null);
  }

  function handleSubmit() {
    if (!ready) return;
    onSubmit({ type, severity, photo });
    setType("waterlogging");
    setSeverity(null);
    setPhoto(null);
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(6,14,13,0.6)",
          backdropFilter: "blur(2px)",
          zIndex: 900,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .25s ease",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          width: "min(460px, 92vw)",
          background: "linear-gradient(180deg, var(--card-2) 0%, var(--card) 12%)",
          border: "1px solid var(--line)",
          borderTop: "2px solid var(--accent)",
          borderRadius: 18,
          zIndex: 950,
          transform: open ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -48%) scale(0.96)",
          opacity: open ? 1 : 0,
          transition: "transform .22s cubic-bezier(.32,.72,0,1), opacity .2s ease",
          pointerEvents: open ? "auto" : "none",
          maxHeight: "86vh",
          overflowY: "auto",
          padding: "20px 22px 24px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.16)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close report form"
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            background: "var(--mist)",
            border: "none",
            borderRadius: "50%",
            width: 30,
            height: 30,
            color: "var(--slate)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>

        {justSubmitted && (
          <div
            className="mm-fade-in"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 18,
              background: "linear-gradient(180deg, var(--card-2) 0%, var(--card) 12%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              zIndex: 10,
            }}
          >
            <div
              className="mm-check-pop"
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--brand)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 22px var(--glow)",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontFamily: "'Newsreader', serif", fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>
              Report submitted
            </div>
          </div>
        )}
        <h2 style={{ fontFamily: "'Newsreader', serif", fontSize: 19, margin: "0 12px 4px 0" }}>
          {type === "pothole" ? "Report a pothole" : "Report waterlogging"}
        </h2>
        <p style={{ fontSize: 13, color: "var(--slate)", margin: "0 0 18px" }}>
          {type === "pothole"
            ? "Flag damaged road surface so others can avoid or fix it."
            : "Takes about 10 seconds. Helps someone avoid a flooded road right now."}
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>
            What are you reporting?
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {reportTypes.map((t) => (
              <div
                key={t.key}
                onClick={() => handleTypeChange(t.key)}
                onKeyDown={(e) => e.key === "Enter" && handleTypeChange(t.key)}
                role="radio"
                aria-checked={type === t.key}
                tabIndex={0}
                className="mm-select-card"
                style={{
                  position: "relative",
                  border: `1.5px solid ${type === t.key ? "var(--accent)" : "var(--line)"}`,
                  background: type === t.key ? "var(--card-2)" : "var(--card)",
                  boxShadow: type === t.key ? "0 0 0 3px rgba(59,130,246,0.24)" : "none",
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
                  transform: type === t.key ? "scale(1.02)" : "scale(1)",
                }}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
                {type === t.key && (
                  <span aria-hidden="true" className="mm-check-pop" style={checkBadgeStyle}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>
            Location
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onStartPlacing}
              aria-label={pendingLoc ? "Change pin location" : "Tap on the map to place a pin"}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                background: "var(--mist)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "12px 13px",
                fontSize: 14,
                color: pendingLoc ? "var(--ink)" : "var(--slate)",
                fontWeight: pendingLoc ? 500 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M12 21s7-6.4 7-12a7 7 0 10-14 0c0 5.6 7 12 7 12z" />
                <circle cx="12" cy="9" r="2.3" />
              </svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pendingLoc ? (
                  resolvingArea ? (
                    "Locating area name…"
                  ) : pendingAreaName ? (
                    pendingAreaName
                  ) : (
                    `Pin placed at ${pendingLoc.lat.toFixed(4)}, ${pendingLoc.lng.toFixed(4)}`
                  )
                ) : (
                  "Tap on the map to place a pin"
                )}
              </span>
            </button>
            {pendingLoc && onClearLocation && (
              <button
                onClick={onClearLocation}
                aria-label="Clear pin location"
                title="Clear location"
                className="mm-interactive"
                style={{
                  flexShrink: 0,
                  width: 42,
                  background: "var(--mist)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  color: "var(--slate)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>
            {type === "pothole" ? "Pothole size" : "Water level"}
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {severities.map((s) => (
              <div
                key={s.key}
                onClick={() => setSeverity(s.key)}
                onKeyDown={(e) => e.key === "Enter" && setSeverity(s.key)}
                role="radio"
                aria-checked={severity === s.key}
                tabIndex={0}
                className="mm-select-card"
                style={{
                  position: "relative",
                  border: `1.5px solid ${severity === s.key ? "var(--accent)" : "var(--line)"}`,
                  background: severity === s.key ? "var(--card-2)" : "var(--card)",
                  boxShadow: severity === s.key ? "0 0 0 3px rgba(59,130,246,0.24)" : "none",
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
                  transform: severity === s.key ? "scale(1.02)" : "scale(1)",
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color }} />
                {s.label}
                {severity === s.key && (
                  <span aria-hidden="true" className="mm-check-pop" style={checkBadgeStyle}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>
            Photo (optional)
          </label>
          {photo ? (
            <div
              className="mm-pop-once"
              style={{
                position: "relative",
                border: "1.5px solid var(--accent)",
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--card-2)",
              }}
            >
              <img
                src={photoPreviewUrl}
                alt="Selected photo preview"
                style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 10px",
                  fontSize: 11.5,
                  color: "var(--slate)",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {photo.name}
                </span>
                <button
                  onClick={() => setPhoto(null)}
                  aria-label="Remove photo"
                  className="mm-interactive"
                  style={{
                    flexShrink: 0,
                    background: "none",
                    border: "none",
                    color: "var(--slate)",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <label
              className="mm-dropzone"
              style={{
                border: "1.5px dashed var(--line)",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
                fontSize: 13,
                color: "var(--slate)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: "transparent",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
                <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
                <circle cx="12" cy="14" r="3.4" />
              </svg>
              Add a photo
              <input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files[0])} />
            </label>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!ready || submitting}
          style={{
            width: "100%",
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: 14,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 15,
            cursor: ready && !submitting ? "pointer" : "not-allowed",
            opacity: ready ? 1 : 0.4,
            boxShadow: ready && !submitting ? "0 8px 22px var(--glow)" : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {submitting && (
            <svg
              className="mm-spinner"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
            >
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? "Submitting…" : "Submit report"}
        </button>
        {missingReason && !submitting && (
          <div style={{ fontSize: 11.5, color: "var(--slate)", textAlign: "center", marginTop: 8 }}>
            {missingReason}
          </div>
        )}
      </div>
    </>
  );
}