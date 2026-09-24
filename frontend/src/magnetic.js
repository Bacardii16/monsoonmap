// A small "magnetic" pull effect for buttons — as the cursor moves near a
// button, it nudges slightly toward it, snapping back on mouse leave.
// Implemented imperatively (direct DOM style writes via the event's
// currentTarget) rather than React state, since mousemove fires far too
// often to re-render on — this keeps it cheap regardless of how many
// magnetic buttons are on screen at once.
//
// Skipped entirely on touch devices (no cursor to react to) and under
// prefers-reduced-motion, both checked once via matchMedia rather than on
// every move event.
const supportsHover =
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Whether cursor-reactive effects (this file's magnetic pull, the cursor
// glow trail, the globe intro's parallax) should run at all — false on
// touch devices (no cursor to react to) and under prefers-reduced-motion.
export const cursorEffectsEnabled = supportsHover && !reducedMotion;

// `strength` controls how far the button can travel toward the cursor, in
// pixels, at most — kept small (a handful of px) so it reads as a subtle
// pull rather than the button visibly chasing the mouse around.
export function magneticHandlers(strength = 10) {
  if (!cursorEffectsEnabled) return {};

  return {
    onMouseMove: (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const relY = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      e.currentTarget.style.transform = `translate(${relX * strength}px, ${relY * strength}px)`;
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.transform = "";
    },
  };
}