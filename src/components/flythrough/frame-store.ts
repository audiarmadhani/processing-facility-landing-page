// Windowed frame loader for the scroll fly-through.
//
// - Full-resolution frames are fetched + decoded only inside a window around the
//   current position (AHEAD frames in the scroll direction, BEHIND the other way).
//   The window flips when the scroll direction reverses.
// - Frames leaving the window are released (ImageBitmap.close), so memory stays bounded.
// - Every Nth frame has a tiny preview; all previews are kept, so a fast scroll
//   always has something to draw while full frames catch up.
// - Up to MAX_INFLIGHT requests at once; frames the viewer is moving toward win
//   (distance behind counts double).

import type { FramesManifest } from "./manifest";

export type Variant = "d" | "m";
type Drawable = ImageBitmap | HTMLImageElement;

const AHEAD = 40;
const BEHIND = 16;
const MAX_INFLIGHT = 6;
const MAX_PREVIEW_INFLIGHT = 2;

const pad = (n: number) => String(n).padStart(4, "0");

async function decode(url: string, signal: AbortSignal): Promise<Drawable> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through to <img> decode (older Safari) */
    }
  }
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

function release(d: Drawable) {
  if ("close" in d) d.close();
  else URL.revokeObjectURL(d.src);
}

export class FrameStore {
  readonly total: number;
  readonly clipStart: number[] = [];
  private clipOf: Uint16Array;
  private full = new Map<number, Drawable>();
  private previews = new Map<number, Drawable>();
  private inflight = new Set<number>();
  private previewInflight = 0;
  private previewQueue: number[] = [];
  private pos = 0;
  private dir: 1 | -1 = 1;
  private abort = new AbortController();
  private destroyed = false;

  constructor(
    private manifest: FramesManifest,
    private variant: Variant,
    private onFrame: (i: number) => void,
  ) {
    let start = 0;
    for (const c of manifest.clips) {
      this.clipStart.push(start);
      start += c.frames;
    }
    this.total = start;
    this.clipOf = new Uint16Array(this.total);
    manifest.clips.forEach((c, ci) => this.clipOf.fill(ci, this.clipStart[ci], this.clipStart[ci] + c.frames));

    // Previews: queue every one, nearest the start first.
    for (let i = 0; i < this.total; i++) if (this.isPreviewFrame(i)) this.previewQueue.push(i);
  }

  private local(i: number) {
    const ci = this.clipOf[i];
    return { clip: this.manifest.clips[ci], n: i - this.clipStart[ci] };
  }

  private isPreviewFrame(i: number) {
    return this.local(i).n % this.manifest.previewEvery === 0;
  }

  private url(i: number, kind: "full" | "preview") {
    const { clip, n } = this.local(i);
    const dir = kind === "full" ? this.variant : this.variant === "d" ? "p" : "pm";
    return `${this.manifest.base}/${clip.id}/${dir}/${pad(n + 1)}.avif`;
  }

  /** Call whenever the (fractional) global frame position changes. */
  setPosition(pos: number) {
    const p = Math.max(0, Math.min(this.total - 1, pos));
    if (p > this.pos + 0.01) this.dir = 1;
    else if (p < this.pos - 0.01) this.dir = -1;
    this.pos = p;
    this.evict();
    this.pump();
  }

  private window() {
    const c = Math.round(this.pos);
    const lo = this.dir === 1 ? c - BEHIND : c - AHEAD;
    const hi = this.dir === 1 ? c + AHEAD : c + BEHIND;
    return [Math.max(0, lo), Math.min(this.total - 1, hi)] as const;
  }

  private evict() {
    const [lo, hi] = this.window();
    for (const [i, d] of this.full) {
      if (i < lo - 4 || i > hi + 4) {
        release(d);
        this.full.delete(i);
      }
    }
  }

  private pump() {
    if (this.destroyed) return;
    const [lo, hi] = this.window();
    const c = this.pos;
    while (this.inflight.size < MAX_INFLIGHT) {
      let best = -1;
      let bestScore = Infinity;
      for (let i = lo; i <= hi; i++) {
        if (this.full.has(i) || this.inflight.has(i)) continue;
        const d = i - c;
        const score = Math.sign(d) === this.dir || d === 0 ? Math.abs(d) : Math.abs(d) * 2;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best < 0) break;
      this.load(best);
    }
    while (this.previewInflight < MAX_PREVIEW_INFLIGHT && this.previewQueue.length) {
      this.loadPreview(this.previewQueue.shift()!);
    }
  }

  private load(i: number) {
    this.inflight.add(i);
    decode(this.url(i, "full"), this.abort.signal)
      .then((d) => {
        if (this.destroyed) return release(d);
        const [lo, hi] = this.window();
        if (i < lo - 4 || i > hi + 4) return release(d);
        this.full.set(i, d);
        this.onFrame(i);
      })
      .catch(() => {})
      .finally(() => {
        this.inflight.delete(i);
        this.pump();
      });
  }

  private loadPreview(i: number) {
    this.previewInflight++;
    decode(this.url(i, "preview"), this.abort.signal)
      .then((d) => {
        if (this.destroyed) return release(d);
        this.previews.set(i, d);
        this.onFrame(i);
      })
      .catch(() => {})
      .finally(() => {
        this.previewInflight--;
        this.pump();
      });
  }

  /** Best available image for frame i: full → nearest preview in the same clip → nearest full. */
  get(i: number): Drawable | null {
    i = Math.max(0, Math.min(this.total - 1, Math.round(i)));
    const exact = this.full.get(i);
    if (exact) return exact;
    const ci = this.clipOf[i];
    const start = this.clipStart[ci];
    const end = start + this.manifest.clips[ci].frames - 1;
    const every = this.manifest.previewEvery;
    const near = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        for (const j of [i - k * this.dir, i + k * this.dir]) {
          if (j < start || j > end) continue;
          const f = this.full.get(j);
          if (f) return f;
        }
      }
      return null;
    };
    // A full frame 1–2 steps away looks better than a blurry preview.
    const close = near(1, 2);
    if (close) return close;
    const base = start + Math.floor((i - start) / every) * every;
    const pv = this.previews.get(base) ?? (base + every <= end ? this.previews.get(base + every) : undefined);
    if (pv) return pv;
    return near(3, 40);
  }

  destroy() {
    this.destroyed = true;
    this.abort.abort();
    for (const d of this.full.values()) release(d);
    for (const d of this.previews.values()) release(d);
    this.full.clear();
    this.previews.clear();
  }
}
