"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Dict } from "@/i18n/en";
import { FrameStore, type Variant } from "./frame-store";
import { manifest, posterUrl, type Motion } from "./manifest";
import { attachChapterSnap } from "./snap";
import { buildTimeline, sample, type Sample } from "./timeline";

type Props = { hero: Dict["hero"]; chapters: Dict["chapters"] };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const pickVariant = (): Variant => (window.innerWidth < window.innerHeight * 0.9 ? "m" : "d");

type Drawable = ImageBitmap | HTMLImageElement;

type Ctx = CanvasRenderingContext2D;
type Source = Drawable | HTMLCanvasElement;

/** Draws img to cover a W×H area. */
function drawCover(ctx: Ctx, img: Source, W: number, H: number) {
  const s = Math.max(W / img.width, H / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/**
 * Draws img cover-fitted, zoomed by `zoom` about the centre and shifted by (ox, oy).
 * Any area the image no longer covers is filled with mirrored copies of it, so a
 * moving shot never reveals an empty edge (and never needs an artificial zoom).
 */
function drawMoved(ctx: Ctx, img: Source, W: number, H: number, ox: number, oy: number, zoom: number) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  const dw = img.width * s;
  const dh = img.height * s;
  const x0 = (W - dw) / 2 + ox;
  const y0 = (H - dh) / 2 + oy;
  const i0 = Math.max(-2, Math.floor(-x0 / dw));
  const i1 = Math.min(2, Math.floor((W - x0) / dw - 1e-6));
  const j0 = Math.max(-2, Math.floor(-y0 / dh));
  const j1 = Math.min(2, Math.floor((H - y0) / dh - 1e-6));
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const fx = i % 2 !== 0;
      const fy = j % 2 !== 0;
      if (!fx && !fy) {
        ctx.drawImage(img, x0 + i * dw, y0 + j * dh, dw, dh);
        continue;
      }
      ctx.save();
      ctx.translate(x0 + i * dw + (fx ? dw : 0), y0 + j * dh + (fy ? dh : 0));
      ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
    }
  }
}

// ── Transition tuning ────────────────────────────────────────────────────────
const TRAVEL = 1.1; // how far a sliding shot travels (× frame size along the motion)
const ZOOM_TRAVEL = Math.log(2.4); // how far a zooming shot zooms (log scale)
const SHUTTER = 0.16; // motion-blur "shutter" as a fraction of the transition
const TAPS = 12; // samples per motion blur

type Dir = { ux: number; uy: number; slide: number; zoom: number; zSign: number };

/**
 * Direction for the transition out of clip `from`: the outgoing clip's own camera
 * motion at its end. If that shot is nearly still, use how the next clip starts;
 * failing both, slide left. Returned as a unit screen direction plus how much of
 * the move is a slide vs. a zoom.
 */
function directionFor(from: number, to: number, v: Variant, W: number, H: number): Dir {
  const clips = manifest.clips;
  const strength = (m?: Motion) => (m ? Math.hypot(m.x * W, m.y * H) / Math.max(W, H) + Math.abs(m.z) * 0.5 : 0);
  let m = clips[from].motion?.[v].exit;
  if (strength(m) < 0.0012) m = clips[to].motion?.[v].entry;
  if (!m || strength(m) < 0.0012) m = { x: -0.01, y: 0, z: 0 };
  const px = m.x * W;
  const py = m.y * H;
  const len = Math.hypot(px, py);
  const slideS = len / Math.max(W, H);
  const zoomS = Math.abs(m.z) * 0.5;
  const slide = slideS / (slideS + zoomS || 1);
  return { ux: len ? px / len : -1, uy: len ? py / len : 0, slide, zoom: 1 - slide, zSign: Math.sign(m.z) || 1 };
}

/** Where a layer is at transition time tau. Outgoing accelerates away; incoming decelerates in. */
function layerAt(d: Dir, tau: number, incoming: boolean, W: number, H: number) {
  const tc = Math.max(0, Math.min(1, tau));
  const p = incoming ? -((1 - tc) * (1 - tc)) : tc * tc;
  const along = Math.abs(d.ux) * W + Math.abs(d.uy) * H; // frame size along the motion
  const dist = TRAVEL * along * d.slide * p;
  return { ox: d.ux * dist, oy: d.uy * dist, zoom: Math.exp(d.zSign * ZOOM_TRAVEL * d.zoom * p) };
}

export default function FlyThrough({ hero, chapters }: Props) {
  const trackRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const counterRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const { segments, units } = useMemo(() => buildTimeline(manifest), []);
  const clipSegments = useMemo(
    () => segments.filter((s): s is Extract<typeof s, { kind: "clip" }> => s.kind === "clip"),
    [segments],
  );

  useEffect(() => {
    const track = trackRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let variant = pickVariant();
    let dirty = true;
    let store = new FrameStore(manifest, variant, () => (dirty = true));
    let W = 0;
    let H = 0;
    let current = -1;
    let target = 0;
    let last = performance.now();
    let raf = 0;
    let visible = true;
    let activeChapter = -1;
    // Low-res buffers for the transition blur (blur hides the resolution, and it's cheap).
    const blurA = document.createElement("canvas");
    const blurB = document.createElement("canvas");
    const actx = blurA.getContext("2d")!;
    const bctx = blurB.getContext("2d")!;
    // Downscaled copies of the two transition frames, so the many blur taps are cheap.
    const small = new WeakMap<object, HTMLCanvasElement>();
    const smallOf = (img: Drawable) => {
      let c = small.get(img);
      if (!c) {
        const k = Math.min(1, Math.max(blurA.width / img.width, blurA.height / img.height) * 1.25);
        c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        small.set(img, c);
      }
      return c;
    };
    /** Renders a layer averaged over the shutter window (true motion blur) into a buffer. */
    const blurLayer = (bx: Ctx, img: Drawable, d: Dir, tau: number, incoming: boolean) => {
      const bw = bx.canvas.width;
      const bh = bx.canvas.height;
      const src = smallOf(img);
      for (let k = 0; k < TAPS; k++) {
        const l = layerAt(d, tau - (SHUTTER * k) / (TAPS - 1), incoming, bw, bh);
        bx.globalAlpha = 1 / (k + 1);
        drawMoved(bx, src, bw, bh, l.ox, l.oy, l.zoom);
      }
      bx.globalAlpha = 1;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        ctx.imageSmoothingQuality = "high";
        for (const b of [blurA, blurB]) {
          b.width = Math.max(1, Math.round(W / 3));
          b.height = Math.max(1, Math.round(H / 3));
        }
      }
      const v = pickVariant();
      if (v !== variant) {
        variant = v;
        store.destroy();
        store = new FrameStore(manifest, variant, () => (dirty = true));
        store.setPosition(positionOf(sample(segments, current < 0 ? 0 : current)));
      }
      dirty = true;
    };

    const readScroll = () => {
      const r = track.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 0;
      target = p * units;
    };

    const positionOf = (s: Sample) =>
      s.kind === "clip" ? s.frame : s.t < 0.5 ? s.fromFrame : s.toFrame;

    const draw = (s: Sample) => {
      ctx.fillStyle = "#00291b";
      ctx.fillRect(0, 0, W, H);
      if (s.kind === "clip") {
        const img = store.get(s.frame);
        if (img) drawCover(ctx, img, W, H);
        return;
      }
      // Directional whip: the transition continues the outgoing shot's own camera
      // move (pan, rise or push-in), accelerating into a motion blur; the next shot
      // arrives moving the same way and settles. Blur follows the actual motion.
      const tau = s.t;
      const d = directionFor(s.from, s.to, variant, W, H);
      const out = store.get(s.fromFrame);
      const inn = store.get(s.toFrame);
      const mix = smoothstep(0.38, 0.62, tau);
      // How fast each layer is moving (0 → 1), which sets how blurred it looks.
      const blurOut = smoothstep(0.08, 0.55, tau * 2);
      const blurIn = smoothstep(0.08, 0.55, (1 - tau) * 2);

      if (out) {
        const l = layerAt(d, tau, false, W, H);
        drawMoved(ctx, out, W, H, l.ox, l.oy, l.zoom);
        if (blurOut > 0.01) {
          blurLayer(actx, out, d, tau, false);
          ctx.globalAlpha = blurOut;
          ctx.drawImage(blurA, 0, 0, W, H);
        }
      }
      if (inn && mix > 0) {
        const l = layerAt(d, tau, true, W, H);
        ctx.globalAlpha = mix;
        drawMoved(ctx, inn, W, H, l.ox, l.oy, l.zoom);
        if (blurIn > 0.01) {
          blurLayer(bctx, inn, d, tau, true);
          ctx.globalAlpha = mix * blurIn;
          ctx.drawImage(blurB, 0, 0, W, H);
        }
      }
      ctx.globalAlpha = 1;
    };

    const updateOverlays = (u: number, s: Sample) => {
      // Hero fades out over the first part of clip 0.
      const first = clipSegments[0];
      const heroOut = smoothstep(0.02, 0.22, (u - first.start) / first.length);
      if (heroRef.current) {
        heroRef.current.style.opacity = String(1 - heroOut);
        heroRef.current.style.transform = `translate3d(0, ${-heroOut * 40}px, 0)`;
        heroRef.current.style.visibility = heroOut >= 1 ? "hidden" : "visible";
      }
      clipSegments.forEach((seg, i) => {
        const el = captionRefs.current[i];
        if (!el) return;
        const l = (u - seg.start) / seg.length;
        const isFirst = i === 0;
        const isLast = i === clipSegments.length - 1;
        const fadeIn = isFirst ? smoothstep(0.3, 0.45, l) : smoothstep(0.08, 0.26, l);
        const fadeOut = isLast ? 0 : smoothstep(0.8, 0.97, l);
        const o = Math.max(0, fadeIn - fadeOut);
        el.style.opacity = String(o);
        el.style.transform = `translate3d(0, ${(1 - fadeIn) * 28 - fadeOut * 28}px, 0)`;
        el.style.visibility = o <= 0.001 ? "hidden" : "visible";
      });
      const ch = s.kind === "clip" ? s.clip : s.t < 0.5 ? s.from : s.to;
      if (ch !== activeChapter) {
        activeChapter = ch;
        if (counterRef.current) counterRef.current.textContent = `${String(ch + 1).padStart(2, "0")} / ${String(clipSegments.length).padStart(2, "0")}`;
        if (labelRef.current) labelRef.current.textContent = chapters[ch]?.kicker ?? "";
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${u / units})`;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const dt = Math.min(64, now - last);
      last = now;
      readScroll();
      if (current < 0) current = target;
      const diff = target - current;
      if (Math.abs(diff) > 0.005) {
        current += diff * (1 - Math.exp(-dt / 90));
        dirty = true;
      } else if (current !== target) {
        current = target;
        dirty = true;
      }
      if (!dirty) return;
      dirty = false;
      const s = sample(segments, current);
      store.setPosition(positionOf(s));
      draw(s);
      updateOverlays(current, s);
      canvas.dataset.ready = "1";
    };

    // Chapter stops (document scroll positions): the hero, each chapter where its
    // caption is fully on screen, then the section after the fly-through.
    const trackTop = () => track.getBoundingClientRect().top + window.scrollY;
    const afterTrack = () => {
      const next = track.parentElement?.querySelector<HTMLElement>("#guide");
      return next ? next.getBoundingClientRect().top + window.scrollY : trackTop() + track.offsetHeight;
    };
    const stops = () => {
      const top = trackTop();
      const span = track.offsetHeight - window.innerHeight;
      const ys = [top];
      clipSegments.forEach((seg, i) => {
        const restAt = i === 0 ? 0.55 : 0.5; // fraction into the clip where its caption is fully in
        ys.push(Math.round(top + ((seg.start + seg.length * restAt) / units) * span));
      });
      ys.push(Math.round(afterTrack()));
      return ys;
    };
    const detachSnap = attachChapterSnap({
      stops,
      inZone: (y) => y >= trackTop() - 4 && y <= afterTrack() + 4,
    });

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      dirty = true;
    }, { rootMargin: "200px" });
    io.observe(track);
    resize();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      detachSnap();
      ro.disconnect();
      io.disconnect();
      store.destroy();
    };
  }, [segments, units, clipSegments, chapters]);

  const firstClip = manifest.clips[0].id;

  return (
    <>
      <section
        ref={trackRef}
        className="ft-track relative"
        style={{ height: `calc(${units} * var(--ft-unit) + 100lvh)` }}
        aria-label={hero.scroll}
      >
        {/* No background colour here on purpose: iOS 26 Safari tints its status bar and
            toolbar with the background of full-width sticky/fixed elements at the screen
            edges. Transparent lets the footage show through instead. The canvas and
            poster paint the whole area anyway. */}
        <div className="sticky top-0 h-[100lvh] w-full overflow-hidden">
          <picture>
            <source media="(max-aspect-ratio: 9/10)" srcSet={posterUrl(firstClip, "m")} />
            <img
              src={posterUrl(firstClip, "d")}
              alt=""
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </picture>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500 data-[ready]:opacity-100"
            aria-hidden
          />
          {/* Legibility scrims */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,41,27,.55)_0%,rgba(0,41,27,0)_22%,rgba(0,41,27,.05)_42%,rgba(0,41,27,.88)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(0,41,27,.55)_0%,rgba(0,41,27,.15)_45%,rgba(0,41,27,0)_70%)]" />

          <div className="pointer-events-none absolute inset-x-0 top-0 h-[100svh] [text-shadow:0_1px_30px_rgba(0,24,15,.35)]">
            <div ref={heroRef} className="absolute inset-x-0 bottom-0 px-5 pb-[max(6rem,12svh)] sm:px-10 lg:px-16">
              <p className="eyebrow text-cream [text-shadow:0_1px_12px_rgba(0,24,15,.6)]">{hero.eyebrow}</p>
              <h1 className="mt-4 max-w-[14ch] whitespace-pre-line font-display text-[clamp(3rem,10vw,9rem)] leading-[0.92] tracking-[-0.03em] text-cream">
                {hero.title}
              </h1>
              <p className="mt-6 max-w-xl text-base text-cream/85 sm:text-lg">{hero.lead}</p>
              <div className="mt-10 flex items-center gap-3 text-sm text-cream/70">
                <span className="scroll-cue" aria-hidden />
                {hero.scroll}
              </div>
            </div>

            {chapters.map((c, i) => (
              <div
                key={c.id}
                ref={(el) => {
                  captionRefs.current[i] = el;
                }}
                className="invisible absolute inset-x-0 bottom-0 px-5 pb-[max(6.5rem,13svh)] opacity-0 will-change-transform sm:px-10 lg:px-16"
              >
                <p className="eyebrow text-cream/75">
                  <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className="mx-2 opacity-50">—</span>
                  {c.kicker}
                </p>
                <h2 className="mt-3 max-w-[16ch] font-display text-[clamp(2.25rem,6.5vw,5.5rem)] leading-[0.95] tracking-[-0.025em] text-cream">
                  {c.title}
                </h2>
                <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-cream/85 sm:text-lg">{c.body}</p>
              </div>
            ))}

            <div className="absolute left-5 right-5 top-[calc(env(safe-area-inset-top)+4.25rem)] flex items-center gap-4 text-xs text-cream/70 sm:bottom-6 sm:left-10 sm:right-10 sm:top-auto lg:left-16 lg:right-16">
              <span ref={counterRef} className="tabular-nums">
                01 / {String(chapters.length).padStart(2, "0")}
              </span>
              <span ref={labelRef} className="eyebrow hidden sm:inline">
                {chapters[0].kicker}
              </span>
              <div className="relative h-px flex-1 bg-cream/20">
                <div ref={barRef} className="absolute inset-0 origin-left scale-x-0 bg-cream" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Shown instead of the fly-through for reduced motion / no AVIF support. */}
      <section className="ft-static bg-forest" aria-label={hero.scroll}>
        <div className="relative min-h-[90svh]">
          <picture>
            <source media="(max-aspect-ratio: 9/10)" srcSet={posterUrl(firstClip, "m")} />
            <img src={posterUrl(firstClip, "d")} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </picture>
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,41,27,.4),rgba(0,41,27,.9))]" />
          <div className="relative flex min-h-[90svh] flex-col justify-end px-5 pb-16 sm:px-10 lg:px-16">
            <p className="eyebrow text-cream/80">{hero.eyebrow}</p>
            <h1 className="mt-4 whitespace-pre-line font-display text-[clamp(3rem,10vw,8rem)] leading-[0.92] tracking-[-0.03em] text-cream">
              {hero.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-cream/85">{hero.lead}</p>
          </div>
        </div>
        <ol className="grid gap-px bg-cream/10 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((c, i) => (
            <li key={c.id} className="bg-forest">
              <picture>
                <source media="(max-aspect-ratio: 9/10)" srcSet={posterUrl(manifest.clips[i]?.id ?? firstClip, "d")} />
                <img
                  src={posterUrl(manifest.clips[i]?.id ?? firstClip, "d")}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
              </picture>
              <div className="p-6">
                <p className="eyebrow text-cream/60">
                  {String(i + 1).padStart(2, "0")} — {c.kicker}
                </p>
                <h2 className="mt-2 font-display text-2xl text-cream">{c.title}</h2>
                <p className="mt-2 text-cream/75">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
