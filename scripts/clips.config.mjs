// Clips in the fly-through, in order. Source footage lives in media/footage/
// (not committed — originals are in the HEQA Google Drive "16:9" and "20:9" folders).
//
// landscape: 16:9 file used for desktop frames.
// portrait:  vertical file used for phone frames. Optional — without it, phone
//            frames are a 9:16 crop of the landscape file centred on focusX (0–1).
// start/end: trim, in seconds.
// quality:   optional per-clip AVIF quality override, e.g. { desktop: 40, mobile: 38 } for
//            very detailed shots (foliage, top-down) that otherwise get heavy.
// fps:       frames sampled per second. Aim for ~90–110 frames per clip:
//            slow shots can use fewer fps, fast-moving shots need more.
export const clips = [
  { id: "highlands", landscape: "01-highlands.landscape.mp4", portrait: "01-highlands.portrait.mp4", start: 0, end: 6, fps: 15 }, // Drive #6
  { id: "farms", landscape: "02-farms.landscape.mp4", portrait: "02-farms.portrait.mp4", start: 2, end: 9, fps: 12, quality: { desktop: 40, mobile: 36 } }, // Drive #7
  { id: "intake", landscape: "03-intake.landscape.mp4", portrait: "03-intake.portrait.mp4", start: 3.8, end: 7.6, fps: 24 }, // Drive #12
  { id: "patio", landscape: "04-patio.landscape.mp4", portrait: "04-patio.portrait.mp4", start: 3, end: 11, fps: 11, quality: { desktop: 40, mobile: 36 } }, // Drive #9
  { id: "drying-houses", landscape: "05-drying-houses.landscape.mp4", portrait: "05-drying-houses.portrait.mp4", start: 6, end: 16.8, fps: 10 }, // Drive #1
  { id: "station", landscape: "06-station.landscape.mp4", portrait: "06-station.portrait.mp4", start: 1, end: 14.9, fps: 6, quality: { desktop: 44, mobile: 38 } }, // Drive #5
];

export const output = {
  desktop: { width: 1920, height: 1080, quality: 50 },
  // Phone frames. 9:20 matches modern phones; cover-fit handles the rest.
  mobile: { width: 720, height: 1600, quality: 50 },
  // Small preview drawn while full frames load during fast scrolling.
  preview: { every: 4, width: 480, quality: 40 },
  poster: { quality: 72 },
  // AVIF encoder effort 0–9: higher = smaller files, slower builds.
  effort: 4,
};
