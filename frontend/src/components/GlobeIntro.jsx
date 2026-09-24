import { useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import { INDIA_LAT, INDIA_LNG } from "../constants.js";

const SPIN_MS = 1500; // free-spin in open space before the dive
const DIVE_MS = 2300; // camera swoop down into India
const SETTLE_MS = 260; // brief overshoot-and-settle leg at the end of the dive
const HOLD_MS = 150; // brief pause at the destination before handing off
// The dive swoops in slightly closer than the final resting altitude, then
// eases back out to it — a small overshoot-and-settle rather than stopping
// dead, which reads as a more physical, weighted landing.
const OVERSHOOT_ALTITUDE = 0.62;
const SETTLE_ALTITUDE = 0.8;

// One of these is picked at random each time the intro mounts (i.e. each
// page load/refresh — GlobeIntro only ever mounts once per visit), so the
// atmosphere glow (title text, India marker, breathing halo) rotate through
// the three palette colors across visits rather than always being the same.
const ATMOSPHERE_COLORS = ["#3b82f6", "#ff3b3b", "#ffffff"];

// Both bundled as example assets in the three-globe package (same CDN
// pattern already used for the earth/topology textures below).
const STARFIELD_URL = "https://unpkg.com/three-globe/example/img/night-sky.png";
// Always the daytime "blue marble" texture, regardless of theme — night-
// lights was tried and reverted; keeping only this one now.
const EARTH_URL = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const BUMP_URL = "https://unpkg.com/three-globe/example/img/earth-topology.png";
// jsdelivr, not unpkg, for this one specifically: unpkg's redirect for
// this pinned-version asset doesn't send an Access-Control-Allow-Origin
// header, which silently blocked the texture load in every browser. On
// top of that, the path itself was wrong — clouds.png lives in this
// package's example/clouds/ folder, a different location from the
// earth/bump textures above (example/img/), unlike what the file naming
// pattern suggests.
const CLOUDS_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/clouds/clouds.png";
const CLOUDS_ALTITUDE = 0.02;
const CLOUDS_ROTATE_DEG_PER_FRAME = -0.006;
const RAIN_DROP_COUNT = 42;
const RAIN_MS = 1100;
// Public GeoJSON source for India's border outline (mainland ring only —
// small island territories are skipped for simplicity). This is a fetch to
// a third-party CDN, so it's treated as purely decorative everywhere it's
// used below: a failed/slow load never blocks the loading veil or any
// other part of the intro, it just means the trace-in doesn't appear.
const INDIA_BORDER_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries/IND.geo.json";
const BORDER_TRACE_MS = 900;

// Same lat/lng-to-3D-point convention three-globe uses internally for its
// own surface features, so the border line lines up with the actual
// coastline in the earth texture rather than floating off at an angle.
function latLngToVector3(lat, lng, radius) {
  // This must match three-globe's own internal polar2Cartesian convention
  // exactly, or a surface line ends up rotated/mirrored relative to the
  // actual texture-mapped globe (which is exactly what happened with the
  // previous version of this formula — wrong longitude term and a sign
  // flip on X).
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (90 - lng) * (Math.PI / 180);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Full-screen real 3D globe (three.js/WebGL, via react-globe.gl) that
 * auto-rotates in open space for a beat, then dives the camera down to
 * India — the "spinning Earth, then arrive" open familiar from Google
 * Earth. Calls onArrive() once the dive completes so the caller can swap
 * in the real flat map underneath.
 */
// Reveals `text` one character at a time while `active` is true, resetting
// to empty when it becomes inactive (so re-activating replays it from the
// start rather than resuming mid-word). Falls back to showing the full
// text instantly when prefersReducedMotion is true, matching how the rest
// of this component treats reduced motion — the words themselves aren't
// "motion" in the sense that matters here, but revealing them via a timed
// animation is.
function Typewriter({ text, active, speed = 28, reducedMotion }) {
  const [count, setCount] = useState(reducedMotion ? text.length : 0);

  useEffect(() => {
    if (reducedMotion) {
      setCount(text.length);
      return;
    }
    if (!active) {
      setCount(0);
      return;
    }
    let i = 0;
    setCount(0);
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [active, text, speed, reducedMotion]);

  return <>{text.slice(0, count)}</>;
}

export default function GlobeIntro({ onArrive, theme }) {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const parallaxRef = useRef(null);
  const arrivedRef = useRef(false);
  // Raw [lng, lat] ring for India's border, populated once (if ever) by the
  // fetch effect below. Read by the scene-setup effect's animation loop,
  // which lazily builds the actual THREE.Line the first time it notices
  // this has data — decoupling "fetch finished" from "scene is ready" since
  // either can happen first.
  const borderCoordsRef = useRef(null);
  const [size, setSize] = useState({ width: 360, height: 640 });
  const [skipped, setSkipped] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  // Set once the globe texture has actually rendered a frame (rather than
  // just onGlobeReady, which fires once the WebGL context/controls exist —
  // there's a brief gap where the sphere is still visibly blank/untextured
  // otherwise). Approximated with a short timer after globeReady since
  // react-globe.gl doesn't expose a "first frame painted" callback.
  const [textureSettled, setTextureSettled] = useState(false);
  // Real load-completion signal for the one texture we load ourselves
  // (clouds) — combined with globeReady (react-globe.gl's own signal for
  // its internal textures) below, this replaces an earlier flat 250ms
  // guess with something driven by actual events rather than a timer.
  // (True byte-level progress for the globe's own earth/bump textures
  // isn't exposed by react-globe.gl, so this is the most accurate signal
  // available to us, not a fully precise progress bar.)
  const [cloudsLoaded, setCloudsLoaded] = useState(false);
  const [showMarker, setShowMarker] = useState(false);
  const [showRain, setShowRain] = useState(false);
  const [showShootingStar, setShowShootingStar] = useState(false);
  // 'spin' | 'dive' | 'arrived' — drives the caption text below the title.
  const [phase, setPhase] = useState("spin");
  // useState initializers run once on mount, so these are stable for the
  // life of the component but re-roll on the next full mount (refresh) —
  // both the accent color and the starting longitude, so no two visits
  // look quite the same.
  const [atmosphereColor] = useState(
    () => ATMOSPHERE_COLORS[Math.floor(Math.random() * ATMOSPHERE_COLORS.length)]
  );
  const [startLng] = useState(() => Math.random() * 360 - 180);
  // Pre-generated once per mount rather than regenerated on every render —
  // each drop's horizontal position, timing, and length are randomized so
  // the rain doesn't look like an obviously repeating pattern.
  const [rainDrops] = useState(() =>
    Array.from({ length: RAIN_DROP_COUNT }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 300,
      duration: 650 + Math.random() * 400,
      height: 36 + Math.random() * 46,
    }))
  );
  // Rare, random delight rather than a constant effect — under half of
  // visits get one at all, and if it happens it's at a random moment and
  // position during the idle spin (never during the dive, which is already
  // busy enough visually).
  const [starConfig] = useState(() => ({
    show: Math.random() < 0.4,
    top: 8 + Math.random() * 24,
    left: 5 + Math.random() * 45,
    angle: 25 + Math.random() * 20,
    distance: 130 + Math.random() * 90,
    delay: 250 + Math.random() * (SPIN_MS - 900),
  }));

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Subtle parallax: the globe/star canvas shifts a few px opposite the
  // cursor as it moves, giving the scene a sense of depth rather than
  // feeling like a flat backdrop. Skipped on touch devices (no cursor)
  // and under reduced motion, same as the rest of this component's
  // effects. Applied via direct style writes (not React state) since
  // mousemove fires far more often than a re-render should happen.
  useEffect(() => {
    if (reduceMotion) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    function handleMove(e) {
      const rect = wrap.getBoundingClientRect();
      const relX = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const relY = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      const el = parallaxRef.current;
      if (el) el.style.transform = `translate(${-relX * 10}px, ${-relY * 10}px)`;
    }
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [reduceMotion]);

  // Size the canvas to whatever container it's placed in (the app's
  // mobile-width shell), rather than the full browser window.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Single deduped hand-off to the real map — every path that can end this
  // intro (normal completion, skip button, Escape key, reduced motion, and
  // the hard safety-net below) goes through this instead of calling
  // onArrive directly, so it can only ever fire once.
  function triggerArrive() {
    if (arrivedRef.current) return;
    arrivedRef.current = true;
    onArrive?.();
  }

  // People who've asked for reduced motion skip the flight entirely — the
  // globe would be a large, sustained motion effect otherwise.
  useEffect(() => {
    if (reduceMotion) triggerArrive();
  }, [reduceMotion]);

  // Hard safety net: whatever else fails — a blocked CDN, a texture that
  // never loads, WebGL unavailable, an exception in the scene-setup code —
  // this guarantees the person is never permanently stuck looking at a
  // black screen with a spinner. Normal completion takes ~4s
  // (SPIN_MS + DIVE_MS + HOLD_MS); this fires at 6s, well past that, purely
  // as a last resort.
  useEffect(() => {
    if (reduceMotion) return;
    const failSafe = setTimeout(triggerArrive, 6000);
    return () => clearTimeout(failSafe);
  }, [reduceMotion]);

  // Escape key is a common "get me out of this" reflex for a full-screen
  // takeover like this one — worth supporting alongside the visible button.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") handleSkip();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch India's border outline once on mount, independent of everything
  // else's timing — whichever finishes first (this fetch, or the scene
  // being ready to draw it), the other side just waits. A failure here
  // (network blocked, CDN down) is caught and silently ignored: the trace-
  // in is a nice-to-have, not something worth surfacing an error for or
  // letting block any other part of the intro.
  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    fetch(INDIA_BORDER_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((geojson) => {
        if (cancelled) return;
        const geometry = geojson.features ? geojson.features[0].geometry : geojson.geometry;
        let rings = [];
        if (geometry.type === "Polygon") rings = geometry.coordinates;
        else if (geometry.type === "MultiPolygon") rings = geometry.coordinates.map((poly) => poly[0]);
        if (rings.length === 0) return;
        // Largest ring by point count is the mainland outline, not a small
        // island territory.
        const largest = rings.reduce((a, b) => (b.length > a.length ? b : a));
        borderCoordsRef.current = largest; // [[lng, lat], ...]
      })
      .catch(() => {
        /* silent — see comment above */
      });
    return () => {
      cancelled = true;
    };
  }, [reduceMotion]);

  // Shooting star: scheduled independently of the main choreography effect
  // below since it's purely decorative and doesn't need to coordinate with
  // the camera/marker/rain timing.
  useEffect(() => {
    if (reduceMotion || !globeReady || !starConfig.show) return;
    const showTimer = setTimeout(() => setShowShootingStar(true), starConfig.delay);
    const hideTimer = setTimeout(() => setShowShootingStar(false), starConfig.delay + 900);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [reduceMotion, globeReady, starConfig]);

  useEffect(() => {
    // Reduced motion never runs the clouds/stars effect (see below), so
    // cloudsLoaded would otherwise stay false forever and permanently hide
    // the map underneath — treat "not loading clouds at all" as trivially
    // "done" in that case.
    const cloudsSignal = reduceMotion || cloudsLoaded;
    if (!globeReady || !cloudsSignal) return;
    // Small fixed buffer on top of the real signals, just for the first
    // frame to actually paint — not standing in for the whole load time.
    const t = setTimeout(() => setTextureSettled(true), 120);
    return () => clearTimeout(t);
  }, [globeReady, cloudsLoaded, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !globeReady) return;
    const globe = globeRef.current;
    if (!globe) return;

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.3;
    controls.enableZoom = false;
    controls.enablePan = false;
    // Explicitly on during the free-spin phase — briefly handing control
    // to whoever's watching feels more alive than a fully locked camera,
    // and OrbitControls resumes auto-rotating on its own once they let go.
    controls.enableRotate = true;

    // Start wide, at a random longitude each visit so the intro doesn't
    // always begin from the exact same orientation.
    globe.pointOfView({ lat: 8, lng: startLng, altitude: 2.5 }, 0);

    const diveTimer = setTimeout(() => {
      controls.autoRotate = false;
      // Lock dragging once the scripted dive starts — letting someone spin
      // the globe mid-dive would fight the camera animation.
      controls.enableRotate = false;
      setPhase("dive");
      // Swoop in past the final resting altitude first...
      globe.pointOfView({ lat: INDIA_LAT, lng: INDIA_LNG, altitude: OVERSHOOT_ALTITUDE }, DIVE_MS - SETTLE_MS);
    }, SPIN_MS);

    // ...then ease back out to the true resting altitude — the
    // overshoot-and-settle "bounce" rather than the camera just stopping
    // dead at the target.
    const settleTimer = setTimeout(() => {
      globe.pointOfView({ lat: INDIA_LAT, lng: INDIA_LNG, altitude: SETTLE_ALTITUDE }, SETTLE_MS);
    }, SPIN_MS + (DIVE_MS - SETTLE_MS));

    // Drop a pulsing marker on India partway through the dive, timed so it
    // appears as the country comes into view rather than before or after —
    // it's the same visual language (colored dot + expanding ring) as the
    // real report pins on the actual map, so the intro and the app it's
    // introducing feel like one continuous thing instead of two unrelated
    // screens.
    const markerTimer = setTimeout(() => {
      setShowMarker(true);
    }, SPIN_MS + DIVE_MS * 0.55);

    // A brief rain-streak overlay right as the camera settles over India —
    // the one moment in the whole intro that actually visually says
    // "monsoon," rather than just being a generic globe animation.
    const rainTimer = setTimeout(() => {
      setShowRain(true);
    }, SPIN_MS + DIVE_MS - 200);
    const rainEndTimer = setTimeout(() => {
      setShowRain(false);
    }, SPIN_MS + DIVE_MS - 200 + RAIN_MS);

    const arrivedTimer = setTimeout(() => {
      setPhase("arrived");
    }, SPIN_MS + DIVE_MS);

    const arriveTimer = setTimeout(() => {
      triggerArrive();
    }, SPIN_MS + DIVE_MS + HOLD_MS);

    return () => {
      clearTimeout(diveTimer);
      clearTimeout(settleTimer);
      clearTimeout(markerTimer);
      clearTimeout(rainTimer);
      clearTimeout(rainEndTimer);
      clearTimeout(arrivedTimer);
      clearTimeout(arriveTimer);
    };
  }, [reduceMotion, globeReady, startLng]);

  // Adds the cloud layer and a twinkling starfield directly to the
  // underlying three.js scene (react-globe.gl doesn't expose either as a
  // prop), sharing one requestAnimationFrame loop between them so there's
  // a single render-loop cost rather than two competing ones.
  useEffect(() => {
    if (reduceMotion || !globeReady) return;
    const globe = globeRef.current;
    if (!globe) return;

    let cloudsMesh = null;
    let ambientLight = null;
    let rafId = null;
    let cancelled = false;
    const clock = new THREE.Clock();

    // three-globe's default lighting is a single directional light at a
    // fixed position, not synced to wherever the camera ends up pointing —
    // so depending on which side of the globe the scripted dive lands on,
    // that hemisphere can end up under-lit/dark even with the daytime
    // texture loaded (this was the actual bug behind the globe looking
    // dark despite using earth-blue-marble.jpg, not a wrong-texture issue).
    // Adding a bright ambient light fixes this regardless of camera angle,
    // since ambient light isn't directional at all.
    ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    globe.scene().add(ambientLight);

    const globeRadiusForExtras = globe.getGlobeRadius();

    // Lat/long grid (graticule) — a few latitude circles and meridians
    // just above the surface, sci-fi/data-viz texture rather than a flat
    // sphere. Faint on purpose; it's atmosphere, not a focal point.
    const graticule = new THREE.Group();
    const graticuleMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 });
    const GRATICULE_SEGMENTS = 64;
    const graticuleRadius = globeRadiusForExtras * 1.01;
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let i = 0; i <= GRATICULE_SEGMENTS; i++) {
        pts.push(latLngToVector3(lat, (i / GRATICULE_SEGMENTS) * 360 - 180, graticuleRadius));
      }
      graticule.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), graticuleMaterial));
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const pts = [];
      for (let i = 0; i <= GRATICULE_SEGMENTS; i++) {
        pts.push(latLngToVector3((i / GRATICULE_SEGMENTS) * 180 - 90, lng, graticuleRadius));
      }
      graticule.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), graticuleMaterial));
    }
    globe.scene().add(graticule);

    // Orbiting satellite — a small bright dot circling the globe on a
    // tilted path, with a soft glow halo and a fading trail of small dots
    // behind it (not a THREE.Line — WebGL forces line thickness to ~1px on
    // most systems regardless of what's set, so a thin, 40%-opacity line
    // trail was effectively invisible against the starfield, which is why
    // this looked like a bare dot with no visible trail). The angular
    // speed matters a lot here too: the whole intro only lasts ~4s, so a
    // slow, realistic orbital speed would only ever sweep a few degrees —
    // deliberately much faster than a real orbit would be, purely so it's
    // visible as motion in the time available.
    const satelliteRadius = globeRadiusForExtras * 0.022;
    const satellite = new THREE.Mesh(
      new THREE.SphereGeometry(satelliteRadius, 8, 8),
      new THREE.MeshBasicMaterial({ color: atmosphereColor })
    );
    globe.scene().add(satellite);
    const satelliteGlow = new THREE.Mesh(
      new THREE.SphereGeometry(satelliteRadius * 2.6, 10, 10),
      new THREE.MeshBasicMaterial({ color: atmosphereColor, transparent: true, opacity: 0.3 })
    );
    globe.scene().add(satelliteGlow);
    const satelliteOrbitRadius = globeRadiusForExtras * 1.6;
    const satelliteTilt = 0.45;
    let satelliteAngle = Math.random() * Math.PI * 2;

    const SATELLITE_TRAIL_LENGTH = 10;
    const satelliteTrailHistory = [];
    const satelliteTrailDots = Array.from({ length: SATELLITE_TRAIL_LENGTH }, (_, i) => {
      const age = i / (SATELLITE_TRAIL_LENGTH - 1); // 0 = oldest, 1 = newest
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(satelliteRadius * (0.25 + 0.55 * age), 6, 6),
        new THREE.MeshBasicMaterial({ color: atmosphereColor, transparent: true, opacity: 0.06 + 0.4 * age })
      );
      mesh.visible = false; // hidden until there's real trail history to show
      globe.scene().add(mesh);
      return mesh;
    });

    // India border trace-in — lazily built the first time borderCoordsRef
    // has data (set by the fetch effect above, whenever it finishes) rather
    // than requiring the fetch to complete before this effect even runs.
    let borderLine = null;
    let borderRevealStart = null;
    const BORDER_ALTITUDE = 1.008;

    new THREE.TextureLoader().load(
      CLOUDS_URL,
      (texture) => {
        if (cancelled) return;
        const globeRadius = globe.getGlobeRadius();
        cloudsMesh = new THREE.Mesh(
          new THREE.SphereGeometry(globeRadius * (1 + CLOUDS_ALTITUDE), 75, 75),
          new THREE.MeshPhongMaterial({ map: texture, transparent: true })
        );
        globe.scene().add(cloudsMesh);
        setCloudsLoaded(true);
        startLoopIfReady();
      },
      undefined,
      // On error (blocked network, CDN down, etc.) still mark this as
      // "done trying" rather than leaving cloudsLoaded permanently false —
      // that had been silently stalling the loading veil forever, which is
      // the bug this whole section is fixing. The globe itself still
      // renders fine without a cloud layer; it's a nice-to-have, not
      // something worth blocking the entire intro over.
      () => {
        if (cancelled) return;
        setCloudsLoaded(true);
      }
    );

    // Twinkling stars, split into 3 depth layers rather than one shell —
    // each point's brightness driven by a per-vertex random phase in the
    // vertex shader. With everything at one radius, dragging the globe
    // moved the whole starfield as a single rigid background; put at
    // different radii, near/mid/far layers shift at genuinely different
    // rates as the camera orbits (real parallax from perspective
    // projection, not a manual trick) — closer layers are sparser and
    // brighter, farther layers denser and dimmer, mimicking real depth.
    const starLayers = [];
    const LAYER_CONFIGS = [
      { radius: 1800, count: 130, sizeBase: 2.3, sizeVariance: 1.8, opacityBase: 0.55, opacityVariance: 0.45 },
      { radius: 3200, count: 260, sizeBase: 1.5, sizeVariance: 1.3, opacityBase: 0.4, opacityVariance: 0.4 },
      { radius: 5500, count: 440, sizeBase: 0.9, sizeVariance: 0.8, opacityBase: 0.25, opacityVariance: 0.35 },
    ];

    function createStarLayer({ radius, count, sizeBase, sizeVariance, opacityBase, opacityVariance }) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const randoms = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = radius * (0.85 + Math.random() * 0.15);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
        randoms[i] = Math.random() * Math.PI * 2;
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSizeBase: { value: sizeBase },
          uSizeVariance: { value: sizeVariance },
          uOpacityBase: { value: opacityBase },
          uOpacityVariance: { value: opacityVariance },
        },
        vertexShader: `
          attribute float aRandom;
          uniform float uTime;
          uniform float uSizeBase;
          uniform float uSizeVariance;
          varying float vTwinkle;
          void main() {
            vTwinkle = 0.5 + 0.5 * sin(uTime * 1.5 + aRandom * 6.28318);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = (uSizeBase + vTwinkle * uSizeVariance) * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying float vTwinkle;
          uniform float uOpacityBase;
          uniform float uOpacityVariance;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, uOpacityBase + vTwinkle * uOpacityVariance);
          }
        `,
        transparent: true,
        depthWrite: false,
      });

      return new THREE.Points(geometry, material);
    }

    for (const config of LAYER_CONFIGS) {
      const layer = createStarLayer(config);
      globe.scene().add(layer);
      starLayers.push(layer);
    }
    startLoopIfReady();

    function startLoopIfReady() {
      if (rafId) return; // already running
      const tick = () => {
        if (cancelled) return;
        if (cloudsMesh) cloudsMesh.rotation.y += (CLOUDS_ROTATE_DEG_PER_FRAME * Math.PI) / 180;
        const t = clock.getElapsedTime();
        for (const layer of starLayers) {
          layer.material.uniforms.uTime.value = t;
        }

        satelliteAngle += 0.045;
        satellite.position.set(
          satelliteOrbitRadius * Math.cos(satelliteAngle),
          satelliteOrbitRadius * Math.sin(satelliteAngle) * Math.sin(satelliteTilt),
          satelliteOrbitRadius * Math.sin(satelliteAngle) * Math.cos(satelliteTilt)
        );
        satelliteGlow.position.copy(satellite.position);

        satelliteTrailHistory.push(satellite.position.clone());
        if (satelliteTrailHistory.length > SATELLITE_TRAIL_LENGTH) satelliteTrailHistory.shift();
        // History is oldest-first; dots array is also oldest-first (index 0
        // = smallest/dimmest), so they line up directly. Fewer history
        // entries than dots early on (first ~10 frames) — just leave the
        // unused newest-end dots hidden until there's enough history.
        for (let i = 0; i < satelliteTrailDots.length; i++) {
          const historyIndex = i - (satelliteTrailDots.length - satelliteTrailHistory.length);
          if (historyIndex < 0) {
            satelliteTrailDots[i].visible = false;
            continue;
          }
          satelliteTrailDots[i].visible = true;
          satelliteTrailDots[i].position.copy(satelliteTrailHistory[historyIndex]);
        }

        // Lazily build the border line the first time coordinate data is
        // available, then animate its reveal via drawRange over
        // BORDER_TRACE_MS from whenever it was actually built (not from
        // some earlier scheduled time it might have missed while the fetch
        // was still in flight).
        if (!borderLine && borderCoordsRef.current) {
          const points = borderCoordsRef.current.map(([lng, lat]) =>
            latLngToVector3(lat, lng, globeRadiusForExtras * BORDER_ALTITUDE)
          );
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          geometry.setDrawRange(0, 0);
          const material = new THREE.LineBasicMaterial({ color: atmosphereColor, transparent: true, opacity: 0.9 });
          borderLine = new THREE.Line(geometry, material);
          globe.scene().add(borderLine);
          borderRevealStart = performance.now();
        }
        if (borderLine && borderRevealStart !== null) {
          const total = borderLine.geometry.attributes.position.count;
          const progress = Math.min(1, (performance.now() - borderRevealStart) / BORDER_TRACE_MS);
          borderLine.geometry.setDrawRange(0, Math.round(total * progress));
        }

        rafId = requestAnimationFrame(tick);
      };
      tick();
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (cloudsMesh) globe.scene().remove(cloudsMesh);
      for (const layer of starLayers) globe.scene().remove(layer);
      if (ambientLight) globe.scene().remove(ambientLight);
      globe.scene().remove(graticule);
      globe.scene().remove(satellite);
      globe.scene().remove(satelliteGlow);
      for (const dot of satelliteTrailDots) globe.scene().remove(dot);
      if (borderLine) globe.scene().remove(borderLine);
    };
  }, [reduceMotion, globeReady]);

  function handleSkip() {
    setSkipped((already) => {
      if (already) return already;
      triggerArrive();
      return true;
    });
  }

  if (reduceMotion) return null;

  const markerPoint = showMarker ? [{ lat: INDIA_LAT, lng: INDIA_LNG }] : [];

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--mist)",
        overflow: "hidden",
      }}
    >
      {/* Breathing halo behind the canvas — a soft pulse so the globe feels
          alive even before anything moves, using whichever accent color
          was picked for this visit. */}
      <div
        aria-hidden="true"
        className="mm-globe-breathe"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "70%",
          aspectRatio: "1 / 1",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${atmosphereColor}33, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      <div className="mm-globe-enter" style={{ position: "absolute", inset: 0 }}>
        <div
          ref={parallaxRef}
          style={{ position: "absolute", inset: 0, transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          backgroundImageUrl={STARFIELD_URL}
          globeImageUrl={EARTH_URL}
          bumpImageUrl={BUMP_URL}
          atmosphereColor={atmosphereColor}
          atmosphereAltitude={0.2}
          pointsData={markerPoint}
          pointColor={() => atmosphereColor}
          pointAltitude={CLOUDS_ALTITUDE + 0.006}
          pointRadius={0.35}
          pointsMerge={true}
          ringsData={markerPoint}
          ringColor={() => atmosphereColor}
          ringAltitude={CLOUDS_ALTITUDE + 0.006}
          ringMaxRadius={6}
          ringPropagationSpeed={2.5}
          ringRepeatPeriod={900}
          onGlobeReady={() => setGlobeReady(true)}
        />
        </div>
      </div>

      {/* Vignette so the globe reads as sitting in a defined space rather
          than floating on a flat, edge-to-edge black rectangle. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(circle, transparent 45%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      {/* Shooting star — rare, random delight during the idle spin. Outer
          div handles static position/rotation, inner div only animates
          translateX+opacity, so the CSS animation (which fully replaces
          `transform` while running) can't clobber the rotation. */}
      {showShootingStar && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: `${starConfig.top}%`,
            left: `${starConfig.left}%`,
            transform: `rotate(${starConfig.angle}deg)`,
            pointerEvents: "none",
          }}
        >
          <div className="mm-shooting-star" style={{ "--mm-travel": `${starConfig.distance}px` }} />
        </div>
      )}

      {/* Rain-streak overlay — the one moment that actually visually says
          "monsoon," timed to appear right as the camera settles on India. */}
      {showRain && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          {rainDrops.map((d, i) => (
            <div
              key={i}
              className="mm-rain-drop"
              style={{
                left: `${d.left}%`,
                height: d.height,
                animationDelay: `${d.delay}ms`,
                animationDuration: `${d.duration}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Loading veil — covers the (briefly) untextured globe on first
          paint, fading out once a frame has actually rendered. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--mist)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          opacity: textureSettled ? 0 : 1,
          pointerEvents: "none",
          transition: "opacity 0.5s ease",
        }}
      >
        <svg className="mm-spinner" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2.5">
          <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 11.5, color: "var(--slate)", letterSpacing: 0.4 }}>Loading Earth…</div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "14%",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        <div
          className="mm-fade-up"
          style={{
            color: atmosphereColor,
            fontSize: 13,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            opacity: 0.85,
            fontWeight: 600,
            animationDelay: "150ms",
            textShadow: `0 0 16px ${atmosphereColor}66`,
          }}
        >
          MonsoonMap
        </div>
        <div
          className="mm-fade-up"
          style={{
            marginTop: 6,
            color: "var(--ink)",
            fontSize: 12.5,
            opacity: 0.75,
            fontWeight: 400,
            animationDelay: "500ms",
          }}
        >
          Live waterlogging &amp; road damage across India
        </div>
        {/* Phase caption — cross-fades between "Locating India…" and
            "Arriving over India…" rather than swapping abruptly. Rendered
            as two stacked, independently-faded layers so there's no gap
            frame between them. */}
        <div style={{ position: "relative", height: 18, marginTop: 10 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              color: "var(--slate)",
              fontSize: 11.5,
              letterSpacing: 0.4,
              opacity: phase === "spin" ? 0.8 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            <Typewriter text="Locating India…" active={phase === "spin"} reducedMotion={reduceMotion} />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              color: "var(--slate)",
              fontSize: 11.5,
              letterSpacing: 0.4,
              opacity: phase === "dive" ? 0.8 : 0,
              transition: "opacity 0.4s ease",
            }}
          >
            <Typewriter text="Arriving over India…" active={phase === "dive"} reducedMotion={reduceMotion} />
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)" }}>
        <button
          onClick={handleSkip}
          className="mm-glass mm-interactive"
          style={{
            color: "var(--ink)",
            borderRadius: 999,
            padding: "9px 18px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Skip to map
        </button>
      </div>
    </div>
  );
}