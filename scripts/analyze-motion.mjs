// Measures each clip's camera motion at its end (and start), so the transition
// between clips can continue the outgoing shot's own movement.
//
// For two frames a few steps apart it finds the global transform
// (shift dx/dy + zoom about the centre) that best maps the earlier frame onto the
// later one, by brute-force search on tiny greyscale frames (coarse → fine).
// Results are written into src/lib/frames-manifest.json as clip.motion:
//   { d: { exit, entry }, m: { exit, entry } }   (d = desktop source, m = phone source)
//   each { x, y, z }: x/y = content shift per frame step as a fraction of frame
//   width/height (+x = content moves right, +y = down); z = zoom per step (+ = push in).
//
// Usage: npm run motion   (runs automatically at the end of `npm run frames`)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { clips } from "./clips.config.mjs";

const root = path.resolve(import.meta.dirname, "..");
const footageDir = path.join(root, "media/footage");
const manifestPath = path.join(root, "src/lib/frames-manifest.json");

const GAP = 6; // compare frames this many sampled steps apart

function grab(file, t, w, h) {
  const buf = execFileSync("ffmpeg", [
    "-nostdin", "-v", "error", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1",
    "-vf", `scale=${w}:${h}:flags=area,format=gray`, "-f", "rawvideo", "-",
  ]);
  return Float32Array.from(buf);
}

function duration(file) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
}

// Mean abs difference between b and a warped by (s, dx, dy); bilinear sampling.
function cost(a, b, w, h, s, dx, dy) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const m = Math.round(Math.min(w, h) * 0.12);
  let sum = 0;
  let n = 0;
  for (let y = m; y < h - m; y++) {
    for (let x = m; x < w - m; x++) {
      const ax = (x - cx - dx) / s + cx;
      const ay = (y - cy - dy) / s + cy;
      const x0 = Math.floor(ax);
      const y0 = Math.floor(ay);
      if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
      const fx = ax - x0;
      const fy = ay - y0;
      const i = y0 * w + x0;
      const v = a[i] * (1 - fx) * (1 - fy) + a[i + 1] * fx * (1 - fy) + a[i + w] * (1 - fx) * fy + a[i + w + 1] * fx * fy;
      sum += Math.abs(v - b[y * w + x]);
      n++;
    }
  }
  return n ? sum / n : Infinity;
}

function search(a, b, w, h, center, range) {
  let best = { ...center, c: Infinity };
  for (const s of range.s.map((d) => center.s * d))
    for (const dx of range.d.map((d) => center.dx + d))
      for (const dy of range.d.map((d) => center.dy + d)) {
        const c = cost(a, b, w, h, s, dx, dy);
        if (c < best.c) best = { s, dx, dy, c };
      }
  return best;
}

const lin = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

/** Global transform from frame at t0 to frame at t1, at two resolutions. */
function estimate(file, t0, t1, W, H) {
  const cw = W / 2, ch = H / 2;
  const a1 = grab(file, t0, cw, ch), b1 = grab(file, t1, cw, ch);
  const coarse = search(a1, b1, cw, ch, { s: 1, dx: 0, dy: 0 }, { s: lin(0.88, 1.12, 17), d: lin(-10, 10, 21) });
  const a2 = grab(file, t0, W, H), b2 = grab(file, t1, W, H);
  const fine = search(a2, b2, W, H, { s: coarse.s, dx: coarse.dx * 2, dy: coarse.dy * 2 }, { s: lin(0.99, 1.01, 5), d: lin(-1.5, 1.5, 7) });
  return { dx: fine.dx / W, dy: fine.dy / H, z: Math.log(fine.s) };
}

const round = (v) => Math.round(v * 1e5) / 1e5;

function measure(file, clip, W, H) {
  const step = 1 / clip.fps;
  const start = clip.start ?? 0;
  const end = Math.min(clip.end ?? Infinity, duration(file) - 0.05);
  const span = GAP * step;
  const per = (m) => ({ x: round(m.dx / GAP), y: round(m.dy / GAP), z: round(m.z / GAP) });
  return {
    exit: per(estimate(file, end - span - step, end - step, W, H)),
    entry: per(estimate(file, start + step, start + step + span, W, H)),
  };
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const c of manifest.clips) {
  const clip = clips.find((x) => x.id === c.id);
  if (!clip) continue;
  const land = path.join(footageDir, clip.landscape);
  const port = clip.portrait ? path.join(footageDir, clip.portrait) : land;
  if (!existsSync(land)) {
    console.log(`– ${c.id}: footage missing, keeping previous motion`);
    continue;
  }
  c.motion = { d: measure(land, clip, 128, 72), m: measure(port, clip, 72, 160) };
  const f = (m) => `x ${(m.x * 100).toFixed(2)}% y ${(m.y * 100).toFixed(2)}% zoom ${(m.z * 100).toFixed(2)}%`;
  console.log(`✓ ${c.id.padEnd(14)} exit: ${f(c.motion.d.exit)}   entry: ${f(c.motion.d.entry)}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
