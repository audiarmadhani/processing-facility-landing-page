// Maps scroll progress to "what to draw".
// The scroll track is a sequence of segments, measured in timeline units:
//   [clip 0 frames][transition][clip 1 frames][transition]...
// One unit ≈ one frame, so every clip scrolls at the same speed.

import type { FramesManifest } from "./manifest";

export const TRANSITION_UNITS = 16;

export type Segment =
  | { kind: "clip"; clip: number; start: number; length: number; globalStart: number; frames: number }
  | { kind: "transition"; from: number; to: number; start: number; length: number; fromFrame: number; toFrame: number };

export type Sample =
  | { kind: "clip"; clip: number; frame: number; local: number }
  | { kind: "transition"; from: number; to: number; fromFrame: number; toFrame: number; t: number };

export function buildTimeline(m: FramesManifest) {
  const segments: Segment[] = [];
  let u = 0;
  let g = 0;
  m.clips.forEach((c, ci) => {
    if (ci > 0) {
      segments.push({ kind: "transition", from: ci - 1, to: ci, start: u, length: TRANSITION_UNITS, fromFrame: g - 1, toFrame: g });
      u += TRANSITION_UNITS;
    }
    // A clip of N frames spans N-1 units (frame 0 at its start, frame N-1 at its end).
    segments.push({ kind: "clip", clip: ci, start: u, length: c.frames - 1, globalStart: g, frames: c.frames });
    u += c.frames - 1;
    g += c.frames;
  });
  return { segments, units: u };
}

export function sample(segments: Segment[], u: number): Sample {
  for (const s of segments) {
    if (u <= s.start + s.length || s === segments[segments.length - 1]) {
      const local = Math.max(0, Math.min(1, (u - s.start) / s.length || 0));
      if (s.kind === "clip") {
        const f = local * (s.frames - 1);
        return { kind: "clip", clip: s.clip, frame: s.globalStart + f, local };
      }
      return { kind: "transition", from: s.from, to: s.to, fromFrame: s.fromFrame, toFrame: s.toFrame, t: local };
    }
  }
  throw new Error("empty timeline");
}
