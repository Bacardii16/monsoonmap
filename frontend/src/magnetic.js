// A small "magnetic" pull effect for buttons — as the cursor moves near a
// button, it nudges slightly toward it, snapping back on mouse leave.
// Implemented imperatively (direct DOM style writes via the event's
// currentTarget) rather than React state, since mousemove fires far too
// often to re-render on — this keeps it cheap regardless of how many
// magnetic buttons are on screen at once.
//
// Skipped entirely on touch devices (no cursor to react to).
const supportsHover =
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// Whether cursor-reactive effects (this file's magnetic pull and tilt, the
// cursor sparkle trail) should run at all — false only on touch devices,
// which have no cursor to react to in the first place. Deliberately not
// gated on prefers-reduced-motion — unlike this app's larger-scale motion
// (camera flights, the globe intro), these are small, localized effects
// the person building this app wants shown regardless of that setting.
export const cursorEffectsEnabled = supportsHover;

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

// A subtle 3D tilt — the element rotates a few degrees in 3D as the
// cursor moves across it, as if catching light. `maxDeg` caps how far it
// can tilt; kept small (a handful of degrees) so it reads as a gentle
// reactive sheen rather than a cartoonish flip. Like magneticHandlers,
// writes directly to the DOM node rather than React state, and no-ops
// entirely without a fine pointer (touch devices).
export function tiltHandlers(maxDeg = 6) {
  if (!cursorEffectsEnabled) return {};

  return {
    onMouseMove: (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width - 0.5;
      const relY = (e.clientY - rect.top) / rect.height - 0.5;
      e.currentTarget.style.transform = `perspective(500px) rotateX(${-relY * maxDeg}deg) rotateY(${relX * maxDeg}deg)`;
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.transform = "";
    },
  };
}