// The flight spline's control points, plain ESM so Node bake scripts can
// import them without a TS loader. FlightPath.ts maps these to Vector3s;
// keep the two consumers in sync by editing ONLY this file.
export const PATH_POINTS = [
  // CH1 desk — starts ON the laptop screen (mid-send), dips over the letter
  [-0.62, 1.75, 0],
  [1.2, 1.25, 0.2],
  // rises before the wall: at y≈1.47 the plane clipped the window sill (1.6)
  [2.5, 1.5, -0.1],
  // CH2 preflight taxi past the panel
  [8, 1.7, 1.0],
  // hard climb the moment the window is cleared: at the old y≈2 the camera
  // rode BELOW the rooftops, so the empty apron of the city's ground plane
  // filled the lower frame. Higher camera pushes the frame's bottom ground
  // hit far enough out that buildings cover it.
  [16, 6.5, -1.0],
  // CH3 takeoff climb through the window line
  [24, 11, 2],
  [32, 14, -2],
  [40, 16, 3],
  // CH4 formation — S through the cloud sea
  [52, 16, 8],
  [64, 18, -8],
  [76, 17, 6],
  // CH5 storm slalom
  [86, 15, -6],
  [92, 14, 6],
  [98, 13, -6],
  [104, 12, 6],
  [110, 13, -4],
  // CH6 beacon — calm rising arc
  [122, 18, 0],
  [134, 20, -4],
  // CH7 no-fly — wide bend around red zones
  [146, 17, 8],
  [156, 15, 14],
  [166, 14, 6],
  // CH8 city dive — the canyon runs world z 0..2 (group z offset 1); the old
  // z −4 leg flew straight through the north building row
  [176, 10, 1],
  [184, 5, 0.4],
  [192, 2.2, 1.6],
  [200, 2.0, 1.0],
  // CH9 copilot climb into the starfield
  [210, 10, -2],
  [220, 20, 0],
  [230, 26, 2],
  // CH10 landing — long descent onto the runway
  [240, 16, 0],
  [250, 6, 0],
  [258, 1.2, 0],
  [266, 0.6, 0],
  [272, 0.5, 0],
];

/** First control-point index of each chapter's zone (matches the blocks). */
export const CH_START_INDEX = [0, 3, 5, 8, 11, 16, 18, 21, 25, 28];
