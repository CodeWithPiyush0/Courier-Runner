// Tube geometry. The tube is an octagon: one flat lane per side.
export const LANES = 8;
export const LANE_ANGLE = (Math.PI * 2) / LANES;
export const TUBE_RADIUS = 5; // centre of the tube to the middle of a lane
export const LANE_WIDTH = 2 * TUBE_RADIUS * Math.tan(Math.PI / LANES);
export const CORNER_RADIUS = TUBE_RADIUS / Math.cos(Math.PI / LANES);
export const SEGMENT_LENGTH = 10;
export const SEGMENT_COUNT = 16;

// Speed, in world units (≈ metres) per second.
export const SPEED_IDLE = 8;
export const SPEED_START = 20;
export const SPEED_MAX = 46;
export const SPEED_GAIN = 0.012; // added per metre travelled
export const DIFFICULTY_DISTANCE = 2500; // metres until full difficulty

// Player movement.
export const HOVER_HEIGHT = 0.35;
export const SLIDE_TIME = 0.7;
export const FLIP_TIME = 0.6;
export const FLIP_COOLDOWN = 2;

// Zones. The run starts in space and alternates with the ocean.
export const FIRST_ZONE_LENGTH = 650; // metres of space before the first hull breach
export const ZONE_LENGTH = [700, 1000]; // later zones (min, max metres)
export const ZONE_CLEARANCE = 60; // empty track before each zone gate
export const ZONE_PHYSICS = {
  space: { speedFactor: 1, gravity: 32, jumpVelocity: 11, laneSpeed: 14 },
  water: { speedFactor: 0.78, gravity: 15, jumpVelocity: 8.2, laneSpeed: 9 }, // slower, floaty
};

// Oxygen, underwater only. Full tank lasts 1 / OXYGEN_DRAIN seconds.
export const OXYGEN_DRAIN = 1 / 22;
export const OXYGEN_PER_BUBBLE = 0.1;
export const OXYGEN_LOW = 0.3;

// Getting zapped by a laser: you slow down and security catches up.
export const STUMBLE_TIME = 0.8;
export const STUMBLE_SLOWDOWN = 0.45; // fraction of speed lost at the moment of the zap
export const HIT_GRACE = 0.5; // seconds of invulnerability after a zap or a shield break

// The chaser (security drone in space, anglerfish underwater).
// `chase` runs 0 (far behind) to 1 (on your tail).
export const CHASER_START = 0.9;
export const CHASER_DANGER = 0.35; // a zap while chase is above this = caught
export const CHASER_HOLD = 1.2; // seconds it stays on your tail after a zap
export const CHASER_DECAY = 0.13; // chase lost per second

// Power-ups.
export const POWER_DURATION = { magnet: 8, shield: 12, boost: 4 };
export const POWER_FIRST = 200; // metres before the first one
export const POWER_EVERY = [300, 500]; // metres between later ones (min, max)
export const MAGNET_RANGE = 16;
export const MAGNET_PULL = 90; // units per second a pulled coin flies
export const BOOST_SPEED = 24; // added to the current speed

// Spawning.
export const SPAWN_AHEAD = 140;
export const FIRST_ROW_DISTANCE = 60;

// Position an object on the tube wall. Objects are modelled with y = up from
// the floor, so rotating by the lane angle stands them on that lane.
export function placeOnWall(object, lane, height, z) {
  const angle = lane * LANE_ANGLE;
  const r = TUBE_RADIUS - height;
  object.position.set(Math.sin(angle) * r, -Math.cos(angle) * r, z);
  object.rotation.z = angle;
}

export function wrapLane(lane) {
  return ((Math.round(lane) % LANES) + LANES) % LANES;
}
