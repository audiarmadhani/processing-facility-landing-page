// Order of clips in the fly-through. Drop real drone footage into media/footage/
// using these file names (or edit them) and run `npm run frames`.
//
// focusX: horizontal centre (0–1) of the 9:16 phone crop.
// fps:    frames sampled per second of footage. ~24 is smooth; lower = lighter.
export const clips = [
  { id: "arrival", file: "01-arrival.mp4", fps: 24, focusX: 0.5 },
  { id: "cherry", file: "02-cherry.mp4", fps: 24, focusX: 0.55 },
  { id: "sorting", file: "03-sorting.mp4", fps: 24, focusX: 0.5 },
  { id: "fermentation", file: "04-fermentation.mp4", fps: 24, focusX: 0.45 },
  { id: "drying", file: "05-drying.mp4", fps: 24, focusX: 0.5 },
  { id: "green", file: "06-green.mp4", fps: 24, focusX: 0.4 },
];

export const output = {
  desktop: { width: 1920, height: 1080, quality: 50 },
  // 9:16 centre crop; never upscaled beyond the source's height.
  mobile: { width: 864, height: 1536, quality: 50 },
  // Small preview drawn while full frames load during fast scrolling.
  preview: { every: 4, width: 480, quality: 40 },
  poster: { quality: 70 },
};
