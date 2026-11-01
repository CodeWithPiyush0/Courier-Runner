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
const LANE = 7; // lanes between blocks
const STREET_EDGE = 7.2; // the gameplay street's kerb-to-shopfront half width
const STREET_CLEAR = 25; // world.js owns |x| < this along the stretch it draws
const EXTENT_X = 175;
const AHEAD = 430; // city reaches this far ahead of the start (-z)
const BEHIND = 90;
const LOTS_PER_BLOCK = 6; // houses in a row before a cross lane

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Quads with UVs, merged into one geometry per texture.
class Quads {
  constructor() {
    this.position = [];
    this.uv = [];
    this.index = [];
  }

  add(a, b, c, d) {
    const base = this.position.length / 3;
    for (const p of [a, b, c, d]) this.position.push(...p);
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.index);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }
}

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
      const m = new THREE.MeshStandardMaterial({ map, roughness: 1 });
      this.disposables.push(map, m);
      return m;
    };
    this.facades = FACADES.map((name) => ({ material: material('facades', name), name }));
    this.roofs = ROOFS.map((name) => material('roofs', name));
    this.build(startZ, streetFrom, streetTo);
    scene.add(this.group);
  }

  build(z0, streetFrom, streetTo) {
    const city = { walls: FACADES.map(() => new Quads()), roofs: ROOFS.map(() => new Quads()) };
    const ahead = { walls: FACADES.map(() => new Quads()), roofs: ROOFS.map(() => new Quads()) };
    const tanks = [];
    const trees = [];
    const zMin = z0 - AHEAD;
    const zMax = z0 + BEHIND;

    // A house: four painted walls (one shopfront picture per side) and a painted roof.
    const house = (set, x0, z0_, x1, z1) => {
      const f = Math.floor(Math.random() * FACADES.length);
      const height = LOT * FACADE_ASPECT[FACADES[f]] * rand(0.92, 1.08);
      const y0 = FLOOR;
      const y1 = FLOOR + height;
      const w = set.walls[f];
      w.add([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      w.add([x1, y0, z0_], [x0, y0, z0_], [x0, y1, z0_], [x1, y1, z0_]);
      w.add([x1, y0, z1], [x1, y0, z0_], [x1, y1, z0_], [x1, y1, z1]);
      w.add([x0, y0, z0_], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0_]);
      set.roofs[Math.floor(Math.random() * ROOFS.length)].add([x0, y1, z1], [x1, y1, z1], [x1, y1, z0_], [x0, y1, z0_]);
      return y1;
    };

    // Blocks of houses back to back, on both sides of the main street.
    for (const side of [-1, 1]) {
      for (let x = STREET_EDGE; x < EXTENT_X; x += DEPTH * 2 + LANE) {
        for (let z = zMax; z > zMin; z -= LOT * LOTS_PER_BLOCK + LANE) {
          for (let lot = 0; lot < LOTS_PER_BLOCK; lot++) {
            const za = z - (lot + 1) * LOT;
            const zb = za + LOT;
            for (const row of [0, 1]) {
              const xa = x + row * DEPTH;
              const [x0, x1] = side > 0 ? [xa, xa + DEPTH] : [-xa - DEPTH, -xa];
              const nearStreet = xa < STREET_CLEAR;
              const drawnByWorld = nearStreet && zb > streetTo - 4 && za < streetFrom + 4;
              if (drawnByWorld) continue;
              const set = nearStreet ? ahead : city;
              if (!nearStreet && Math.random() < 0.07) { // a courtyard tree instead of a house
                trees.push([(x0 + x1) / 2, (za + zb) / 2, rand(3.5, 5)]);
                continue;
              }
              const top = house(set, x0, za, x1, zb);
              if (!nearStreet && Math.random() < 0.35) tanks.push([rand(x0 + 2, x1 - 2), top, rand(za + 2, zb - 2)]);
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
    this.group.add(ground, street);
    this.disposables.push(ground.geometry, ground.material, street.geometry, street.material);

    // A few real water tanks and trees, for parallax as the drone flies over.
    const tankGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 12).translate(0, 0.75, 0);
    const tankMesh = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.6 }), Math.max(1, tanks.length));
    tanks.forEach(([x, y, z], i) => tankMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x4f9a3c, roughness: 1, flatShading: true }), Math.max(1, trees.length));
    trees.forEach(([x, z, r], i) => leafMesh.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3(x, FLOOR + r * 1.4, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.85, r),
    )));
    this.group.add(tankMesh, leafMesh);
    this.disposables.push(tankGeo, tankMesh.material, leafGeo, leafMesh.material);
  }

  // The run has started: world.js builds the street ahead from here on.
  handOver() {
    this.streetAhead.visible = false;
  }

  dispose() {
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
