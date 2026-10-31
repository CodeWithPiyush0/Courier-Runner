import {
  LANES, TUBE_RADIUS, SPAWN_AHEAD, FIRST_ROW_DISTANCE, POWER_FIRST, POWER_EVERY,
  MAGNET_RANGE, MAGNET_PULL, ZONE_CLEARANCE, placeOnWall,
} from './config.js';
import { POWER_TYPES } from './powers.js';
import { buildTrackMakers, animateTrackMaterials } from './models.js';

// Each obstacle type: how deep it is along the run, what hitting it does, and
// whether the player's current state gets them past it. The rules are the same
// in every zone; only the look changes (crate → coral rock, laser → urchins …).
export const OBSTACLES = {
  wall: { depth: 1.4, effect: 'crash', passes: () => false },
  low: { depth: 0.3, effect: 'zap', passes: (p) => p.jumpY > 0.5 },
  high: { depth: 0.3, effect: 'zap', passes: (p) => p.sliding },
};

const PLAYER_HALF_DEPTH = 0.7;
const PICKUP_HALF_DEPTH = 0.6;
const PICKUP_REACH = 1.3; // how far above/below a coin or bubble you can still grab it

function kindOf(type) {
  if (OBSTACLES[type]) return 'obstacle';
  if (type === 'coin' || type === 'bubble') return type;
  if (POWER_TYPES.includes(type)) return 'power';
  return 'scenery';
}

const rand = (n) => Math.floor(Math.random() * n);
const lane = (n) => ((n % LANES) + LANES) % LANES;

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// True if adding `candidate` to the wall lanes would make three walls side by
// side — from the middle one you could not reach an open lane in time.
function wouldWallOff(walls, candidate) {
  const has = (l) => l === candidate || walls.has(lane(l));
  for (let start = candidate - 2; start <= candidate; start++) {
    if (has(start) && has(start + 1) && has(start + 2)) return true;
  }
  return false;
}

// Spawns obstacle patterns, pickups and zone gates ahead of the player and
// recycles them once they are behind the camera.
export class Track {
  constructor(scene, zones) {
    this.scene = scene;
    this.zones = zones;
    this.makers = buildTrackMakers();
    this.time = 0;
    this.pools = Object.fromEntries(Object.keys(this.makers).map((key) => [key, []]));
    this.items = [];
    this.patterns = [
      { weight: 5, minDifficulty: 0, build: (z, d) => this.scatter(z, d) },
      { weight: 1, minDifficulty: 0.1, build: (z) => this.ring(z) },
      { weight: 1, minDifficulty: 0.2, build: (z) => this.spiral(z) },
      { weight: 1, minDifficulty: 0.25, build: (z) => this.checker(z) },
      { weight: 1, minDifficulty: 0.35, lead: 30, build: (z) => this.tunnel(z) },
    ];
    this.reset(0);
  }

  // options.powers: spawn power-ups. options.auto: spawn patterns by itself
  // (the tutorial turns this off and places things by hand).
  reset(playerZ, { powers = true, auto = true } = {}) {
    for (const item of this.items) this.release(item);
    this.items = [];
    this.powers = powers;
    this.auto = auto;
    this.coinsSpawned = 0; // for the delivery's gem star
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

  add(type, laneIndex, z, height = 0, zone = this.zones.zoneAt(z)) {
    const skin = this.makers[`${type}@${zone}`] ? `${type}@${zone}` : type;
    const object = this.pools[skin].pop() ?? this.makers[skin]();
    if (!object.parent) this.scene.add(object);
    object.visible = true;
    placeOnWall(object, laneIndex, height, z);
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

      // Clear track before each zone gate, then the gate itself.
      const gateZ = this.zones.boundary(this.gateIndex);
      if (this.nextZ - ZONE_CLEARANCE < gateZ) {
        this.add('gate', 0, gateZ, TUBE_RADIUS, this.zones.zoneAt(gateZ - 1));
        this.gateIndex++;
        this.nextZ = gateZ - 30;
        continue;
      }

      const pattern = this.choosePattern(difficulty);
      this.nextZ -= pattern.lead ?? 0;
      const end = this.nextZ - pattern.build(this.nextZ, difficulty);
      const gap = 26 - 12 * difficulty + Math.random() * 6;

      if (this.powers && end < this.nextPowerZ) {
        this.add(POWER_TYPES[rand(POWER_TYPES.length)], rand(LANES), end - gap / 2);
        const [min, max] = POWER_EVERY;
        this.nextPowerZ = end - (min + Math.random() * (max - min));
      }
      if (this.zones.zoneAt(end) === 'water' && Math.random() < 0.6) {
        const bubbleLane = rand(LANES);
        for (let k = 0; k < 3; k++) this.add('bubble', bubbleLane, end - 5 - k * 3);
      }
      this.nextZ = end - gap;
    }

    this.items = this.items.filter((item) => {
      if (item.z > playerZ + 10) { this.release(item); return false; }
      return true;
    });

    this.time += dt;
    animateTrackMaterials(this.time);
    for (const item of this.items) {
      if (item.done) continue;
      if (item.object.spinner) item.object.spinner.rotation.y += dt * 3;
      item.object.animate?.(this.time);
    }
  }

  choosePattern(difficulty) {
    const options = this.patterns.filter((p) => difficulty >= p.minDifficulty);
    let roll = Math.random() * options.reduce((sum, p) => sum + p.weight, 0);
    for (const p of options) {
      roll -= p.weight;
      if (roll <= 0) return p;
    }
    return options[0];
  }

  // ---------- patterns: each builds from z forwards and returns its length ----------

  // A single row of random obstacles. Never three walls side by side.
  scatter(z, difficulty) {
    const lanes = shuffle([...Array(LANES).keys()]);
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

  // Lasers all the way round the tube: everyone jumps (or slides).
  ring(z) {
    const type = Math.random() < 0.5 ? 'low' : 'high';
    for (let l = 0; l < LANES; l++) this.add(type, l, z);
    const coinLane = rand(LANES);
    if (type === 'low') {
      // An arc of coins that follows the jump over the laser.
      for (const dz of [6, 3, 0, -3, -6]) this.add('coin', coinLane, z - dz, 1.9 * (1 - (dz / 7) ** 2));
    } else {
      this.coinTrail(coinLane, z + 4, 4);
    }
    return 0;
  }

  // Crates winding round the tube in a spiral; step against the turn.
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

  // Rows of lasers in every lane, alternating low and high: jump or slide, your pick.
  checker(z) {
    const spacing = 10;
    for (let i = 0; i < 3; i++) {
      for (let l = 0; l < LANES; l++) this.add((l + i) % 2 ? 'low' : 'high', l, z - i * spacing);
    }
    return 2 * spacing;
  }

  // A long block of crates with a two-lane channel through it. The channel has
  // lasers; the pattern's lead-in gap gives time to get there (or flip there).
  tunnel(z) {
    const open = rand(LANES);
    const spacing = 7;
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      for (let l = 2; l < LANES; l++) this.add('wall', open + l, z - i * spacing);
      const laserLane = open + (i % 2);
      this.add(i % 2 ? 'high' : 'low', laserLane, z - i * spacing);
    }
    this.coinTrail(open + 1, z + 2, 2 + rows * 2);
    return (rows - 1) * spacing;
  }

  coinTrail(laneIndex, startZ, count) {
    for (let k = 0; k < count; k++) this.add('coin', laneIndex, startZ - k * 2.5);
  }

  // ---------- collisions ----------

  // What did the player's swept body (from prevZ to now) touch this frame?
  // Returns { coins, bubbles, power: type | null, hit: obstacle item | null }.
  collide(player, prevZ) {
    const front = player.z - PLAYER_HALF_DEPTH;
    const back = prevZ + PLAYER_HALF_DEPTH;
    const playerLane = player.laneIndex;
    const result = { coins: 0, bubbles: 0, power: null, hit: null };
    if (player.flipping) return result;

    for (const item of this.items) {
      if (item.done || item.kind === 'scenery' || item.lane !== playerLane) continue;
      const rule = OBSTACLES[item.type];
      const half = rule ? rule.depth / 2 : PICKUP_HALF_DEPTH;
      if (item.z - half > back || item.z + half < front) continue;

      if (item.kind === 'coin' || item.kind === 'bubble') {
        if (Math.abs(player.jumpY - item.height) > PICKUP_REACH) continue;
        this.collect(item);
        result[item.kind === 'coin' ? 'coins' : 'bubbles']++;
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

  // Magnet: coins and bubbles near the player fly to them from any lane.
  // Returns { coins, bubbles } caught this frame.
  attract(dt, playerZ, target) {
    const caught = { coins: 0, bubbles: 0 };
    const step = MAGNET_PULL * dt;
    for (const item of this.items) {
      if ((item.kind !== 'coin' && item.kind !== 'bubble') || item.done) continue;
      if (!item.pulled && (item.z > playerZ + 1 || item.z < playerZ - MAGNET_RANGE)) continue;
      item.pulled = true;
      const position = item.object.position;
      const distance = position.distanceTo(target);
      if (distance <= step + 0.6) {
        this.collect(item);
        caught[item.kind === 'coin' ? 'coins' : 'bubbles']++;
        continue;
      }
      position.lerp(target, step / distance);
      item.z = position.z;
    }
    return caught;
  }
}
