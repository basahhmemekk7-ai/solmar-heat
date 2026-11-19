// Shared tuning for Solmar Heat: city layout, physics, economy and screen names.
// The city is a grid of roads at fixed coordinates; every system reads the same numbers,
// so the 3D world, the traffic, the police and the minimap always agree.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-heat-save-v1';

// Roads run north-south at these X values and east-west at these Z values (metres).
export const ROAD_XS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const ROAD_ZS = [-240, -180, -120, -60, 0, 60, 120, 180, 240];
export const ROAD_W = 14;          // road width
export const BLOCK = 46;           // building block size between roads
export const CITY_R = 285;         // half-size of the ground plane
export const BEACH_Z = 268;        // sand starts here (south edge)
export const WATER_Z = 292;        // water plane starts here

export const WALK_SPEED = 4.2;
export const SPRINT_SPEED = 7.2;
export const CAR_TOP_SPEED = 34;   // m/s, ~122 km/h
export const CAR_ACCEL = 16;
export const CAR_BRAKE = 26;

export const START_MONEY = 250;
export const REPAIR_COST = 100;
export const BUST_FINE = 200;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'pause';
export const SCREEN_OVER = 'over';
export const SCREEN_HELP = 'help';

// Named places the missions and the minimap share (x, z in metres).
export const PLACES = {
  start:        { x: -8,  z: 30,  label: 'Safehouse' },
  club:         { x: 186, z: -54, label: 'Club Mirage' },
  fixerYard:    { x: -186, z: 186, label: "Fixer's Yard" },
  garage:       { x: 126, z: 186, label: "Pay 'n Spray" },
  marina:       { x: 240, z: 246, label: 'Marina' },
  hospital:     { x: -126, z: -186, label: 'Solmar General' },
  policeHQ:     { x: 126, z: -126, label: 'Police HQ' },
  park:         { x: -150, z: -90, label: 'Palm Park' },
  lookout:      { x: -240, z: 240, label: 'Lookout Point' },
  warehouse:    { x: -60, z: -240, label: 'Warehouse Row' },
};

// Pastel Miami-style palette for buildings, cars and clothes.
export const BUILDING_COLORS = [0xf5ead9, 0xffd9c0, 0xcfe8ef, 0xffe9a8, 0xd9e8c9, 0xf2c6d8, 0xd8d3f0, 0xffffff, 0xe8dcc8, 0xbfe3d0];
export const CAR_COLORS = [0xd23c3c, 0x2e6fd8, 0xe8b93c, 0x3ca86b, 0xe8e8e8, 0x222831, 0x8a4fd8, 0xff7a29, 0x3cc8d8, 0xc0c8d0];
export const SHIRT_COLORS = [0xd23c3c, 0x2e6fd8, 0xe8b93c, 0x3ca86b, 0x8a4fd8, 0xff7a29, 0x3cc8d8, 0xf2f2f2, 0x222831, 0xff9ec6];

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
// Shortest signed angle between two headings.
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
