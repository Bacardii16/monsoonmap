import { useEffect, useRef, useState } from "react";

export const TOUR_STORAGE_KEY = "monsoonmap-tour-seen";

// Each step either targets a real element on screen (via CSS selector —
// simplest way to reach into MapView/StatsBar/etc. without threading refs
// through every component just for this) or has selector:null for a
// plain centered card (the welcome/closing steps). needsSidebar marks
// steps whose target lives inside the sidebar, which is an off-canvas
// drawer closed by default on mobile — the tour opens it before measuring
// that step's target position.
const TOUR_STEPS = [
  {
    id: "welcome",
    selector: null,
    title: "New here? Quick tour",
    body: "A minute-long walkthrough of what you can do on MonsoonMap. Skip anytime — this only shows once.",
  },
  {
    id: "stats",
    selector: ".mm-statsbar-grid",
    needsSidebar: true,
    title: "Live stats at a glance",
    body: "See how many cities are covered right now and which area currently has the worst waterlogging.",
  },
  {
    id: "filters",
    selector: ".mm-filterchips-row",
    needsSidebar: true,
    title: "Filter what you see",
    body: "Narrow the map down to just waterlogging or just potholes, or by severity, so it's not cluttered with everything at once.",
  },
  {
    id: "report",
    selector: ".mm-sheen-cta",
    needsSidebar: true,
    title: "Report something",
    body: "Spotted flooding or a pothole? Tap here, drop a pin on the map, and submit — takes about 10 seconds.",
  },
  {
    id: "search",
    selector: ".mm-searchbar-wrap",
    title: "Search anywhere",
    body: "Type a road, area, or city to jump straight there instead of scrolling around the map.",
  },
  {
    id: "route",
    selector: '[aria-label="Plan a route"]',
    title: "Plan a safer route",
    body: "Get directions that favor roads with fewer reported hazards, not just the shortest path.",
  },
  {
    id: "hazard",
    selector: '[aria-label="Check for hazards near my current location"]',
    title: "Check hazards near you",
    body: "Uses your location to warn you if there's a severe report close by right now.",
  },
  {
    id: "legend",
    selector: '[aria-label="Show map legend"]',
    title: "What the pins mean",
    body: "Tap this anytime to see what each marker color and shape stands for.",
  },
  {
    id: "done",
    selector: null,
    title: "That's the tour",
    body: "You can replay this anytime from the compass icon in the header.",
  },
];

// Recomputes on resize/scroll while a step is active, rather than once,
// since the sidebar can collapse/expand or the window can resize mid-tour.
function useTargetRect(selector, dependsOnSidebar) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    function measure() {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    }

    // A short delay when the target lives in the sidebar drawer, so the
    // 0.3s open transition has time to finish before measuring its final
    // position — measuring mid-transition would spotlight the wrong spot.
    const delay = dependsOnSidebar ? 350 : 30;
    const t = setTimeout(measure, delay);

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector]);

  return rect;
}

export default function TourGuide({ active, onClose, onOpenSidebar, onCloseSidebar }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = TOUR_STEPS[stepIndex];
  const rect = useTargetRect(active ? step.selector : null, step.needsSidebar);
  const cardRef = useRef(null);

  // Reset to the first step each time the tour is (re)opened, and open the
  // sidebar right away if the very first real step needs it — otherwise
  // there'd be a visible jump cut on step 2.
  useEffect(() => {
    if (!active) return;
    setStepIndex(0);
  }, [active]);

  // Sidebar steps open the drawer; on a phone-width screen the drawer
  // covers most of the map, so steps that point at map controls close it
  // again first. On desktop the sidebar is a normal in-flow panel that
  // should stay put, so this only ever closes it below the mobile
  // breakpoint.
  useEffect(() => {
    if (!active) return;
    if (step.needsSidebar) onOpenSidebar?.();
    else if (window.matchMedia("(max-width: 860px)").matches) onCloseSidebar?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  if (!active) return null;

  function finish() {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // Private browsing / storage disabled — the tour just replays next
      // visit instead of persisting, which is a fine fallback.
    }
    // Leave a phone in its default state (full-screen map, drawer closed)
    // if the tour ends or is skipped while the drawer is still open.
    if (window.matchMedia("(max-width: 860px)").matches) onCloseSidebar?.();
    onClose();
  }

  function next() {
    if (stepIndex === TOUR_STEPS.length - 1) finish();
    else setStepIndex((i) => i + 1);
  }
  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  const PAD = 8;
  const hasTarget = !!rect;

  // Tooltip placement: below the target if there's room, else above;
  // horizontally centered on the target but clamped so it never runs off
  // either edge of the screen.
  let cardStyle = { position: "fixed", zIndex: 3001, width: "min(300px, 88vw)" };
  if (hasTarget) {
    const spaceBelow = window.innerHeight - rect.bottom;
    const cardHeight = cardRef.current?.offsetHeight || 160;
    const placeBelow = spaceBelow > cardHeight + 24 || spaceBelow > rect.top;
    const top = placeBelow ? rect.bottom + PAD + 8 : Math.max(12, rect.top - cardHeight - PAD - 8);
    const idealLeft = rect.left + rect.width / 2 - 150;
    const left = Math.min(Math.max(12, idealLeft), window.innerWidth - 300 - 12);
    cardStyle = { ...cardStyle, top, left };
  } else {
    cardStyle = { ...cardStyle, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  return (
    <div aria-live="polite" role="dialog" aria-label="App tour">
      {hasTarget ? (
        <>
          {/* Four panes framing the target instead of one dark sheet with a
              CSS-masked hole — real DOM gaps rather than a visual-only cutout,
              so clicks inside the spotlight reach the actual element
              underneath (letting someone try the highlighted control live)
              while clicks anywhere else are caught here and do nothing,
              keeping attention on the tour instead of the rest of the app. */}
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD), background: "rgba(5,6,15,0.72)", zIndex: 3000 }} />
          <div style={{ position: "fixed", top: rect.bottom + PAD, left: 0, right: 0, bottom: 0, background: "rgba(5,6,15,0.72)", zIndex: 3000 }} />
          <div style={{ position: "fixed", top: Math.max(0, rect.top - PAD), left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2, background: "rgba(5,6,15,0.72)", zIndex: 3000 }} />
          <div style={{ position: "fixed", top: Math.max(0, rect.top - PAD), left: rect.right + PAD, right: 0, height: rect.height + PAD * 2, background: "rgba(5,6,15,0.72)", zIndex: 3000 }} />
          {/* Glowing ring around the spotlight itself — purely decorative,
              pointer-events:none so it never intercepts the click that's
              meant to reach the real element inside it. */}
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              borderRadius: 10,
              boxShadow: "0 0 0 2px var(--accent), 0 0 18px var(--glow)",
              zIndex: 3000,
              pointerEvents: "none",
              transition: "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
            }}
          />
        </>
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(5,6,15,0.72)", zIndex: 3000 }} />
      )}

      <div
        ref={cardRef}
        className="mm-glass mm-fade-in"
        style={{
          ...cardStyle,
          borderRadius: 14,
          padding: "16px 18px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontFamily: "'Newsreader', serif", fontSize: 16.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.5, marginBottom: 14 }}>{step.body}</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: i === stepIndex ? "var(--accent)" : "var(--line)",
                  transition: "background 0.2s ease",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {stepIndex > 0 && (
              <button
                onClick={back}
                className="mm-interactive"
                style={{
                  background: "none",
                  border: "1px solid var(--line)",
                  color: "var(--ink)",
                  borderRadius: 7,
                  padding: "6px 12px",
                  fontSize: 12.5,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={finish}
              className="mm-interactive"
              style={{
                background: "none",
                border: "none",
                color: "var(--slate)",
                fontSize: 12.5,
                cursor: "pointer",
                padding: "6px 4px",
              }}
            >
              Skip
            </button>
            <button
              onClick={next}
              className="mm-interactive"
              style={{
                background: "var(--brand)",
                border: "none",
                color: "#fff",
                borderRadius: 7,
                padding: "6px 14px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {stepIndex === TOUR_STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}