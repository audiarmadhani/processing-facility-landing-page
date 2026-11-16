import data from "@/lib/frames-manifest.json";

export type FramesManifest = {
  version: string;
  base: string;
  previewEvery: number;
  clips: { id: string; frames: number; desktop: { w: number; h: number }; mobile: { w: number; h: number } }[];
};

export const manifest = data as FramesManifest;

export const posterUrl = (clipId: string, v: "d" | "m") => `${manifest.base}/${clipId}/poster-${v}.webp`;
