// Turns media/footage/*.mp4 into AVIF image sequences for the scroll fly-through.
//
//   public/frames/<version>/<clip>/d/0001.avif   1920×1080 desktop frames
//   public/frames/<version>/<clip>/m/0001.avif   864×1536 phone frames (9:16 crop)
//   public/frames/<version>/<clip>/p/0001.avif   tiny previews (every Nth frame, landscape)
//   public/frames/<version>/<clip>/pm/0001.avif  tiny previews (every Nth frame, portrait)
//   public/frames/<version>/<clip>/poster-d.webp / poster-m.webp
//   src/lib/frames-manifest.json                 what the browser reads
//
// Usage: npm run frames            (all clips)
//        npm run frames -- drying  (only re-encode one clip, keeps the rest)
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
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "csv=p=0", file,
  ]).toString().trim();
  const [width, height] = out.split(",").map(Number);
  return { width, height };
}

const manifestClips = [];
let totalBytes = { d: 0, m: 0 };

for (const clip of clips) {
  const src = path.join(footageDir, clip.file);
  const clipOut = path.join(outRoot, clip.id);

  // Reuse previous encode for clips not requested this run.
  if (only.length && !only.includes(clip.id) && prev) {
    const old = prev.clips.find((c) => c.id === clip.id);
    if (old) {
      cpSync(path.join(framesRoot, prev.version, clip.id), clipOut, { recursive: true });
      manifestClips.push(old);
      console.log(`↺ ${clip.id} (reused)`);
      continue;
    }
  }
  if (!existsSync(src)) throw new Error(`Missing footage: ${src}`);

  const { width: sw, height: sh } = probe(src);
  const tmp = path.join(tmpdir(), `frames-${clip.id}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  // 1. Extract lossless frames at the target sample rate.
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-i", src,
    "-vf", `fps=${clip.fps}`, "-pix_fmt", "rgb24", path.join(tmp, "%04d.png"),
  ]);
  const files = readdirSync(tmp).filter((f) => f.endsWith(".png")).sort();
  const count = files.length;

  for (const d of ["d", "m", "p", "pm"]) mkdirSync(path.join(clipOut, d), { recursive: true });

  // 9:16 crop window inside the source frame.
  const cropW = Math.min(sw, Math.round((sh * 9) / 16));
  const cropLeft = Math.round(Math.min(sw - cropW, Math.max(0, clip.focusX * sw - cropW / 2)));
  const mobileH = Math.min(output.mobile.height, sh);
  const mobileW = Math.round((mobileH * 9) / 16);

  const { desktop, mobile, preview } = output;
  await pool(files, async (f) => {
    const n = Number(f.slice(0, 4));
    const name = `${pad(n)}.avif`;
    const input = path.join(tmp, f);
    const base = sharp(input);
    const d = await base.clone().resize(desktop.width, desktop.height, { fit: "cover" })
      .avif({ quality: desktop.quality, effort: 4 }).toFile(path.join(clipOut, "d", name));
    const m = await base.clone().extract({ left: cropLeft, top: 0, width: cropW, height: sh })
      .resize(mobileW, mobileH).avif({ quality: mobile.quality, effort: 4 })
      .toFile(path.join(clipOut, "m", name));
    totalBytes.d += d.size;
    totalBytes.m += m.size;
    if ((n - 1) % preview.every === 0) {
      await base.clone().resize(preview.width, Math.round((preview.width * 9) / 16), { fit: "cover" })
        .avif({ quality: preview.quality, effort: 4 }).toFile(path.join(clipOut, "p", name));
      await base.clone().extract({ left: cropLeft, top: 0, width: cropW, height: sh })
        .resize(Math.round((preview.width * 9) / 16), preview.width)
        .avif({ quality: preview.quality, effort: 4 }).toFile(path.join(clipOut, "pm", name));
    }
  });

  // Posters: the clip's first frame, used for reduced-motion mode and as the LCP image.
  const first = path.join(tmp, files[0]);
  await sharp(first).resize(desktop.width, desktop.height, { fit: "cover" })
    .webp({ quality: output.poster.quality }).toFile(path.join(clipOut, "poster-d.webp"));
  await sharp(first).extract({ left: cropLeft, top: 0, width: cropW, height: sh })
    .resize(mobileW, mobileH).webp({ quality: output.poster.quality })
    .toFile(path.join(clipOut, "poster-m.webp"));

  rmSync(tmp, { recursive: true, force: true });
  manifestClips.push({
    id: clip.id,
    frames: count,
    desktop: { w: desktop.width, h: desktop.height },
    mobile: { w: mobileW, h: mobileH },
  });
  console.log(`✓ ${clip.id}: ${count} frames`);
}

// Drop older versions.
for (const dir of readdirSync(framesRoot)) {
  if (dir !== version) rmSync(path.join(framesRoot, dir), { recursive: true, force: true });
}

const manifest = {
  version,
  base: `/frames/${version}`,
  previewEvery: output.preview.every,
  clips: manifestClips,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const total = manifestClips.reduce((s, c) => s + c.frames, 0);
const kb = (b) => (b / 1024).toFixed(0);
console.log(`\n${total} frames → ${path.relative(root, outRoot)}`);
if (!only.length) {
  console.log(`avg desktop frame ${kb(totalBytes.d / total)} KB, avg phone frame ${kb(totalBytes.m / total)} KB`);
}
