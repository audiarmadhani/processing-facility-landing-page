// Generates stand-in "drone" clips (slow push-ins) from still photos so the
// fly-through can be built before the real footage exists.
// Usage: npm run placeholder-footage
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const stills = path.join(root, "media/stills");
const footage = path.join(root, "media/footage");
mkdirSync(footage, { recursive: true });

// [output file, still, zoom from→to, drift x/y in fraction of frame]
const shots = [
  ["01-arrival.mp4", "arrival.jpg", 1.0, 1.25, 0.0, -0.02],
  ["02-cherry.mp4", "cherry.jpg", 1.05, 1.35, 0.04, 0.0],
  ["03-sorting.mp4", "sorting.jpg", 1.0, 1.3, -0.03, 0.02],
  ["04-fermentation.mp4", "fermentation.jpg", 1.1, 1.45, 0.0, 0.03],
  ["05-drying.mp4", "drying.jpg", 1.0, 1.5, 0.0, 0.0],
  ["06-green.mp4", "green.jpg", 1.3, 1.0, 0.02, -0.02],
];

const SECONDS = 3;
const FPS = 30;
const N = SECONDS * FPS;
const W = 3840, H = 2160;

for (const [out, still, z0, z1, dx, dy] of shots) {
  const src = path.join(stills, still);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  // Normalise to a 4K 16:9 canvas, respecting EXIF orientation.
  const prepped = path.join(footage, `.${still}.png`);
  await sharp(src).rotate().resize(W, H, { fit: "cover" }).png().toFile(prepped);
  // Ease-in-out progress p in [0,1].
  const p = `(0.5-0.5*cos(PI*on/${N - 1}))`;
  const z = `(${z0}+(${z1}-${z0})*${p})`;
  const x = `(iw-iw/zoom)/2+${dx}*iw*${p}`;
  const y = `(ih-ih/zoom)/2+${dy}*ih*${p}`;
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-loop", "1", "-i", prepped,
    "-vf", `zoompan=z='${z}':x='${x}':y='${y}':d=${N}:s=1920x1080:fps=${FPS},format=yuv420p`,
    "-frames:v", String(N), "-c:v", "libx264", "-crf", "16", "-preset", "medium",
    path.join(footage, out),
  ]);
  execFileSync("rm", [prepped]);
  console.log("✓", out);
}
