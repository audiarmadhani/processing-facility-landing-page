"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Dict } from "@/i18n/en";
import { FrameStore, type Variant } from "./frame-store";
import { manifest, posterUrl } from "./manifest";
import { buildTimeline, sample, type Sample } from "./timeline";

type Props = { hero: Dict["hero"]; chapters: Dict["chapters"] };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const pickVariant = (): Variant => (window.innerWidth < window.innerHeight * 0.9 ? "m" : "d");

type Drawable = ImageBitmap | HTMLImageElement;

function drawCover(ctx: CanvasRenderingContext2D, img: Drawable, W: number, H: number, dx = 0) {
  const iw = img.width;
  const ih = img.height;
  const s = Math.max(W / iw, H / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (W - dw) / 2 + dx, (H - dh) / 2, dw, dh);
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

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(canvas.clientWidth * dpr);
      H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        ctx.imageSmoothingQuality = "high";
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
      // Whip-pan: both frames slide left; each is smeared with fading copies
      // trailing behind its motion to fake motion blur.
      const e = easeInOutCubic(s.t);
      const speed = Math.sin(Math.PI * s.t);
      const step = speed * W * 0.022;
      const out = store.get(s.fromFrame);
      const inn = store.get(s.toFrame);
      const layers: [Drawable | null, number][] = [
        [out, -e * W],
        [inn, (1 - e) * W],
      ];
      for (const [img, x] of layers) {
        if (!img) continue;
        ctx.globalAlpha = 1;
        drawCover(ctx, img, W, H, x);
        for (let k = 1; k <= 8; k++) {
          ctx.globalAlpha = 0.28 * (1 - k / 9) * speed;
          drawCover(ctx, img, W, H, x + k * step);
        }
      }
      ctx.globalAlpha = 0.35 * speed;
      ctx.fillRect(0, 0, W, H);
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
