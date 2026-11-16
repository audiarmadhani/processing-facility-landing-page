// Turns media/footage/* into AVIF image sequences for the scroll fly-through.
//
//   public/frames/<version>/<clip>/d/0001.avif   desktop frames (from the landscape file)
//   public/frames/<version>/<clip>/m/0001.avif   phone frames (from the portrait file, or a crop)
//   public/frames/<version>/<clip>/p|pm/…        tiny previews of every Nth frame
//   public/frames/<version>/<clip>/poster-d.webp / poster-m.webp
//   src/lib/frames-manifest.json                 what the browser reads
//
// Usage: npm run frames            (all clips)
//        npm run frames -- patio   (re-encode one clip, reuse the rest)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir, availableParallelism } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { clips, output } from "./clips.config.mjs";

const root = path.resolve(import.meta.dirname, "..");
const footageDir = path.join(root, "media/footage");
const framesRoot = path.join(root, "public/frames");
const manifestPath = path.join(root, "src/lib/frames-manifest.json");
const only = process.argv.slice(2);

const version = `v${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;
const outRoot = path.join(framesRoot, version);
mkdirSync(outRoot, { recursive: true });

const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const pad = (n) => String(n).padStart(4, "0");
const CONCURRENCY = Math.max(2, availableParallelism() - 1);
const { desktop, mobile, preview, effort } = output;
sharp.concurrency(1);

async function pool(items, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

function probe(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file,
  ]).toString().trim();
  const [width, height] = out.split(",").map(Number);
  return { width, height };
}

/** Extracts frames [start,end) at fps into dir as PNGs; returns sorted paths. */
function extract(file, clip, dir) {
  mkdirSync(dir, { recursive: true });
  const trim = [];
  if (clip.start != null) trim.push("-ss", String(clip.start));
  if (clip.end != null) trim.push("-to", String(clip.end));
  execFileSync("ffmpeg", [
    "-nostdin", "-loglevel", "error", ...trim, "-i", file,
    "-vf", `fps=${clip.fps}`, "-pix_fmt", "rgb24", path.join(dir, "%04d.png"),
  ]);
  return readdirSync(dir).filter((f) => f.endsWith(".png")).sort().map((f) => path.join(dir, f));
}

const manifestClips = [];
const bytes = { d: 0, m: 0 };
let encoded = 0;

for (const clip of clips) {
  const clipOut = path.join(outRoot, clip.id);

  if (only.length && !only.includes(clip.id) && prev) {
    const old = prev.clips.find((c) => c.id === clip.id);
    if (old) {
      cpSync(path.join(framesRoot, prev.version, clip.id), clipOut, { recursive: true });
      manifestClips.push(old);
      console.log(`↺ ${clip.id} (reused)`);
      continue;
    }
  }

  const land = path.join(footageDir, clip.landscape);
  const port = clip.portrait ? path.join(footageDir, clip.portrait) : null;
  for (const f of [land, port]) if (f && !existsSync(f)) throw new Error(`Missing footage: ${f}`);

  const tmp = path.join(tmpdir(), `frames-${clip.id}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  const landFrames = extract(land, clip, path.join(tmp, "l"));
  const portFrames = port ? extract(port, clip, path.join(tmp, "p")) : null;
  const count = portFrames ? Math.min(landFrames.length, portFrames.length) : landFrames.length;

  // Phone source: either the portrait file (cover-fit) or a 9:16 crop of the landscape.
  const src = probe(land);
  const cropW = Math.min(src.width, Math.round((src.height * 9) / 16));
  const cropLeft = Math.round(Math.min(src.width - cropW, Math.max(0, (clip.focusX ?? 0.5) * src.width - cropW / 2)));
  const phone = (input) =>
    portFrames
      ? sharp(input)
      : sharp(input).extract({ left: cropLeft, top: 0, width: cropW, height: src.height });

  for (const d of ["d", "m", "p", "pm"]) mkdirSync(path.join(clipOut, d), { recursive: true });
  const pvH = Math.round((preview.width * 9) / 16);
  const pmW = Math.round((preview.width * mobile.width) / mobile.height);

  await pool([...Array(count).keys()], async (k) => {
    const name = `${pad(k + 1)}.avif`;
    const l = landFrames[k];
    const p = portFrames ? portFrames[k] : l;
    const d = await sharp(l).resize(desktop.width, desktop.height, { fit: "cover" })
      .avif({ quality: clip.quality?.desktop ?? desktop.quality, effort }).toFile(path.join(clipOut, "d", name));
    const m = await phone(p).resize(mobile.width, mobile.height, { fit: "cover" })
      .avif({ quality: clip.quality?.mobile ?? mobile.quality, effort }).toFile(path.join(clipOut, "m", name));
    bytes.d += d.size;
    bytes.m += m.size;
    if (k % preview.every === 0) {
      await sharp(l).resize(preview.width, pvH, { fit: "cover" })
        .avif({ quality: preview.quality, effort }).toFile(path.join(clipOut, "p", name));
      await phone(p).resize(pmW, preview.width, { fit: "cover" })
        .avif({ quality: preview.quality, effort }).toFile(path.join(clipOut, "pm", name));
    }
  });

  // Posters (first frame): first paint, reduced-motion mode, social previews.
  await sharp(landFrames[0]).resize(desktop.width, desktop.height, { fit: "cover" })
    .webp({ quality: output.poster.quality }).toFile(path.join(clipOut, "poster-d.webp"));
  await phone(portFrames ? portFrames[0] : landFrames[0]).resize(mobile.width, mobile.height, { fit: "cover" })
    .webp({ quality: output.poster.quality }).toFile(path.join(clipOut, "poster-m.webp"));

  rmSync(tmp, { recursive: true, force: true });
  encoded += count;
  manifestClips.push({
    id: clip.id,
    frames: count,
    desktop: { w: desktop.width, h: desktop.height },
    mobile: { w: mobile.width, h: mobile.height },
  });
  console.log(`✓ ${clip.id}: ${count} frames`);
}

for (const dir of readdirSync(framesRoot)) {
  if (dir !== version) rmSync(path.join(framesRoot, dir), { recursive: true, force: true });
}

writeFileSync(
  manifestPath,
  JSON.stringify({ version, base: `/frames/${version}`, previewEvery: preview.every, clips: manifestClips }, null, 2) + "\n",
);

const total = manifestClips.reduce((s, c) => s + c.frames, 0);
console.log(`\n${total} frames → ${path.relative(root, outRoot)}`);
if (encoded) {
  const kb = (b) => (b / 1024).toFixed(0);
  console.log(`avg desktop frame ${kb(bytes.d / encoded)} KB, avg phone frame ${kb(bytes.m / encoded)} KB`);
}
