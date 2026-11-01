import {
  LANES, ROAD_LANES, TUBE_RADIUS, SPAWN_AHEAD, FIRST_ROW_DISTANCE, POWER_FIRST, POWER_EVERY,
  MAGNET_RANGE, MAGNET_PULL, ZONE_CLEARANCE, placeOnWall, placeOnRoad, signedLane,
} from './config.js';
import { POWER_TYPES } from './powers.js';
import { buildTrackMakers } from './models.js';

// Each obstacle type: how deep it is along the run, what hitting it does, and
// whether the player's current state gets them past it. The rules are the same
// in every zone; only the look changes (auto-rickshaw → debris, pothole → pipe …).
// "crash" ends the run; "zap" is a minor hit: Bholu wobbles and Mamu closes in.
export const OBSTACLES = {
  wall: { depth: 2.4, effect: 'crash', passes: () => false },
  low: { depth: 0.8, effect: 'zap', passes: (p) => p.jumpY > 0.5 },
  high: { depth: 0.4, effect: 'zap', passes: (p) => p.sliding },
};

const PLAYER_HALF_DEPTH = 0.7;
const PICKUP_HALF_DEPTH = 0.6;
const PICKUP_REACH = 1.3; // how far above/below a coin or battery you can still grab it
const TUBE_LANES = [...Array(LANES).keys()];

function kindOf(type) {
  if (OBSTACLES[type]) return 'obstacle';
  if (type === 'coin' || type === 'battery') return type;
  if (POWER_TYPES.includes(type)) return 'power';
  return 'scenery';
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (list) => list[rand(list.length)];
const lane = (n) => ((n % LANES) + LANES) % LANES;

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// True if adding `candidate` to the wall lanes would make three walls side by
// side in the tube — from the middle one you could not reach an open lane in time.
function wouldWallOff(walls, candidate) {
  const has = (l) => l === candidate || walls.has(lane(l));
  for (let start = candidate - 2; start <= candidate; start++) {
    if (has(start) && has(start + 1) && has(start + 2)) return true;
  }
  return false;
}

// Spawns obstacle patterns, pickups and zone gates ahead of the player and
// recycles them once they are behind the camera. Roads have 3 lanes (-1, 0, 1),
// tunnels 8 (0..7 round the tube).
export class Track {
  constructor(scene, zones) {
    this.scene = scene;
    this.zones = zones;
    this.makers = buildTrackMakers();
    this.time = 0;
    this.pools = Object.fromEntries(Object.keys(this.makers).map((key) => [key, []]));
    this.items = [];
    this.patterns = {
      road: [
        { weight: 5, minDifficulty: 0, build: (z, d) => this.roadScatter(z, d) },
        { weight: 1, minDifficulty: 0.05, build: (z) => this.crossing(z, ROAD_LANES) },
        { weight: 2, minDifficulty: 0.2, build: (z) => this.traffic(z) },
        { weight: 1, minDifficulty: 0.35, lead: 25, build: (z) => this.jam(z) },
      ],
      tunnel: [
        { weight: 5, minDifficulty: 0, build: (z, d) => this.scatter(z, d) },
        { weight: 1, minDifficulty: 0.1, build: (z) => this.crossing(z, TUBE_LANES) },
        { weight: 1, minDifficulty: 0.2, build: (z) => this.spiral(z) },
        { weight: 1, minDifficulty: 0.25, build: (z) => this.checker(z) },
        { weight: 1, minDifficulty: 0.35, lead: 30, build: (z) => this.channel(z) },
      ],
    };
    this.reset(0);
  }

  // options.powers: spawn power-ups. options.auto: spawn patterns by itself
  // (the tutorial turns this off and places things by hand).
  reset(playerZ, { powers = true, auto = true } = {}) {
    for (const item of this.items) this.release(item);
    this.items = [];
    this.powers = powers;
    this.auto = auto;
    this.coinsSpawned = 0; // for the delivery's tips star
    this.nextZ = playerZ - FIRST_ROW_DISTANCE;
    this.nextPowerZ = playerZ - POWER_FIRST;
    this.finishPlaced = false;
    this.gateIndex = 0;
    while (this.zones.boundary(this.gateIndex) >= playerZ) this.gateIndex++;
  }

  // Hand spawning back to the track (after the tutorial), starting at z.
  resumeSpawning(z) {
    this.auto = true;
    this.nextZ = z;
  }

  // The lanes there are at z: road or tube.
  lanesAt(z) {
    return this.zones.zoneAt(z) === 'road' ? ROAD_LANES : TUBE_LANES;
  }

  add(type, laneIndex, z, height = 0, zone = this.zones.zoneAt(z)) {
    const skin = this.makers[`${type}@${zone}`] ? `${type}@${zone}` : type;
    const object = this.pools[skin].pop() ?? this.makers[skin]();
    if (!object.parent) this.scene.add(object);
    object.visible = true;
    if (zone === 'road') placeOnRoad(object, signedLane(laneIndex), height, z);
    else placeOnWall(object, laneIndex, height, z);
    if (type === 'coin') this.coinsSpawned++;
    this.items.push({
      type, kind: kindOf(type), skin, lane: lane(laneIndex), z, height, object, done: false, pulled: false,
    });
  }

  release(item) {
    item.object.visible = false;
    this.pools[item.skin].push(item.object);
  }

  collect(item) {
    item.done = true;
    item.object.visible = false;
  }

  // Remove everything between two z positions (near > far), e.g. around a tutorial lesson.
  clearBetween(near, far) {
    this.items = this.items.filter((item) => {
      if (item.z > near || item.z < far || item.kind === 'scenery') return true;
      this.release(item);
      return false;
    });
  }

  // Hide an obstacle the player smashed through (shield or boost).
  smash(item) {
    item.object.visible = false;
  }

  update(dt, playerZ, difficulty) {
    while (this.auto && this.nextZ > playerZ - SPAWN_AHEAD) {
      // A story delivery ends at the drop-off point: clear track, then the finish arch.
      const finishZ = this.zones.finishZ;
      if (this.nextZ - ZONE_CLEARANCE < finishZ) {
        if (!this.finishPlaced) this.add('finish', 0, finishZ, TUBE_RADIUS);
        this.finishPlaced = true;
        this.auto = false;
        break;
      }

      // Clear track before each tunnel mouth, then the mouth itself.
      const gateZ = this.zones.boundary(this.gateIndex);
      if (this.nextZ - ZONE_CLEARANCE < gateZ) {
        this.add('gate', 0, gateZ, TUBE_RADIUS, this.zones.zoneAt(gateZ - 1));
        this.gateIndex++;
        this.nextZ = gateZ - 30;
        continue;
      }

      const zone = this.zones.zoneAt(this.nextZ);
      const pattern = this.choosePattern(zone, difficulty);
      this.nextZ -= pattern.lead ?? 0;
      const end = this.nextZ - pattern.build(this.nextZ, difficulty);
      const gap = 26 - 12 * difficulty + Math.random() * 6;

      if (this.powers && end < this.nextPowerZ) {
        this.add(POWER_TYPES[rand(POWER_TYPES.length)], pick(this.lanesAt(end)), end - gap / 2);
        const [min, max] = POWER_EVERY;
        this.nextPowerZ = end - (min + Math.random() * (max - min));
      }
      if (zone === 'tunnel' && Math.random() < 0.6) {
        const batteryLane = rand(LANES);
        for (let k = 0; k < 3; k++) this.add('battery', batteryLane, end - 5 - k * 3);
      }
      this.nextZ = end - gap;
    }

    this.items = this.items.filter((item) => {
      if (item.z > playerZ + 10) { this.release(item); return false; }
      return true;
    });

    this.time += dt;
    for (const item of this.items) {
      if (item.done) continue;
      if (item.object.spinner) item.object.spinner.rotation.y += dt * 3;
      item.object.animate?.(this.time);
    }
  }

  choosePattern(zone, difficulty) {
    const options = this.patterns[zone].filter((p) => difficulty >= p.minDifficulty);
    let roll = Math.random() * options.reduce((sum, p) => sum + p.weight, 0);
    for (const p of options) {
      roll -= p.weight;
      if (roll <= 0) return p;
    }
    return options[0];
  }

  // ---------- road patterns (lanes -1, 0, 1): each builds from z forwards and returns its length ----------

  // One row: one or two lanes blocked, never all three by walls.
  roadScatter(z, difficulty) {
    const lanes = shuffle([...ROAD_LANES]);
    const blocked = Math.random() < 0.25 + difficulty * 0.5 ? 2 : 1; // the third lane always stays open
    for (const l of lanes.slice(0, blocked)) {
      this.add(Math.random() < 0.5 ? 'wall' : Math.random() < 0.5 ? 'low' : 'high', l, z);
    }
    if (Math.random() < 0.7) this.coinTrail(lanes[blocked], z - 4, 4);
    return 0;
  }

  // Autos and cows weaving: each row blocks a different lane.
  traffic(z) {
    const spacing = 10;
    let last = pick(ROAD_LANES);
    for (let i = 0; i < 3; i++) {
      const options = ROAD_LANES.filter((l) => l !== last);
      last = pick(options);
      this.add('wall', last, z - i * spacing);
      this.coinTrail(pick(ROAD_LANES.filter((l) => l !== last)), z - i * spacing - 3, 2);
    }
    return 2 * spacing;
  }

  // A jam: two lanes packed for a stretch, the open lane full of potholes and barriers.
  jam(z) {
    const open = pick(ROAD_LANES);
    const spacing = 8;
    for (let i = 0; i < 3; i++) {
      for (const l of ROAD_LANES) if (l !== open) this.add('wall', l, z - i * spacing);
      if (i === 1) this.add(Math.random() < 0.5 ? 'low' : 'high', open, z - i * spacing);
    }
    this.coinTrail(open, z + 2, 6);
    return 2 * spacing;
  }

  // ---------- tunnel patterns (lanes 0..7 round the tube) ----------

  // A single row of random obstacles. Never three walls side by side.
  scatter(z, difficulty) {
    const lanes = shuffle([...TUBE_LANES]);
    const blocked = 1 + rand(2 + Math.round(difficulty * 4));
    const walls = new Set();
    for (const l of lanes.slice(0, blocked)) {
      let type = Math.random() < 0.45 ? 'wall' : Math.random() < 0.55 ? 'low' : 'high';
      if (type === 'wall' && wouldWallOff(walls, l)) type = 'low';
      if (type === 'wall') walls.add(l);
      this.add(type, l, z);
    }
    if (blocked < LANES && Math.random() < 0.65) this.coinTrail(lanes[blocked], z - 4, 4);
    return 0;
  }

  // Something low (or high) across every lane: everyone jumps (or slides).
  crossing(z, lanes) {
    const type = Math.random() < 0.5 ? 'low' : 'high';
    for (const l of lanes) this.add(type, l, z);
    const coinLane = pick(lanes);
    if (type === 'low') {
      // An arc of coins that follows the jump.
      for (const dz of [6, 3, 0, -3, -6]) this.add('coin', coinLane, z - dz, 1.9 * (1 - (dz / 7) ** 2));
    } else {
      this.coinTrail(coinLane, z + 4, 4);
    }
    return 0;
  }

  // Debris winding round the tube in a spiral; step against the turn.
  spiral(z) {
    const start = rand(LANES);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const spacing = 7;
    for (let i = 0; i < 4; i++) {
      this.add('wall', start + dir * i, z - i * spacing);
      this.add('wall', start + dir * i + 4, z - i * spacing);
    }
    return 3 * spacing;
  }

  // Rows of pipes and cables in every lane, alternating low and high: jump or slide.
  checker(z) {
    const spacing = 10;
    for (let i = 0; i < 3; i++) {
      for (const l of TUBE_LANES) this.add((l + i) % 2 ? 'low' : 'high', l, z - i * spacing);
    }
    return 2 * spacing;
  }

  // A long block of debris with a two-lane channel through it. The lead-in gap
  // gives time to get there (or flip there).
  channel(z) {
    const open = rand(LANES);
    const spacing = 7;
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      for (let l = 2; l < LANES; l++) this.add('wall', open + l, z - i * spacing);
      this.add(i % 2 ? 'high' : 'low', open + (i % 2), z - i * spacing);
    }
    this.coinTrail(open + 1, z + 2, 2 + rows * 2);
    return (rows - 1) * spacing;
  }

  coinTrail(laneIndex, startZ, count) {
    for (let k = 0; k < count; k++) this.add('coin', laneIndex, startZ - k * 2.5);
  }

  // ---------- collisions ----------

  // What did the player's swept body (from prevZ to now) touch this frame?
  // Returns { coins, batteries, power: type | null, hit: obstacle item | null }.
  collide(player, prevZ) {
    const front = player.z - PLAYER_HALF_DEPTH;
    const back = prevZ + PLAYER_HALF_DEPTH;
    const playerLane = player.laneIndex;
    const result = { coins: 0, batteries: 0, power: null, hit: null };
    if (player.flipping) return result;

    for (const item of this.items) {
      if (item.done || item.kind === 'scenery' || item.lane !== playerLane) continue;
      const rule = OBSTACLES[item.type];
      const half = rule ? rule.depth / 2 : PICKUP_HALF_DEPTH;
      if (item.z - half > back || item.z + half < front) continue;

      if (item.kind === 'coin' || item.kind === 'battery') {
        if (Math.abs(player.jumpY - item.height) > PICKUP_REACH) continue;
        this.collect(item);
        result[item.kind === 'coin' ? 'coins' : 'batteries']++;
      } else if (item.kind === 'power') {
        this.collect(item);
        result.power = item.type;
      } else if (!rule.passes(player)) {
        item.done = true;
        result.hit ??= item;
      }
    }
    return result;
  }

  // Magnet (UPI): coins and batteries near the player fly to them from any lane.
  // Returns { coins, batteries } caught this frame.
  attract(dt, playerZ, target) {
    const caught = { coins: 0, batteries: 0 };
    const step = MAGNET_PULL * dt;
    for (const item of this.items) {
      if ((item.kind !== 'coin' && item.kind !== 'battery') || item.done) continue;
      if (!item.pulled && (item.z > playerZ + 1 || item.z < playerZ - MAGNET_RANGE)) continue;
      item.pulled = true;
      const position = item.object.position;
      const distance = position.distanceTo(target);
      if (distance <= step + 0.6) {
        this.collect(item);
        caught[item.kind === 'coin' ? 'coins' : 'batteries']++;
        continue;
      }
      position.lerp(target, step / distance);
      item.z = position.z;
    }
    return caught;
  }
}
