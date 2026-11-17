// Clips in the fly-through, in order. Source footage lives in media/footage/
// (not committed — originals are in the HEQA Google Drive "16:9" and "20:9" folders).
// NB: from #16 on, the 20:9 folder is numbered one lower than the 16:9 one
// (vertical #16 = landscape #17 … vertical #30 = landscape #31; landscape #16 has no vertical).
//
// landscape: 16:9 file used for desktop frames.
// portrait:  vertical file used for phone frames. Optional — without it, phone
//            frames are a 9:16 crop of the landscape file centred on focusX (0–1).
// start/end: trim, in seconds.
// quality:   optional per-clip AVIF quality override, e.g. { desktop: 40, mobile: 38 } for
//            very detailed shots (foliage, top-down) that otherwise get heavy.
// fps:       frames sampled per second. Aim for ~70–110 frames per clip:
//            slow shots can use fewer fps, fast-moving shots need more.
export const clips = [
  { id: "highlands", landscape: "01-highlands.landscape.mp4", portrait: "01-highlands.portrait.mp4", start: 0, end: 6, fps: 15 }, // L#6 / V#6
  { id: "intake", landscape: "02-intake.landscape.mp4", portrait: "02-intake.portrait.mp4", start: 5.5, end: 12.8, fps: 12, quality: { desktop: 44, mobile: 40 } }, // L#30 / V#29
  { id: "fermentation", landscape: "03-fermentation.landscape.mp4", portrait: "03-fermentation.portrait.mp4", start: 2.5, end: 11, fps: 10 }, // L#28 / V#27
  { id: "control", landscape: "04-control.landscape.mp4", portrait: "04-control.portrait.mp4", start: 0.3, end: 4.2, fps: 20 }, // L#27 / V#26
  { id: "drying-houses", landscape: "05-drying-houses.landscape.mp4", portrait: "05-drying-houses.portrait.mp4", start: 6, end: 16.8, fps: 10 }, // L#1 / V#1
  { id: "drying-room", landscape: "06-drying-room.landscape.mp4", portrait: "06-drying-room.portrait.mp4", start: 0, end: 2.28, fps: 30 }, // L#17 / V#16
  { id: "dry-mill", landscape: "07-dry-mill.landscape.mp4", portrait: "07-dry-mill.portrait.mp4", start: 0, end: 3, fps: 24 }, // L#20 / V#19
  { id: "station", landscape: "06-station.landscape.mp4", portrait: "06-station.portrait.mp4", start: 1, end: 14.9, fps: 6, quality: { desktop: 44, mobile: 38 } }, // L#5 / V#5
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
