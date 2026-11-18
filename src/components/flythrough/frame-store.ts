// Two-tier frame loader for the scroll fly-through.
//
// Tier 1 — compressed blobs (~20–60 KB each): fetched well ahead of the viewer
//   (FETCH_AHEAD frames in the scroll direction, which covers the next chapter
//   while someone reads the current caption). Bounded by BLOB_BUDGET bytes.
// Tier 2 — decoded bitmaps (several MB each): only a small window around the
//   current position (DECODE_AHEAD / DECODE_BEHIND), plus around a "hint" — the
//   frame a snap glide is heading to, so the landing frame is sharp first.
//   Everything outside is released, which keeps memory and GPU pressure low.
//
// Previews (tiny frames, every Nth) follow the same idea: fetched nearest-first,
// decoded only near the viewer, so a fast scroll always has something to draw.

import type { FramesManifest } from "./manifest";

export type Variant = "d" | "m";
export type Drawable = ImageBitmap | HTMLImageElement;

const FETCH_AHEAD = 120;
const FETCH_BEHIND = 30;
const DECODE_AHEAD = 12;
const DECODE_BEHIND = 4;
const HINT_DECODE = 6; // frames decoded around a glide destination
const PREVIEW_DECODE_RADIUS = 48;
const PREVIEW_KEEP_RADIUS = 96;
const PREVIEW_FETCH_RADIUS = 240;
const MAX_FETCH = 6;
const MAX_PREVIEW_FETCH = 2;
const MAX_DECODE = 2;
const BLOB_BUDGET = 48 * 1024 * 1024;

const pad = (n: number) => String(n).padStart(4, "0");

async function decodeBlob(blob: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* older Safari: fall through */
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
  /** Counts of what get() could serve (exact / nearby / preview / nothing). For ?debug. */
  readonly stats = { exact: 0, near: 0, preview: 0, miss: 0 };

  private clipOf: Uint16Array;
  private isPreview: Uint8Array;
  // full frames
  private blobs = new Map<number, Blob>();
  private blobBytes = 0;
  private fetching = new Set<number>();
  private full = new Map<number, Drawable>();
  private decoding = new Set<number>();
  // previews
  private pBlobs = new Map<number, Blob>();
  private pFetching = new Set<number>();
  private previews = new Map<number, Drawable>();
  private pDecoding = new Set<number>();

  private pos = 0;
  private dir: 1 | -1 = 1;
  private hintPos: number | null = null;
  private abort = new AbortController();
  private destroyed = false;
  private scheduled = false;

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
    this.isPreview = new Uint8Array(this.total);
    manifest.clips.forEach((c, ci) => {
      const s = this.clipStart[ci];
      this.clipOf.fill(ci, s, s + c.frames);
      for (let n = 0; n < c.frames; n += manifest.previewEvery) this.isPreview[s + n] = 1;
    });
    this.schedule();
  }

  private url(i: number, kind: "full" | "preview") {
    const ci = this.clipOf[i];
    const n = i - this.clipStart[ci];
    const dir = kind === "full" ? this.variant : this.variant === "d" ? "p" : "pm";
    return `${this.manifest.base}/${this.manifest.clips[ci].id}/${dir}/${pad(n + 1)}.avif`;
  }

  /** Call whenever the (fractional) global frame position changes. */
  setPosition(pos: number) {
    const p = Math.max(0, Math.min(this.total - 1, pos));
    if (p > this.pos + 0.01) this.dir = 1;
    else if (p < this.pos - 0.01) this.dir = -1;
    this.pos = p;
    if (this.hintPos !== null && Math.abs(this.hintPos - p) < 2) this.hintPos = null;
    this.schedule();
  }

  /** Tell the store where a glide will land, so those frames are decoded first. */
  hint(pos: number | null) {
    this.hintPos = pos === null ? null : Math.max(0, Math.min(this.total - 1, pos));
    this.schedule();
  }

  // Batch pump calls to once per task: setPosition runs every animation frame.
  private schedule() {
    if (this.scheduled || this.destroyed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.pump();
    });
  }

  /** Signed distance cost: frames behind the direction of travel count double. */
  private cost(i: number, from: number) {
    const d = i - from;
    return Math.sign(d) === this.dir || d === 0 ? Math.abs(d) : Math.abs(d) * 2;
  }

  private inRange(i: number, from: number, ahead: number, behind: number) {
    const d = (i - from) * this.dir;
    return d >= -behind && d <= ahead;
  }

  private wantDecoded(i: number) {
    if (this.inRange(i, this.pos, DECODE_AHEAD, DECODE_BEHIND)) return true;
    return this.hintPos !== null && Math.abs(i - this.hintPos) <= HINT_DECODE;
  }

  private pump() {
    if (this.destroyed) return;
    const c = Math.round(this.pos);
    const h = this.hintPos === null ? null : Math.round(this.hintPos);

    // 1. Release decoded frames we no longer need.
    for (const [i, d] of this.full) {
      if (!this.wantDecoded(i) && !this.inRange(i, this.pos, DECODE_AHEAD + 3, DECODE_BEHIND + 3)) {
        release(d);
        this.full.delete(i);
      }
    }
    for (const [i, d] of this.previews) {
      if (Math.abs(i - this.pos) > PREVIEW_KEEP_RADIUS && (h === null || Math.abs(i - h) > PREVIEW_KEEP_RADIUS)) {
        release(d);
        this.previews.delete(i);
      }
    }

    // 2. Decode: frames in the decode windows that are downloaded.
    if (this.decoding.size < MAX_DECODE) {
      const cand: [number, number][] = [];
      const consider = (i: number, score: number) => {
        if (i < 0 || i >= this.total || this.full.has(i) || this.decoding.has(i) || !this.blobs.has(i)) return;
        cand.push([score, i]);
      };
      for (let i = c - DECODE_AHEAD; i <= c + DECODE_AHEAD; i++) if (this.wantDecoded(i)) consider(i, this.cost(i, c));
      if (h !== null) for (let i = h - HINT_DECODE; i <= h + HINT_DECODE; i++) consider(i, Math.abs(i - h) * 0.5);
      cand.sort((a, b) => a[0] - b[0]);
      for (const [, i] of cand) {
        if (this.decoding.size >= MAX_DECODE) break;
        this.decode(i);
      }
    }
    // Previews near the viewer (cheap).
    if (this.pDecoding.size < 2) {
      let best = -1;
      let bestD = Infinity;
      for (const i of this.pBlobs.keys()) {
        if (this.previews.has(i) || this.pDecoding.has(i)) continue;
        const d = Math.min(Math.abs(i - this.pos), h === null ? Infinity : Math.abs(i - h));
        if (d <= PREVIEW_DECODE_RADIUS && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) this.decodePreview(best);
    }

    // 3. Fetch full frames: decode windows first, then the hint, then far ahead.
    if (this.fetching.size < MAX_FETCH) {
      const want: [number, number][] = [];
      const lo = Math.max(0, c - (this.dir === 1 ? FETCH_BEHIND : FETCH_AHEAD));
      const hi = Math.min(this.total - 1, c + (this.dir === 1 ? FETCH_AHEAD : FETCH_BEHIND));
      for (let i = lo; i <= hi; i++) {
        if (this.blobs.has(i) || this.fetching.has(i)) continue;
        const base = this.cost(i, c);
        want.push([this.wantDecoded(i) ? base - 1000 : base, i]);
      }
      if (h !== null)
        for (let i = Math.max(0, h - HINT_DECODE); i <= Math.min(this.total - 1, h + HINT_DECODE); i++)
          if (!this.blobs.has(i) && !this.fetching.has(i)) want.push([-2000 + Math.abs(i - h), i]);
      want.sort((a, b) => a[0] - b[0]);
      for (const [, i] of want) {
        if (this.fetching.size >= MAX_FETCH) break;
        if (!this.fetching.has(i)) this.fetch(i);
      }
    }
    // Previews: nearest first.
    if (this.pFetching.size < MAX_PREVIEW_FETCH) {
      for (let r = 0; r <= PREVIEW_FETCH_RADIUS && this.pFetching.size < MAX_PREVIEW_FETCH; r++) {
        for (const i of [c + r * this.dir, c - r * this.dir]) {
          if (i < 0 || i >= this.total || !this.isPreview[i] || this.pBlobs.has(i) || this.pFetching.has(i)) continue;
          this.fetchPreview(i);
          if (this.pFetching.size >= MAX_PREVIEW_FETCH) break;
        }
      }
    }

    // 4. Keep compressed frames under budget: drop the ones farthest from the viewer.
    if (this.blobBytes > BLOB_BUDGET) {
      const far = [...this.blobs.keys()].sort((a, b) => Math.abs(b - c) - Math.abs(a - c));
      for (const i of far) {
        if (this.blobBytes <= BLOB_BUDGET * 0.9) break;
        if (this.wantDecoded(i)) continue;
        this.blobBytes -= this.blobs.get(i)!.size;
        this.blobs.delete(i);
      }
    }
  }

  private fetch(i: number) {
    this.fetching.add(i);
    fetch(this.url(i, "full"), { signal: this.abort.signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then((b) => {
        if (this.destroyed) return;
        this.blobs.set(i, b);
        this.blobBytes += b.size;
      })
      .catch(() => {})
      .finally(() => {
        this.fetching.delete(i);
        this.schedule();
      });
  }

  private decode(i: number) {
    const blob = this.blobs.get(i);
    if (!blob) return;
    this.decoding.add(i);
    decodeBlob(blob)
      .then((d) => {
        if (this.destroyed || !this.wantDecoded(i)) return release(d);
        this.full.set(i, d);
        this.onFrame(i);
      })
      .catch(() => {})
      .finally(() => {
        this.decoding.delete(i);
        this.schedule();
      });
  }

  private fetchPreview(i: number) {
    this.pFetching.add(i);
    fetch(this.url(i, "preview"), { signal: this.abort.signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
      .then((b) => {
        if (!this.destroyed) this.pBlobs.set(i, b);
      })
      .catch(() => {})
      .finally(() => {
        this.pFetching.delete(i);
        this.schedule();
      });
  }

  private decodePreview(i: number) {
    const blob = this.pBlobs.get(i);
    if (!blob) return;
    this.pDecoding.add(i);
    decodeBlob(blob)
      .then((d) => {
        if (this.destroyed) return release(d);
        this.previews.set(i, d);
        this.onFrame(i);
      })
      .catch(() => {})
      .finally(() => {
        this.pDecoding.delete(i);
        this.schedule();
      });
  }

  /** The decoded full frame i, or null. */
  exact(i: number): Drawable | null {
    return this.full.get(i) ?? null;
  }

  /** Best available image for frame i: full → nearby full → preview → farther full. */
  get(i: number): Drawable | null {
    i = Math.max(0, Math.min(this.total - 1, Math.round(i)));
    const exact = this.full.get(i);
    if (exact) {
      this.stats.exact++;
      return exact;
    }
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
    const close = near(1, 2);
    if (close) {
      this.stats.near++;
      return close;
    }
    const base = start + Math.floor((i - start) / every) * every;
    const pv = this.previews.get(base) ?? (base + every <= end ? this.previews.get(base + every) : undefined);
    if (pv) {
      this.stats.preview++;
      return pv;
    }
    const far = near(3, 40);
    if (far) this.stats.near++;
    else this.stats.miss++;
    return far;
  }

  destroy() {
    this.destroyed = true;
    this.abort.abort();
    for (const d of this.full.values()) release(d);
    for (const d of this.previews.values()) release(d);
    this.full.clear();
    this.previews.clear();
    this.blobs.clear();
    this.pBlobs.clear();
  }
}
