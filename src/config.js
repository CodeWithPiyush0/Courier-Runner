// The world has two kinds of zone:
// - road: a flat road with 3 lanes (-1, 0, 1), through Bihar traffic;
// - tunnel: a nala / underpass shortcut, an octagonal tube with one lane per
//   side, where Bholu can ride the walls and flip to the ceiling.
// Both share the same floor height and lane numbers, so lanes -1, 0, 1 on the
// road line up with the three floor-most sides of the tube.

// Tube geometry. The tube is an octagon: one flat lane per side.
export const LANES = 8;
export const LANE_ANGLE = (Math.PI * 2) / LANES;
export const TUBE_RADIUS = 5; // centre of the tube to the middle of a lane
export const LANE_WIDTH = 2 * TUBE_RADIUS * Math.tan(Math.PI / LANES);
export const CORNER_RADIUS = TUBE_RADIUS / Math.cos(Math.PI / LANES);
export const SEGMENT_LENGTH = 10;
export const SEGMENT_COUNT = 16;

// Road geometry.
// The gameplay camera: this far above the floor and behind Bholu, looking down
// this much. High enough that the lane ahead shows over his helmet. Sprites
// (Bholu, Mamu, obstacles) tilt back by the same pitch to face it.
export const CAMERA_HEIGHT = 4.8;
export const CAMERA_BACK = 7.5;
export const CAMERA_PITCH = -0.36;
export const ROAD_LANE_WIDTH = 2.8;
export const ROAD_LANES = [-1, 0, 1];
export const ROAD_WIDTH = ROAD_LANE_WIDTH * 3 + 0.6;

// Speed, in world units (≈ metres) per second.
export const SPEED_IDLE = 8;
export const SPEED_START = 20;
export const SPEED_MAX = 46;
export const SPEED_GAIN = 0.012; // added per metre travelled
export const DIFFICULTY_DISTANCE = 2500; // metres until full difficulty

// Player movement.
export const HOVER_HEIGHT = 0.05; // the scooter's wheels are on the ground
export const SLIDE_TIME = 0.7;
export const FLIP_TIME = 0.6;
export const FLIP_COOLDOWN = 2;
export const FLAT_BLEND = 4; // how fast the ride flattens out / curls up at a tunnel mouth

// Zones. Endless runs start on the road and alternate with tunnels.
export const FIRST_ZONE_LENGTH = 650; // metres of road before the first shortcut
export const ZONE_LENGTH = [500, 800]; // later zones (min, max metres)
export const ZONE_CLEARANCE = 60; // empty track before each zone gate
export const ZONE_PHYSICS = {
  road: { speedFactor: 1, gravity: 32, jumpVelocity: 11, laneSpeed: 14 },
  tunnel: { speedFactor: 0.92, gravity: 30, jumpVelocity: 10.5, laneSpeed: 13 },
};

// Phone torch battery, in tunnels only. A full charge lasts 1 / BATTERY_DRAIN
// seconds; the darker it gets, the less of the tunnel he can see.
export const BATTERY_DRAIN = 1 / 22;
export const BATTERY_PER_PICKUP = 0.12;
export const BATTERY_LOW = 0.3;

// Clipping a minor obstacle (breaking a traffic rule): you slow down and Mamu catches up.
export const STUMBLE_TIME = 0.8;
export const STUMBLE_SLOWDOWN = 0.45; // fraction of speed lost at the moment of the hit
export const HIT_GRACE = 0.5; // seconds of invulnerability after a hit or a shield break

// The chaser: Mamu, the traffic police. `chase` runs 0 (far behind) to 1 (on your tail).
export const CHASER_START = 0.9;
export const CHASER_DANGER = 0.35; // a hit while chase is above this = caught
export const CHASER_HOLD = 1.2; // seconds he stays on your tail after a hit
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

// Position an object on the road (lane -1, 0 or 1), upright.
export function placeOnRoad(object, lane, height, z) {
  object.position.set(lane * ROAD_LANE_WIDTH, -TUBE_RADIUS + height, z);
  object.rotation.z = 0;
}

// Between the two: flat = 1 on the road, 0 in the tube (used while riding in or out).
export function placeBlended(object, lane, height, z, flat) {
  placeOnWall(object, lane, height, z);
  if (flat <= 0) return;
  const { x, y } = object.position;
  const angle = object.rotation.z;
  placeOnRoad(object, lane, height, z);
  object.position.x = x + (object.position.x - x) * flat;
  object.position.y = y + (object.position.y - y) * flat;
  object.rotation.z = angle * (1 - flat);
}

export function wrapLane(lane) {
  return ((Math.round(lane) % LANES) + LANES) % LANES;
}

// A lane number brought into -4..3, so road lanes read as -1, 0, 1.
export function signedLane(lane) {
  return ((((lane + 4) % LANES) + LANES) % LANES) - 4;
}
