import * as THREE from 'three';
import { particleMaterial } from './effects.js';
import {
  LANES, LANE_WIDTH, TUBE_RADIUS, CORNER_RADIUS, SEGMENT_LENGTH, SEGMENT_COUNT, placeOnWall,
} from './config.js';

const WINDOW_CHANCE = 0.12;
const DECOR_PER_SEGMENT = 4;
const PLANKTON_COUNT = 350;
const PLANKTON_SPAN = 80; // metres of water around the player that hold plankton

const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });

// Per-zone look of the tunnel.
function buildSkins() {
  return {
    space: {
      panels: [
        standard(0x161d36, { roughness: 0.8, metalness: 0.3 }),
        standard(0x1e2747, { roughness: 0.8, metalness: 0.3 }),
      ],
      strip: new THREE.MeshBasicMaterial({ color: 0x2de2ff }),
      rings: [new THREE.MeshBasicMaterial({ color: 0x35e8ff }), new THREE.MeshBasicMaterial({ color: 0xff3d9a })],
    },
    water: {
      panels: [standard(0x0f3a44, { roughness: 1 }), standard(0x14484f, { roughness: 1 })],
      strip: new THREE.MeshBasicMaterial({ color: 0xff7a59 }),
      rings: [new THREE.MeshBasicMaterial({ color: 0x46e0c0 }), new THREE.MeshBasicMaterial({ color: 0xff7a59 })],
    },
  };
}

// Kelp strands and coral lumps that grow from the tunnel's corners underwater.
// Corners sit between lanes, so they never block the player.
function buildDecor() {
  const kelpGeo = new THREE.ConeGeometry(0.16, 1.8, 4).translate(0, 0.9, 0);
  const coralGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const kelpMat = standard(0x2fbf71, { emissive: 0x0b3a20 });
  const coralMats = [standard(0xff6f91, { emissive: 0x3a0f1c }), standard(0xffb347, { emissive: 0x3a250b })];
  return [
    new THREE.Mesh(kelpGeo, kelpMat),
    new THREE.Mesh(kelpGeo, kelpMat),
    new THREE.Mesh(coralGeo, coralMats[0]),
    new THREE.Mesh(coralGeo, coralMats[1]),
  ];
}

// The tunnel: a ring of recycled octagonal segments, dressed for whichever zone
// they fall in, plus the scenery of each zone.
export class Tube {
  constructor(scene, zones) {
    this.zones = zones;
    this.skins = buildSkins();
    this.windowMat = new THREE.MeshStandardMaterial({
      color: 0x4fb6ff, transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false,
    });
    const panelGeo = new THREE.BoxGeometry(LANE_WIDTH * 0.98, 0.3, SEGMENT_LENGTH).translate(0, -0.15, 0);
    const stripGeo = new THREE.BoxGeometry(0.07, 0.07, SEGMENT_LENGTH);
    const ringGeo = new THREE.TorusGeometry(CORNER_RADIUS, 0.1, 4, LANES).rotateZ(Math.PI / LANES);

    this.segments = [];
    for (let s = 0; s < SEGMENT_COUNT; s++) {
      const seg = new THREE.Group();
      seg.index = s;
      seg.panels = [];
      seg.strips = [];
      for (let i = 0; i < LANES; i++) {
        const panel = new THREE.Mesh(panelGeo);
        placeOnWall(panel, i, 0, 0);
        seg.add(panel);
        seg.panels.push(panel);

        const strip = new THREE.Mesh(stripGeo);
        placeOnWall(strip, i + 0.5, TUBE_RADIUS - CORNER_RADIUS + 0.1, 0);
        seg.add(strip);
        seg.strips.push(strip);
      }
      seg.ring = new THREE.Mesh(ringGeo);
      seg.ring.position.z = SEGMENT_LENGTH / 2;
      seg.add(seg.ring);
      seg.decor = buildDecor();
      seg.add(...seg.decor);
      scene.add(seg);
      this.segments.push(seg);
    }

    this.backdrop = createBackdrop();
    scene.add(this.backdrop);
    this.plankton = createPlankton();
    scene.add(this.plankton);
    this.setZone('space');
    this.reset();
  }

  reset(playerZ = 0) {
    this.segments.forEach((seg, s) => {
      seg.position.z = playerZ + SEGMENT_LENGTH - s * SEGMENT_LENGTH;
      this.decorate(seg, s < 3);
    });
  }

  decorate(seg, plain) {
    const zone = this.zones.zoneAt(seg.position.z);
    const skin = this.skins[zone];
    seg.panels.forEach((panel, i) => {
      const glass = zone === 'space' && !plain && Math.random() < WINDOW_CHANCE;
      panel.material = glass ? this.windowMat : skin.panels[i % 2];
    });
    for (const strip of seg.strips) strip.material = skin.strip;
    seg.ring.material = skin.rings[seg.index % 2];

    for (const item of seg.decor) {
      item.visible = zone === 'water';
      if (!item.visible) continue;
      const corner = Math.floor(Math.random() * LANES) + 0.5;
      placeOnWall(item, corner, TUBE_RADIUS - CORNER_RADIUS, (Math.random() - 0.5) * SEGMENT_LENGTH);
      item.rotation.y = Math.random() * Math.PI;
    }
  }

  // Scenery that belongs to the zone the player is in.
  setZone(zone, playerZ = 0) {
    this.backdrop.visible = zone === 'space';
    this.plankton.visible = zone === 'water';
    if (zone === 'water') {
      for (let i = 0; i < PLANKTON_COUNT; i++) this.placeSpeck(i, playerZ + 10 - Math.random() * PLANKTON_SPAN);
    }
  }

  placeSpeck(i, z) {
    const positions = this.plankton.geometry.attributes.position.array;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (TUBE_RADIUS - 0.5);
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.sin(a) * r;
    positions[i * 3 + 2] = z;
  }

  update(dt, playerZ) {
    const loop = SEGMENT_COUNT * SEGMENT_LENGTH;
    for (const seg of this.segments) {
      if (seg.position.z - SEGMENT_LENGTH / 2 > playerZ + 12) {
        seg.position.z -= loop;
        this.decorate(seg, false);
      }
    }
    this.backdrop.position.z = playerZ;

    if (this.plankton.visible) {
      // Plankton is fixed in the water; recycle what falls behind to the far end.
      const positions = this.plankton.geometry.attributes.position.array;
      for (let i = 0; i < PLANKTON_COUNT; i++) {
        if (positions[i * 3 + 2] > playerZ + 10) this.placeSpeck(i, playerZ - PLANKTON_SPAN + Math.random() * 10);
        else positions[i * 3 + 1] += dt * 0.3; // slow drift
      }
      this.plankton.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// Distant space scenery that travels with the player, so it reads as infinitely far.
function createBackdrop() {
  const group = new THREE.Group();

  const count = 1600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 120;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.sin(a) * r;
    positions[i * 3 + 2] = 60 - Math.random() * 400;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, fog: false })));

  // The ocean planet the courier will eventually fall into.
  const planet = new THREE.Mesh(
    new THREE.IcosahedronGeometry(110, 2),
    new THREE.MeshStandardMaterial({ color: 0x1a5fb0, emissive: 0x041a3a, flatShading: true, fog: false }),
  );
  planet.position.set(70, -170, -330);
  group.add(planet);

  return group;
}

// Specks drifting in the water inside the tunnel.
function createPlankton() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLANKTON_COUNT * 3), 3));
  const plankton = new THREE.Points(geometry, particleMaterial({
    color: 0xbff7ff, size: 0.1, opacity: 0.7, maxPixels: 5,
  }));
  plankton.frustumCulled = false; // positions are rewritten every frame
  return plankton;
}
