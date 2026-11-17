// Chapter snapping for the fly-through.
//
// - A swipe (a short, quick flick) glides to the NEXT chapter stop in the swipe
//   direction, one chapter per swipe, however hard the flick.
// - Continuous scrolling (a slow drag, a long drag, trackpad scrolling, a spinning
//   mouse wheel) is left alone: it stops wherever the user stops.
// - Any new touch, wheel or key input cancels a glide in progress immediately.
// - A single mouse-wheel notch counts as a swipe.
//
// Only gestures that start inside the fly-through snap; the rest of the page
// scrolls normally.
//
// Touch: iOS Safari keeps its native momentum running after the finger lifts and
// programmatic scrolling can't cancel it (it overshoots any glide). So inside the
// fly-through we drive touch scrolling ourselves: the page follows the finger 1:1
// (native scrolling is prevented), and on release either glides to the next stop
// (swipe) or coasts with our own momentum (continuous drag). Taps and pinch-zoom
// are untouched.

type Opts = {
  /** Scroll positions (px, document coordinates) to stop at, ascending. */
  stops: () => number[];
  /** Whether a scroll position is inside the snapping zone. */
  inZone: (y: number) => boolean;
};

// Swipe detection (touch)
const SWIPE_MAX_MS = 450; // a swipe is a short gesture…
const SWIPE_MIN_PX = 24; // …that actually moved…
const SWIPE_MIN_VELOCITY = 0.3; // …and was still moving fast at release (px/ms)
// Mouse wheel: a burst of wheel events this short is a notch, not a continuous scroll
const WHEEL_NOTCH_MS = 260;
const WHEEL_IDLE_MS = 140;
// Glide animation
const GLIDE_MIN_MS = 420;
const GLIDE_MAX_MS = 950;
// Our own momentum after a continuous drag (≈ iOS deceleration)
const COAST_TIME_CONSTANT = 325; // ms
const COAST_MIN_VELOCITY = 0.02; // px/ms

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function attachChapterSnap({ stops, inZone }: Opts) {
  let glideRaf = 0;
  let gliding = false;
  let glideDir = 0;

  const cancelGlide = () => {
    if (glideRaf) cancelAnimationFrame(glideRaf);
    glideRaf = 0;
    gliding = false;
  };

  const glideTo = (target: number) => {
    cancelGlide();
    const from = window.scrollY;
    const dist = target - from;
    if (Math.abs(dist) < 2) return;
    const dur = Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, Math.abs(dist) * 0.5));
    const t0 = performance.now();
    gliding = true;
    glideDir = Math.sign(dist);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      // Instant scrollTo each frame: this also cancels the browser's own momentum.
      window.scrollTo(0, from + dist * easeOutCubic(t));
      if (t < 1 && gliding) glideRaf = requestAnimationFrame(step);
      else cancelGlide();
    };
    glideRaf = requestAnimationFrame(step);
  };

  /** The first stop strictly beyond `from` in direction `dir`. */
  const nextStop = (from: number, dir: 1 | -1) => {
    const s = stops();
    const EPS = 12;
    if (dir > 0) return s.find((y) => y > from + EPS);
    for (let i = s.length - 1; i >= 0; i--) if (s[i] < from - EPS) return s[i];
    return undefined;
  };

  /** Momentum after a continuous drag: decelerates exponentially, stops anywhere. */
  const coast = (velocity: number) => {
    cancelGlide();
    if (Math.abs(velocity) < COAST_MIN_VELOCITY * 2) return;
    let v = velocity;
    let last = performance.now();
    let y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    gliding = true;
    glideDir = Math.sign(v);
    const step = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      y += v * dt;
      v *= Math.exp(-dt / COAST_TIME_CONSTANT);
      if (y <= 0 || y >= max) {
        y = Math.max(0, Math.min(max, y));
        v = 0;
      }
      window.scrollTo(0, y);
      if (Math.abs(v) > COAST_MIN_VELOCITY && gliding) glideRaf = requestAnimationFrame(step);
      else cancelGlide();
    };
    glideRaf = requestAnimationFrame(step);
  };

  // ── Touch ───────────────────────────────────────────────────────────────
  type Touch = {
    y0: number;
    scroll0: number;
    t0: number;
    samples: { y: number; t: number }[];
    /** true once we have taken over this gesture (moved, inside the zone) */
    driving: boolean;
  };
  let touch: Touch | null = null;

  const onTouchStart = (e: TouchEvent) => {
    cancelGlide();
    if (e.touches.length !== 1 || !inZone(window.scrollY)) {
      touch = null;
      return;
    }
    const y = e.touches[0].clientY;
    const now = performance.now();
    touch = { y0: y, scroll0: window.scrollY, t0: now, samples: [{ y, t: now }], driving: false };
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!touch) return;
    if (e.touches.length !== 1) {
      touch = null; // a second finger: pinch-zoom, hand back to the browser
      return;
    }
    const y = e.touches[0].clientY;
    const now = performance.now();
    if (!touch.driving) {
      if (Math.abs(y - touch.y0) < 4) return; // still a possible tap
      touch.driving = true;
    }
    e.preventDefault(); // no native scroll, so no native momentum to overshoot
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, Math.min(max, touch.scroll0 + (touch.y0 - y))));
    touch.samples.push({ y, t: now });
    while (touch.samples.length > 2 && now - touch.samples[0].t > 100) touch.samples.shift();
  };

  const onTouchEnd = () => {
    const g = touch;
    touch = null;
    if (!g || !g.driving) return;
    const now = performance.now();
    const last = g.samples[g.samples.length - 1];
    const first = g.samples[0];
    const moved = g.y0 - last.y; // finger up = positive = scroll down
    const dt = Math.max(1, last.t - first.t);
    // Release velocity in scroll px/ms (+ = down). If the finger paused before
    // lifting, there is no velocity left.
    const stale = now - last.t > 100;
    const velocity = stale ? 0 : (first.y - last.y) / dt;
    const isSwipe =
      now - g.t0 <= SWIPE_MAX_MS &&
      Math.abs(moved) >= SWIPE_MIN_PX &&
      Math.abs(velocity) >= SWIPE_MIN_VELOCITY &&
      Math.sign(velocity) === Math.sign(moved);
    if (isSwipe) {
      const target = nextStop(g.scroll0, moved > 0 ? 1 : -1);
      if (target !== undefined) return glideTo(target);
    }
    coast(velocity); // continuous drag (or nowhere to snap to): free momentum
  };

  // ── Mouse wheel / trackpad ──────────────────────────────────────────────
  let wheel: { t0: number; last: number; scroll0: number; dir: 1 | -1; timer: number } | null = null;

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch-zoom / sideways
    const now = performance.now();
    const dir: 1 | -1 = e.deltaY > 0 ? 1 : -1;
    if (gliding) {
      // While gliding, extra notches in the same direction are swallowed so they
      // don't fight the glide; scrolling the other way cancels it.
      if (dir === glideDir) {
        e.preventDefault();
        return;
      }
      cancelGlide();
    }
    if (!wheel || dir !== wheel.dir) {
      if (wheel) clearTimeout(wheel.timer);
      wheel = { t0: now, last: now, scroll0: window.scrollY, dir, timer: 0 };
    }
    wheel.last = now;
    clearTimeout(wheel.timer);
    wheel.timer = window.setTimeout(() => {
      const w = wheel;
      wheel = null;
      if (!w || !inZone(w.scroll0)) return;
      if (w.last - w.t0 > WHEEL_NOTCH_MS) return; // trackpad / continuous wheel: free
      const target = nextStop(w.scroll0, w.dir);
      if (target !== undefined) glideTo(target);
    }, WHEEL_IDLE_MS);
  };

  const onKey = () => cancelGlide();

  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKey);
  window.addEventListener("mousedown", onKey);

  return () => {
    cancelGlide();
    if (wheel) clearTimeout(wheel.timer);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("mousedown", onKey);
  };
}
