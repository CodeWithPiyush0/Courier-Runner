import * as THREE from 'three';
import { TUBE_RADIUS } from './config.js';

// Old Patna seen from the drone at the start of the first delivery: blocks of
// painted houses with water tanks and stair huts on their flat roofs, trees,
// traffic, a few landmarks (Golghar, a temple, a mosque, Gandhi Maidan) and the
// Ganga with Gandhi Setu to the north (the way the run goes, -z). It is built
// round the start of the run, leaving room for the gameplay street (world.js)
// down the middle, and thrown away once Riya has ridden out of it.
//
// Everything is merged or instanced so the whole city costs a dozen draw calls.

const FLOOR = -TUBE_RADIUS;
const STOREY = 3.2;
const BLOCK_X = 38; // distance between north-south roads (the main street is x = 0)
const BLOCK_Z = 42;
const ROAD = 8;
const MAIN_ROAD = 15; // the gameplay street, kerb to kerb plus pavements
const EXTENT_X = 270;
const AHEAD = 300; // city reaches this far ahead of the start (-z)
const BEHIND = 170;
const STREET_CLEAR_X = 25; // world.js owns |x| < this along the gameplay street

const WALLS = ['#f3e3c3', '#f2c6c0', '#cfe6c8', '#f6dd8f', '#c9dcef', '#f4c99a', '#ffffff', '#e6d3ef', '#bfe3df', '#f7b7a3'];
const ROOFS = ['#b9b2a6', '#a8a196', '#c4bdb0', '#b5644a', '#9e9a92'];
const GREENS = ['#4f9a3c', '#5aa845', '#3f8a3a', '#6cb04c'];
const VEHICLES = ['#2e8b3a', '#f5c518', '#ffffff', '#d62828', '#1f5fbf', '#f2f2f2', '#ff8c1a'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// One storey, 4 m of wall: two windows with sunshades and the odd AC box.
// White, so the vertex colour tints each house.
function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 102;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 102);
  for (const x of [18, 74]) {
    ctx.fillStyle = Math.random() < 0.3 ? '#ffd27a' : '#3a4352';
    ctx.fillRect(x, 30, 36, 44);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x - 4, 24, 44, 6);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 98, 128, 4); // floor line
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Accumulates boxes into one merged geometry: walls (textured, tiled per
// storey) or plain (roofs, huts, parks), each with a vertex colour.
class Builder {
  constructor() {
    this.position = [];
    this.uv = [];
    this.color = [];
    this.index = [];
  }

  quad(a, b, c, d, color, uvSize) {
    const base = this.position.length / 3;
    for (const p of [a, b, c, d]) this.position.push(...p);
    const [u, v] = uvSize;
    this.uv.push(0, 0, u, 0, u, v, 0, v);
    for (let i = 0; i < 4; i++) this.color.push(color.r, color.g, color.b);
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // The four sides of a box from (x0, y0, z0) to (x1, y1, z1); textures tile every 4 m x one storey.
  sides(x0, y0, z0, x1, y1, z1, color) {
    const h = (y1 - y0) / STOREY;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, [(x1 - x0) / 4, h]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, [(x1 - x0) / 4, h]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, [(z1 - z0) / 4, h]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, [(z1 - z0) / 4, h]);
  }

  top(x0, y, z0, x1, z1, color) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color, [1, 1]);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.setIndex(this.index);
    g.computeVertexNormals();
    return g;
  }
}

// Instances of one shape with per-instance colour, from a list of [matrix, colour].
function instanced(geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  items.forEach(([matrix, color], i) => {
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, new THREE.Color(color));
  });
  mesh.count = items.length;
  return mesh;
}

const at = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
  new THREE.Vector3(sx, sy, sz),
);

export class City {
  // startZ: where the run starts; streetFrom/streetTo: the z range world.js covers.
  constructor(scene, startZ, streetFrom, streetTo) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.endZ = startZ - AHEAD - 60; // gone once Riya is past this
    this.materials = [];
    this.build(startZ, streetFrom, streetTo);
    scene.add(this.group);
    this.time = 0;
  }

  material(m) {
    this.materials.push(m);
    return m;
  }

  build(z0, streetFrom, streetTo) {
    const walls = new Builder();
    const plain = new Builder();
    const tanks = [];
    const trees = [];
    const greenery = [];
    const color = (hex) => new THREE.Color(hex);
    const zMin = z0 - AHEAD;
    const zMax = z0 + BEHIND;
    // Lots by the gameplay street: 'skip' where world.js already draws it, 'ahead'
    // further along (drawn for the drone, hidden once the run starts and
    // world.js builds the street there itself).
    const nearStreet = (x0, x1, za, zb) => {
      const fromAxis = x0 < 0 && x1 > 0 ? 0 : Math.min(Math.abs(x0), Math.abs(x1));
      if (fromAxis >= STREET_CLEAR_X || za > streetFrom + 5) return null;
      return zb > streetTo - 5 ? 'skip' : 'ahead';
    };
    const ahead = { walls: new Builder(), plain: new Builder() };

    // Ground, roads and the main street beyond the stretch world.js draws.
    plain.top(-EXTENT_X - 120, FLOOR - 0.08, zMin - 260, EXTENT_X + 120, zMax + 120, color('#cdbfa6'));
    for (let x = -Math.floor(EXTENT_X / BLOCK_X) * BLOCK_X; x <= EXTENT_X; x += BLOCK_X) {
      const w = x === 0 ? MAIN_ROAD : ROAD;
      if (x === 0) { // the main street, either side of world.js's stretch
        plain.top(-w / 2, FLOOR - 0.04, zMin, w / 2, streetTo, color('#55565b'));
        plain.top(-w / 2, FLOOR - 0.04, streetFrom, w / 2, zMax, color('#55565b'));
      } else {
        plain.top(x - w / 2, FLOOR - 0.04, zMin, x + w / 2, zMax, color('#5d5e63'));
      }
    }
    for (let z = z0 - Math.floor(AHEAD / BLOCK_Z) * BLOCK_Z; z <= zMax; z += BLOCK_Z) {
      plain.top(-EXTENT_X, FLOOR - 0.03, z - ROAD / 2, -MAIN_ROAD / 2, z + ROAD / 2, color('#5d5e63'));
      plain.top(MAIN_ROAD / 2, FLOOR - 0.03, z - ROAD / 2, EXTENT_X, z + ROAD / 2, color('#5d5e63'));
    }

    // Landmarks claim a few blocks; the rest are houses or the odd park.
    const landmarks = new Map([
      [`-3,-2`, 'golghar'], [`2,1`, 'temple'], [`-2,2`, 'mosque'], [`3,-3`, 'maidan'], [`4,-3`, 'maidan'],
      [`-4,1`, 'park'], [`5,2`, 'park'],
    ]);
    for (let bx = -Math.floor(EXTENT_X / BLOCK_X); bx < Math.floor(EXTENT_X / BLOCK_X); bx++) {
      for (let bz = -Math.floor(AHEAD / BLOCK_Z); bz < Math.floor(BEHIND / BLOCK_Z); bz++) {
        const xa = bx * BLOCK_X + (bx === 0 ? MAIN_ROAD / 2 : ROAD / 2);
        const xb = (bx + 1) * BLOCK_X - (bx + 1 === 0 ? MAIN_ROAD / 2 : ROAD / 2);
        const za = z0 + bz * BLOCK_Z + ROAD / 2;
        const zb = z0 + (bz + 1) * BLOCK_Z - ROAD / 2;
        const kind = landmarks.get(`${bx},${bz}`);
        if (kind) {
          this.landmark(kind, (xa + xb) / 2, (za + zb) / 2, xb - xa, zb - za, { plain, trees, greenery });
          continue;
        }
        this.block(xa, za, xb, zb, { walls, plain, tanks, trees, ahead, nearStreet });
      }
    }

    // The Ganga to the north, with sandbanks, and Gandhi Setu striding across it.
    const river = z0 - AHEAD - 40;
    plain.top(-EXTENT_X - 400, FLOOR - 0.06, river - 220, EXTENT_X + 400, river, color('#e3d2a8')); // sand
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 170).rotateX(-Math.PI / 2),
      this.material(new THREE.MeshStandardMaterial({ color: 0x5f9fc0, roughness: 0.35, metalness: 0.1 })),
    );
    water.position.set(0, FLOOR - 0.02, river - 110);
    this.group.add(water);
    const bridgeX = 3 * BLOCK_X;
    plain.top(bridgeX - 6, FLOOR + 9, river - 230, bridgeX + 6, river + 10, color('#b8b4ab'));
    walls.sides(bridgeX - 6, FLOOR + 7.6, river - 230, bridgeX + 6, FLOOR + 9, river + 10, color('#d8d2c4'));
    for (let z = river - 20; z > river - 230; z -= 26) {
      walls.sides(bridgeX - 2.5, FLOOR - 1, z - 2, bridgeX + 2.5, FLOOR + 7.6, z + 2, color('#cfc8b8'));
    }

    const wallMat = this.material(new THREE.MeshStandardMaterial({ map: windowTexture(), vertexColors: true, roughness: 0.9 }));
    const plainMat = this.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    this.group.add(new THREE.Mesh(walls.geometry(), wallMat), new THREE.Mesh(plain.geometry(), plainMat));
    this.streetAhead = new THREE.Group();
    this.streetAhead.add(new THREE.Mesh(ahead.walls.geometry(), wallMat), new THREE.Mesh(ahead.plain.geometry(), plainMat));
    this.group.add(this.streetAhead);

    const tankGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 10).translate(0, 0.65, 0);
    this.group.add(instanced(tankGeo, this.material(new THREE.MeshStandardMaterial({ roughness: 0.6 })), tanks));
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    this.group.add(instanced(leafGeo, this.material(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true })), trees));
    for (const mesh of greenery) this.group.add(mesh);

    this.addTraffic(z0, zMin, zMax);
  }

  // A block of 2-6 houses, each a few storeys with a flat roof, a parapet, and
  // maybe a stair hut, a water tank, a dish or a line of washing.
  block(xa, za, xb, zb, { walls: cityWalls, plain: cityPlain, tanks, trees, ahead, nearStreet }) {
    const cols = Math.random() < 0.5 ? 2 : 3;
    const rows = 2;
    const lw = (xb - xa) / cols;
    const lz = (zb - za) / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x0 = xa + c * lw + 0.4;
        const x1 = x0 + lw - 0.8;
        const z0 = za + r * lz + 0.4;
        const z1 = z0 + lz - 0.8;
        const near = nearStreet(x0, x1, z0, z1);
        if (near === 'skip') continue;
        const walls = near ? ahead.walls : cityWalls;
        const plain = near ? ahead.plain : cityPlain;
        if (!near && Math.random() < 0.08) { // a courtyard with a tree
          trees.push([at((x0 + x1) / 2, FLOOR + rand(4, 6), (z0 + z1) / 2, rand(3, 4.5), rand(2.6, 3.4), rand(3, 4.5)), pick(GREENS)]);
          continue;
        }
        const storeys = 2 + Math.floor(Math.random() ** 1.5 * 5);
        const top = FLOOR + storeys * STOREY;
        const wall = new THREE.Color(pick(WALLS));
        walls.sides(x0, FLOOR, z0, x1, top, z1, wall);
        const roof = new THREE.Color(pick(ROOFS));
        plain.top(x0, top, z0, x1, z1, roof);
        const parapet = wall.clone().multiplyScalar(0.85);
        walls.sides(x0, top, z0, x1, top + 0.8, z0 + 0.25, parapet);
        walls.sides(x0, top, z1 - 0.25, x1, top + 0.8, z1, parapet);
        if (Math.random() < 0.45) { // stair hut
          const hx = rand(x0 + 1, x1 - 4);
          const hz = rand(z0 + 1, z1 - 4);
          walls.sides(hx, top, hz, hx + 3, top + 2.6, hz + 3, wall);
          plain.top(hx, top + 2.6, hz, hx + 3, hz + 3, roof);
        }
        if (near) continue; // houses by the street ahead stay plain (they're only seen from the air)
        if (Math.random() < 0.75) tanks.push([at(rand(x0 + 1.2, x1 - 1.2), top, rand(z0 + 1.2, z1 - 1.2), 1, rand(0.9, 1.2), 1), '#1d1d20']);
        if (Math.random() < 0.3) tanks.push([at(rand(x0 + 1.2, x1 - 1.2), top, rand(z0 + 1.2, z1 - 1.2), 0.8, 0.9, 0.8), '#1d1d20']);
        if (Math.random() < 0.25) { // washing on a line
          const y = top + 1.3;
          const lx = rand(x0 + 1, x1 - 5);
          const lz2 = rand(z0 + 1, z1 - 1);
          for (let i = 0; i < 4; i++) {
            plain.quad([lx + i * 1.2, y - 0.8, lz2], [lx + i * 1.2 + 0.9, y - 0.8, lz2], [lx + i * 1.2 + 0.9, y, lz2], [lx + i * 1.2, y, lz2],
              new THREE.Color(pick(['#d62828', '#ffc21a', '#1f5fbf', '#ffffff', '#e05aa0'])), [1, 1]);
          }
        }
      }
    }
    // Street trees along the block's edge.
    for (let x = xa + 3; x < xb - 3; x += rand(9, 16)) {
      if (Math.random() < 0.5 && !nearStreet(x, x, za - 2, za)) { // not by the gameplay street
        trees.push([at(x, FLOOR + rand(4.5, 6), za - 1.2, rand(2.2, 3.2), rand(2, 2.8), rand(2.2, 3.2)), pick(GREENS)]);
      }
    }
  }

  landmark(kind, cx, cz, w, d, { plain, trees, greenery }) {
    const add = (geometry, color, x, y, z, extra = {}) => {
      const mesh = new THREE.Mesh(geometry, this.material(new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })));
      mesh.position.set(x, y, z);
      greenery.push(mesh);
      return mesh;
    };
    const grass = (color = '#7bb661') => plain.top(cx - w / 2, FLOOR - 0.02, cz - d / 2, cx + w / 2, cz + d / 2, new THREE.Color(color));
    if (kind === 'park' || kind === 'maidan') {
      grass(kind === 'maidan' ? '#86c06a' : '#7bb661');
      const n = kind === 'maidan' ? 6 : 10;
      for (let i = 0; i < n; i++) { // trees round the edge
        const a = (i / n) * Math.PI * 2;
        trees.push([at(cx + Math.cos(a) * w * 0.42, FLOOR + 5, cz + Math.sin(a) * d * 0.42, 3, 2.8, 3), pick(GREENS)]);
      }
      if (kind === 'maidan') add(new THREE.CylinderGeometry(0.8, 1.6, 9, 8), '#8a8f96', cx, FLOOR + 4.5, cz); // statue plinth
    } else if (kind === 'golghar') { // Patna's beehive granary, with its outside stair
      grass('#a7c48a');
      add(new THREE.SphereGeometry(13, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1), '#efe2c2', cx, FLOOR, cz);
      add(new THREE.CylinderGeometry(1.8, 1.8, 1.2, 12), '#d8c9a4', cx, FLOOR + 15.4, cz);
      add(new THREE.TorusGeometry(10.5, 0.9, 6, 32, Math.PI * 0.9).rotateX(Math.PI / 2), '#cdbd96', cx, FLOOR + 6, cz);
    } else if (kind === 'temple') { // a white-and-saffron shikhara with a flag
      grass('#d9cba8');
      const profile = [[0, 0], [7, 0], [7, 4], [5.5, 6], [5, 14], [3.6, 20], [1.6, 24], [0, 25.5]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(profile, 8), '#f4f0e6', cx, FLOOR, cz, { flatShading: true });
      add(new THREE.SphereGeometry(1.1, 10, 8), '#f2a32a', cx, FLOOR + 26, cz, { metalness: 0.4 });
      add(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), '#555', cx, FLOOR + 29, cz);
      add(new THREE.PlaneGeometry(2.6, 1.4).translate(1.3, 0, 0), '#ff8c1a', cx, FLOOR + 31, cz, { side: THREE.DoubleSide });
    } else if (kind === 'mosque') { // a white dome and two minarets
      grass('#d9cba8');
      add(new THREE.BoxGeometry(22, 8, 16), '#f4f0e6', cx, FLOOR + 4, cz);
      add(new THREE.SphereGeometry(6.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', cx, FLOOR + 8, cz);
      for (const dx of [-11, 11]) {
        add(new THREE.CylinderGeometry(0.9, 1.1, 20, 10), '#f4f0e6', cx + dx, FLOOR + 10, cz - 8);
        add(new THREE.SphereGeometry(1.2, 10, 8), '#ffffff', cx + dx, FLOOR + 20.5, cz - 8);
      }
    }
  }

  // Autos, cars and buses running up and down the side roads.
  addTraffic(z0, zMin, zMax) {
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = this.material(new THREE.MeshStandardMaterial({ roughness: 0.6 }));
    this.vehicles = [];
    const items = [];
    for (let i = 0; i < 70; i++) {
      const alongX = Math.random() < 0.5;
      const bus = Math.random() < 0.12;
      const size = bus ? [2.6, 3, 10] : Math.random() < 0.5 ? [1.5, 1.8, 2.6] : [1.8, 1.5, 4.2];
      let lane;
      if (alongX) { // an east-west road
        const n = Math.floor(rand(-AHEAD / BLOCK_Z, BEHIND / BLOCK_Z));
        lane = z0 + n * BLOCK_Z + (Math.random() < 0.5 ? -2 : 2);
      } else { // a north-south road (not the main street)
        let n = 0;
        while (n === 0) n = Math.floor(rand(-EXTENT_X / BLOCK_X, EXTENT_X / BLOCK_X));
        lane = n * BLOCK_X + (Math.random() < 0.5 ? -2 : 2);
      }
      // East-west traffic keeps to one side of the main street (it doesn't cross world.js's buildings).
      const side = Math.random() < 0.5 ? -1 : 1;
      const [min, max] = alongX ? (side > 0 ? [STREET_CLEAR_X, EXTENT_X] : [-EXTENT_X, -STREET_CLEAR_X]) : [zMin, zMax];
      const v = { alongX, lane, size, speed: rand(6, 13) * (Math.random() < 0.5 ? -1 : 1), pos: rand(min, max), min, max };
      this.vehicles.push(v);
      items.push([new THREE.Matrix4(), bus ? '#d62828' : pick(VEHICLES)]);
    }
    this.traffic = instanced(geo, mat, items);
    this.group.add(this.traffic);
    this.moveTraffic(0);
  }

  moveTraffic(dt) {
    const m = new THREE.Matrix4();
    this.vehicles.forEach((v, i) => {
      v.pos += v.speed * dt;
      if (v.pos > v.max) v.pos = v.min;
      if (v.pos < v.min) v.pos = v.max;
      const [w, h, l] = v.size;
      const x = v.alongX ? v.pos : v.lane;
      const z = v.alongX ? v.lane : v.pos;
      m.compose(new THREE.Vector3(x, FLOOR, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.alongX ? Math.PI / 2 : 0, 0)), new THREE.Vector3(w, h, l));
      this.traffic.setMatrixAt(i, m);
    });
    this.traffic.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.moveTraffic(dt);
  }

  // The run has started: world.js builds the street ahead from here on.
  handOver() {
    this.streetAhead.visible = false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    for (const m of this.materials) {
      m.map?.dispose();
      m.dispose();
    }
  }
}
