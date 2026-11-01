import * as THREE from 'three';
import { TUBE_RADIUS } from './config.js';

// Old Patna for the opening drone shot: a real 3D city round the start of the
// first delivery, dressed in the painted art: every wall wears a painted
// shopfront (public/art/facades/), every roof a painted rooftop seen from
// above (public/art/roofs/), with a few 3D water tanks and trees for depth.
// The gameplay street (world.js) runs down the middle; the city leaves room
// for it, and its houses along the street further ahead are hidden once the
// run starts (world.js builds that street itself as Bholu rides).
// Everything is merged per texture, so the whole city is about 15 draw calls.

const FLOOR = -TUBE_RADIUS;
const FACADES = ['fa-sweets', 'fa-mobile', 'fa-chai', 'fa-cloth', 'fa-medical', 'fa-litti', 'fa-books', 'fa-tent'];
const ROOFS = ['rf-tank', 'rf-solar', 'rf-garden', 'rf-plain'];
const LOT = 9.6; // a house's frontage (one facade picture wide)
const DEPTH = 12; // and how deep it is
const LANE = 6; // lanes between blocks (give or take)
const STREET_EDGE = 7.2; // the gameplay street's kerb-to-shopfront half width
const STREET_CLEAR = 25; // world.js owns |x| < this along the stretch it draws
const EXTENT_X = 175;
const AHEAD = 430; // city reaches this far ahead of the start (-z)
const BEHIND = 90;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Quads with UVs, merged into one geometry per texture.
// Each quad can be tinted per vertex: walls darken towards the ground (as in a
// real narrow lane), parapets and stair huts take a wall colour.
class Quads {
  constructor() {
    this.position = [];
    this.uv = [];
    this.color = [];
    this.index = [];
  }

  // a b c d go round the quad from its bottom left; `bottom`/`top` tint the lower and upper edge.
  add(a, b, c, d, { bottom = WHITE, top = WHITE, u = 1, v = 1 } = {}) {
    const base = this.position.length / 3;
    for (const p of [a, b, c, d]) this.position.push(...p);
    this.uv.push(0, 0, u, 0, u, v, 0, v);
    for (const c of [bottom, bottom, top, top]) this.color.push(c.r, c.g, c.b);
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // A box's four sides (x0..x1, y0..y1, z0..z1).
  sides(x0, y0, z0, x1, y1, z1, tint) {
    this.add([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], tint);
    this.add([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], tint);
    this.add([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], tint);
    this.add([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], tint);
  }

  top(x0, y, z0, x1, z1, tint) {
    this.add([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], tint);
  }

  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.setIndex(this.index);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
}

// Where the opening's sun sits (relative to the city's middle): ahead and to
// the right, so shadows fall across the lanes towards the camera.
const SUN = new THREE.Vector3(300, 280, -220);
const SUN_FLAT = Math.hypot(SUN.x, SUN.z);
const SHADOW_STRETCH = SUN_FLAT / SUN.y; // ground shadow length per metre of height
const SHADOW_DIR = { x: -SUN.x / SUN_FLAT, z: -SUN.z / SUN_FLAT }; // which way shadows fall

const WHITE = new THREE.Color(1, 1, 1);
const GROUND_SHADE = new THREE.Color(0.55, 0.55, 0.58); // the foot of a wall in a narrow lane
const WALL_COLOURS = ['#efe2c4', '#f2c7bd', '#cfe3c6', '#f5dc95', '#c8dbec', '#f3c99c', '#e6d3ec', '#f7b9a5'].map((c) => new THREE.Color(c));

export class City {
  // startZ: where the run starts; streetTo..streetFrom: the z range world.js draws now.
  constructor(scene, startZ, streetFrom, streetTo) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.streetAhead = new THREE.Group();
    this.endZ = startZ - AHEAD - 40; // thrown away once Bholu is past this
    this.disposables = [];
    const loader = new THREE.TextureLoader();
    const material = (folder, name) => {
      const map = loader.load(`/art/${folder}/${name}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; });
      map.anisotropy = 4;
      const m = new THREE.MeshStandardMaterial({ map, roughness: 1, vertexColors: true });
      this.disposables.push(map, m);
      return m;
    };
    this.facades = FACADES.map((name) => ({ material: material('facades', name), name }));
    this.roofs = ROOFS.map((name) => material('roofs', name));
    this.plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }); // parapets, stair huts
    this.disposables.push(this.plain);
    this.build(startZ, streetFrom, streetTo);
    scene.add(this.group);
  }

  build(z0, streetFrom, streetTo) {
    const newSet = () => ({ walls: FACADES.map(() => new Quads()), roofs: ROOFS.map(() => new Quads()), plain: new Quads() });
    const city = newSet();
    const ahead = newSet();
    const tanks = [];
    const trees = [];
    const footprints = []; // [x0, z0, x1, z1, height] of every house, for the baked shadows
    const zMin = z0 - AHEAD;
    const zMax = z0 + BEHIND;

    // A house: painted walls (a shopfront picture, darkening towards the
    // ground), a painted roof inside a low parapet, and often a stair hut.
    const house = (set, x0, za, x1, zb) => {
      const f = Math.floor(Math.random() * FACADES.length);
      const height = (x1 - x0 + zb - za) * 0.5 * FACADE_ASPECT[FACADES[f]] * rand(0.8, 1.25);
      const y0 = FLOOR;
      const y1 = FLOOR + height;
      set.walls[f].sides(x0, y0, za, x1, y1, zb, { bottom: GROUND_SHADE });
      if (set === city) footprints.push([x0, za, x1, zb, height]);
      set.roofs[Math.floor(Math.random() * ROOFS.length)].top(x0, y1, za, x1, zb);
      const wall = pick(WALL_COLOURS);
      const lip = 0.25; // parapet thickness
      set.plain.sides(x0, y1, za, x1, y1 + 0.9, za + lip, { bottom: wall, top: wall });
      set.plain.sides(x0, y1, zb - lip, x1, y1 + 0.9, zb, { bottom: wall, top: wall });
      set.plain.sides(x0, y1, za, x0 + lip, y1 + 0.9, zb, { bottom: wall, top: wall });
      set.plain.sides(x1 - lip, y1, za, x1, y1 + 0.9, zb, { bottom: wall, top: wall });
      if (Math.random() < 0.4) { // stair hut
        const hx = rand(x0 + 1, x1 - 3.6);
        const hz = rand(za + 1, zb - 3.6);
        set.plain.sides(hx, y1, hz, hx + 2.6, y1 + 2.6, hz + 2.6, { bottom: wall.clone().multiplyScalar(0.85), top: wall });
        set.plain.top(hx, y1 + 2.6, hz, hx + 2.6, hz + 2.6, { bottom: GROUND_SHADE, top: GROUND_SHADE });
      }
      return y1;
    };

    // Blocks of houses back to back on both sides of the main street, with
    // narrow lanes, uneven plots and the odd courtyard tree.
    for (const side of [-1, 1]) {
      for (let x = STREET_EDGE; x < EXTENT_X; x += DEPTH * 2 + rand(LANE * 0.6, LANE * 1.2)) {
        for (let z = zMax; z > zMin; z -= rand(4, 8)) { // a cross lane after each block
          const houses = 4 + Math.floor(Math.random() * 4);
          for (let lot = 0; lot < houses && z > zMin; lot++) {
            const width = rand(LOT * 0.75, LOT * 1.15);
            const zb = z;
            const za = z - width;
            z = za;
            for (const row of [0, 1]) {
              const xa = x + row * DEPTH;
              const setback = row === 0 && Math.random() < 0.3 ? rand(0.4, 1.4) : 0;
              const [x0, x1] = side > 0 ? [xa + setback, xa + DEPTH] : [-xa - DEPTH, -xa - setback];
              const nearStreet = xa < STREET_CLEAR;
              const drawnByWorld = nearStreet && zb > streetTo - 4 && za < streetFrom + 4;
              if (drawnByWorld) continue;
              const set = nearStreet ? ahead : city;
              if (!nearStreet && Math.random() < 0.12) { // a courtyard tree instead of a house
                trees.push([(x0 + x1) / 2, (za + zb) / 2, rand(3.5, 5.5)]);
                continue;
              }
              const top = house(set, x0, za + 0.15, x1, zb - 0.15);
              if (!nearStreet && Math.random() < 0.5) tanks.push([rand(x0 + 2, x1 - 2), top, rand(za + 2, zb - 2)]);
            }
          }
        }
      }
    }

    for (let i = 0; i < FACADES.length; i++) {
      this.group.add(city.walls[i].mesh(this.facades[i].material));
      this.streetAhead.add(ahead.walls[i].mesh(this.facades[i].material));
    }
    for (let i = 0; i < ROOFS.length; i++) {
      this.group.add(city.roofs[i].mesh(this.roofs[i]));
      this.streetAhead.add(ahead.roofs[i].mesh(this.roofs[i]));
    }
    this.group.add(city.plain.mesh(this.plain));
    this.streetAhead.add(ahead.plain.mesh(this.plain));
    this.group.add(this.streetAhead);

    // Ground: packed earth, with the lanes and the main street in asphalt.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(EXTENT_X * 2 + 200, AHEAD + BEHIND + 300).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 1 }),
    );
    ground.position.set(0, FLOOR - 0.08, (zMin + zMax) / 2);
    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(STREET_EDGE * 2, AHEAD + BEHIND).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x55565b, roughness: 1 }),
    );
    street.position.set(0, FLOOR - 0.05, (zMin + zMax) / 2);
    this.group.add(ground, street, this.bakedShadows(footprints));
    this.disposables.push(ground.geometry, ground.material, street.geometry, street.material);

    // A few real water tanks and trees, for parallax as the drone flies over.
    const tankGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12).translate(0, 0.75, 0);
    const tankMesh = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.6 }), Math.max(1, tanks.length));
    tanks.forEach(([x, y, z], i) => tankMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), Math.max(1, trees.length));
    trees.forEach(([x, z, r], i) => leafMesh.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3(x, FLOOR + r * 1.4, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.85, r),
    )));
    leafMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, trees.length) * 3), 3);
    trees.forEach((_, i) => leafMesh.setColorAt(i, new THREE.Color(pick(['#4f9a3c', '#3f8a3a', '#6aa84a', '#5c9c3f']))));
    this.group.add(tankMesh, leafMesh);
    this.disposables.push(tankGeo, tankMesh.material, leafGeo, leafMesh.material);
  }

  // Shadows baked onto the ground: each house throws the shape of its
  // footprint swept away from the sun, drawn as one soft dark layer over the
  // lanes. The city never moves, so this looks like real sunlight at almost
  // no cost (and works on every phone).
  bakedShadows(footprints) {
    const position = [];
    for (const [x0, z0, x1, z1, height] of footprints) {
      const dx = SHADOW_DIR.x * height * SHADOW_STRETCH;
      const dz = SHADOW_DIR.z * height * SHADOW_STRETCH;
      const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      const hull = convexHull([...corners, ...corners.map(([x, z]) => [x + dx, z + dz])]);
      for (let i = 1; i < hull.length - 1; i++) {
        for (const [x, z] of [hull[0], hull[i + 1], hull[i]]) position.push(x, FLOOR - 0.05, z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    const material = new THREE.MeshBasicMaterial({ color: 0x1a1830, transparent: true, opacity: 0.38, depthWrite: false });
    this.disposables.push(geometry, material);
    return new THREE.Mesh(geometry, material);
  }

  // Light the opening to match the baked shadows: the sun moves to their side
  // of the sky (main.js turns its strength up for the drone shot).
  light(sun) {
    this.sun = sun;
    this.sunHome = sun.position.clone();
    sun.position.copy(SUN);
  }

  // The run has started: world.js builds the street ahead from here on.
  handOver() {
    this.streetAhead.visible = false;
  }

  dispose() {
    if (this.sun) this.sun.position.copy(this.sunHome); // back to the gameplay's sun
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose());
    for (const d of this.disposables) d.dispose();
  }
}

// Height / width of each painted shopfront (tools/gen_props.py makes them at these shapes).
const FACADE_ASPECT = {
  'fa-sweets': 770 / 512, 'fa-mobile': 686 / 512, 'fa-chai': 612 / 512, 'fa-cloth': 917 / 512,
  'fa-medical': 686 / 512, 'fa-litti': 512 / 512, 'fa-books': 917 / 512, 'fa-tent': 917 / 512,
};

// The convex hull of 2D points [x, z] (monotone chain), anticlockwise.
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
