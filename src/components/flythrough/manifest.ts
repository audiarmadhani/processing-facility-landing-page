import data from "@/lib/frames-manifest.json";

/** Content shift per frame step (fraction of width/height) and zoom per step (log). */
export type Motion = { x: number; y: number; z: number };

export type FramesManifest = {
  version: string;
  base: string;
  previewEvery: number;
  clips: {
    id: string;
    frames: number;
    desktop: { w: number; h: number };
    mobile: { w: number; h: number };
    /** Camera motion at the clip's start/end, measured by scripts/analyze-motion.mjs. */
    motion?: Record<"d" | "m", { exit: Motion; entry: Motion }>;
  }[];
};

export const manifest = data as FramesManifest;

export const posterUrl = (clipId: string, v: "d" | "m") => `${manifest.base}/${clipId}/poster-${v}.webp`;
