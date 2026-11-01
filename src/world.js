import * as THREE from 'three';
import {
  LANES, LANE_WIDTH, TUBE_RADIUS, CORNER_RADIUS, SEGMENT_LENGTH, SEGMENT_COUNT,
  ROAD_WIDTH, ROAD_LANE_WIDTH, placeOnWall,
} from './config.js';

// The world the run goes through: a ring of recycled 10 m segments. Each
// segment holds both looks and shows the one for the zone it falls in:
// - road: a Patna street (asphalt, painted kerbs, shopfronts, lamps, wires);
// - tunnel: a concrete nala / underpass (an octagonal tube with pipes and lamps).

const FLOOR = -TUBE_RADIUS;
const SIDEWALK = 2.2;
const BUILDING_DEPTH = 6;
const BUILDING_X = ROAD_WIDTH / 2 + SIDEWALK + BUILDING_DEPTH / 2;
const BEHIND = 12; // metres of street kept behind Riya (more while a cutscene camera trails her)

const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Shopfronts of old Patna: a painted wall, windows with balconies above, a
// shop sign and shutters at street level.
const SHOPS = [
  ['शर्मा स्वीट्स', '#d6246e'], ['Litti Point', '#f59e1b'], ['Jha Medical Hall', '#0e6b68'],
  ['मोबाइल रिपेयर', '#1f5fbf'], ['Laxmi Cloth House', '#8a2be2'], ['चाय · नाश्ता', '#c0392b'],
  ['Raj Tent House', '#2e8b3a'], ['Sinha Photo Studio', '#d35400'], ['किताब घर', '#6d4c41'],
  ['Shiv Hardware', '#455a64'],
];
const WALLS = ['#e8c9a0', '#d9a6a0', '#a8d0c4', '#f0dca0', '#c8b8d8', '#e0b080', '#b8c8a0', '#e8e0d0'];

function facade(shop, wall) {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; // weathering streaks
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.random() * w, 0, 6 + Math.random() * 14, h * (0.3 + Math.random() * 0.6));
    for (let floor = 0; floor < 4; floor++) { // windows with balconies
      const y = 40 + floor * 190;
      for (const x of [50, 290]) {
        ctx.fillStyle = Math.random() < 0.35 ? '#ffd27a' : '#2b3340';
        ctx.fillRect(x, y, 170, 110);
        ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 8; ctx.strokeRect(x, y, 170, 110);
        ctx.fillStyle = '#3a3a3a';
        for (let r = 0; r < 9; r++) ctx.fillRect(x - 10 + r * 23, y + 115, 5, 40);
        ctx.fillRect(x - 14, y + 112, 200, 7);
        ctx.fillRect(x - 14, y + 150, 200, 7);
        if (Math.random() < 0.4) { // laundry drying on the balcony
          ctx.fillStyle = pick(['#d62828', '#ffc21a', '#1f5fbf', '#fff']);
          ctx.fillRect(x + 20 + Math.random() * 100, y + 118, 30, 30);
        }
      }
    }
    ctx.fillStyle = shop[1]; // the shop sign
    ctx.fillRect(10, h - 260, w - 20, 80);
    ctx.fillStyle = '#fff1d6';
    ctx.font = 'bold 54px "Noto Sans Devanagari", "Nirmala UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(shop[0], w / 2, h - 220, w - 50);
    ctx.fillStyle = '#7a7f86'; // rolling shutter, half open
    ctx.fillRect(30, h - 170, w - 60, 90);
    ctx.strokeStyle = '#5a5f66'; ctx.lineWidth = 3;
    for (let y = h - 165; y < h - 80; y += 10) { ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(w - 30, y); ctx.stroke(); }
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(30, h - 80, w - 60, 80); // lit shop inside
  });
}

// The second row of buildings: plain painted walls with windows, AC boxes and
// sunshades. One storey per tile; it repeats up the wall.
const STOREY = 3.2; // metres
function backFacade(wall) {
  const texture = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.random() * w, 0, 4 + Math.random() * 10, h);
    for (const x of [22, 100, 178]) {
      ctx.fillStyle = Math.random() < 0.3 ? '#ffd27a' : '#2b3340';
      ctx.fillRect(x, 30, 56, 64);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, 30, 56, 6); // sunshade
      if (Math.random() < 0.35) { ctx.fillStyle = '#d8d4cc'; ctx.fillRect(x + 8, 96, 40, 18); } // AC box
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// The road's daytime haze, where the ground and sky meet (also the fog colour; see main.js).
const HAZE = '#d9e8ef';

// The sky: a dome shading from clear blue overhead to haze at the horizon.
function skyTexture() {
  return canvasTexture(4, 256, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#3f8fd8');
    sky.addColorStop(0.35, '#7db7e8');
    sky.addColorStop(0.5, HAZE); // the horizon
    sky.addColorStop(1, HAZE);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  });
}

// A painted Patna skyline by day, wrapped round the far distance: water tanks
// on flat roofs, a temple spire, a mosque, Golghar's dome, mobile towers and
// palms in two hazy layers, a few soft clouds above, fading into the haze at
// the bottom. The sky itself is left clear so the dome shows through.
function skylineTexture() {
  return canvasTexture(3072, 640, (ctx, w, h) => {
    const base = h * (1 - SKYLINE.ground); // where the far ground meets the sky
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; // clouds
    for (let i = 0; i < 18; i++) {
      const cx = Math.random() * w;
      const cy = h * (0.12 + Math.random() * 0.3);
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(cx + (k - 2) * 26, cy - Math.sin((k / 4) * Math.PI) * 14, 34, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const layer = (color, minH, maxH, landmarks) => {
      ctx.fillStyle = color;
      let x = 0;
      while (x < w) {
        const bw = 30 + Math.random() * 70;
        const bh = minH + Math.random() * (maxH - minH);
        ctx.fillRect(x, base - bh, bw + 1, bh);
        if (Math.random() < 0.55) { // water tank on the roof
          const tx = x + 6 + Math.random() * (bw - 22);
          ctx.fillRect(tx, base - bh - 13, 14, 13);
          ctx.fillRect(tx - 2, base - bh - 15, 18, 3);
        }
        if (Math.random() < 0.15) ctx.fillRect(x + bw * 0.6, base - bh - 18, 3, 18); // TV antenna
        x += bw;
      }
      for (const [kind, at] of landmarks) drawLandmark(ctx, kind, at * w, base);
    };
    layer('rgba(176,196,210,0.9)', 22, 70, [['dome', 0.18], ['tower', 0.42], ['spire', 0.66], ['palm', 0.9]]);
    layer('rgba(140,160,176,0.95)', 10, 46, [['golghar', 0.08], ['minarets', 0.34], ['palm', 0.55], ['spire', 0.8], ['tower', 0.97]]);

    const haze = ctx.createLinearGradient(0, base - 30, 0, h);
    haze.addColorStop(0, 'rgba(217,232,239,0)');
    haze.addColorStop(0.3, HAZE);
    ctx.fillStyle = haze;
    ctx.fillRect(0, base - 30, w, h - base + 30);
    ctx.fillStyle = 'rgba(40,50,60,0.5)'; // a few birds
    for (let i = 0; i < 14; i++) {
      const bx = Math.random() * w;
      const by = h * (0.25 + Math.random() * 0.3);
      ctx.fillRect(bx, by, 5, 1.5);
      ctx.fillRect(bx + 5, by - 1.5, 4, 1.5);
    }
  });
}

function drawLandmark(ctx, kind, x, base) {
  ctx.beginPath();
  if (kind === 'dome') { // a mosque dome on a drum, with a finial
    ctx.fillRect(x - 40, base - 70, 80, 70);
    ctx.arc(x, base - 70, 40, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 2, base - 128, 4, 20);
  } else if (kind === 'minarets') {
    for (const dx of [-46, 46]) {
      ctx.fillRect(x + dx - 6, base - 120, 12, 120);
      ctx.beginPath();
      ctx.arc(x + dx, base - 120, 8, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillRect(x - 38, base - 60, 76, 60);
    ctx.beginPath();
    ctx.arc(x, base - 60, 30, Math.PI, 0);
    ctx.fill();
  } else if (kind === 'spire') { // a temple shikhara with a flag
    ctx.moveTo(x - 34, base);
    ctx.lineTo(x - 26, base - 70);
    ctx.quadraticCurveTo(x, base - 150, x + 26, base - 70);
    ctx.lineTo(x + 34, base);
    ctx.fill();
    ctx.fillRect(x - 1, base - 175, 2, 30);
    ctx.fillRect(x + 1, base - 175, 18, 9);
  } else if (kind === 'golghar') { // Patna's beehive granary
    ctx.ellipse(x, base, 70, 64, 0, Math.PI, 0);
    ctx.fill();
  } else if (kind === 'tower') { // mobile tower
    ctx.moveTo(x - 14, base);
    ctx.lineTo(x - 2, base - 150);
    ctx.lineTo(x + 2, base - 150);
    ctx.lineTo(x + 14, base);
    ctx.fill();
    ctx.fillRect(x - 10, base - 140, 20, 6);
  } else if (kind === 'palm') {
    ctx.fillRect(x - 2, base - 90, 4, 90);
    for (let a = 0; a < 7; a++) {
      const angle = Math.PI + (a / 6) * Math.PI;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(angle) * 18, base - 92 + Math.sin(angle) * 8, 22, 5, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The skyline backdrop: an open cylinder far round the player, drawn behind
// everything and ignoring the fog. `ground` is the fraction of its height
// below the painted ground line; that line sits a little below the road, so
// the city reads as far away.
const SKYLINE = { radius: 420, bottom: FLOOR - 40, height: 210, ground: 0.19 };

function asphalt() {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4a4b50';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; // tyre tracks
    for (const x of [40, 90, 166, 216]) ctx.fillRect(x, 0, 10, h);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  return texture;
}

function kerbStripes() {
  const texture = canvasTexture(128, 16, (ctx, w, h) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#1a1a1a' : '#ffd23d';
      ctx.fillRect(i * 32, 0, 32, h);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(4, 1);
  return texture;
}

function buildRoad(materials) {
  const road = new THREE.Group();
  road.add(new THREE.Mesh(materials.roadGeo, materials.asphalt));
  for (const x of [-ROAD_LANE_WIDTH / 2, ROAD_LANE_WIDTH / 2]) {
    for (const z of [-2.5, 2.5]) road.add(mesh(materials.dashGeo, materials.paint, x, FLOOR + 0.01, z));
  }
  for (const side of [-1, 1]) {
    road.add(mesh(materials.sidewalkGeo, materials.sidewalk, side * (ROAD_WIDTH / 2 + SIDEWALK / 2), FLOOR + 0.12, 0));
    const kerb = mesh(materials.kerbGeo, materials.kerb, side * (ROAD_WIDTH / 2 + 0.05), FLOOR + 0.12, 0);
    road.add(kerb);
  }
  const buildings = [];
  for (const side of [-1, 1]) {
    const building = new THREE.Mesh(materials.buildingGeo);
    building.side = side;
    road.add(building);
    buildings.push(building);
  }
  // A second row of buildings behind, and the ground out to the haze, so the
  // city doesn't end at the shopfronts. Flat roofs with black water tanks.
  for (const side of [-1, 1]) {
    for (const z of [-2.5, 2.5]) {
      const storeys = 2 + Math.floor(Math.random() * 5);
      const back = new THREE.Mesh(materials.backGeo, pick(materials.backWalls[storeys]));
      const x = side * (BUILDING_X + BUILDING_DEPTH + 1 + Math.random() * 3);
      back.position.set(x, FLOOR, z);
      back.scale.y = storeys * STOREY;
      road.add(back);
      if (Math.random() < 0.7) {
        road.add(mesh(materials.tankGeo, materials.tank, x + (Math.random() - 0.5) * 4, FLOOR + storeys * STOREY, z + (Math.random() - 0.5) * 2));
      }
    }
  }
  road.add(mesh(materials.groundGeo, materials.ground, 0, FLOOR - 0.05, 0));
  const lamp = new THREE.Group();
  lamp.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.5, 6), materials.pole, 0, FLOOR + 3.25, 0));
  lamp.add(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), materials.pole, -0.7, FLOOR + 6.4, 0));
  lamp.add(mesh(new THREE.BoxGeometry(0.45, 0.14, 0.25), materials.lampGlow, -1.3, FLOOR + 6.3, 0));
  road.add(lamp);
  const wires = new THREE.Group(); // the tangle of cables across every street
  for (let i = 0; i < 4; i++) {
    const wire = mesh(materials.wireGeo, materials.wire, 0, FLOOR + 7.2 + i * 0.35, (i - 1.5) * 1.2);
    wire.rotation.y = (Math.random() - 0.5) * 0.3;
    wires.add(wire);
  }
  road.add(wires);
  road.buildings = buildings;
  road.lamp = lamp;
  road.wires = wires;
  return road;
}

function buildTunnel(materials) {
  const tunnel = new THREE.Group();
  tunnel.panels = [];
  for (let i = 0; i < LANES; i++) {
    const panel = new THREE.Mesh(materials.panelGeo, materials.concrete[i % 2]);
    placeOnWall(panel, i, 0, 0);
    tunnel.add(panel);
    tunnel.panels.push(panel);
    const pipe = new THREE.Mesh(materials.pipeGeo, materials.pipe);
    placeOnWall(pipe, i + 0.5, TUBE_RADIUS - CORNER_RADIUS + 0.25, 0);
    tunnel.add(pipe);
  }
  const lamp = new THREE.Group(); // a caged lamp on the ceiling
  placeOnWall(lamp, 4, 0, 0);
  lamp.add(mesh(new THREE.BoxGeometry(0.6, 0.18, 0.35), materials.lampGlow, 0, 0.1, 0));
  lamp.add(mesh(new THREE.BoxGeometry(0.7, 0.04, 0.45), materials.pole, 0, 0.2, 0));
  tunnel.add(lamp);
  tunnel.add(mesh(new THREE.TorusGeometry(CORNER_RADIUS - 0.05, 0.12, 4, LANES).rotateZ(Math.PI / LANES), materials.rib, 0, 0, SEGMENT_LENGTH / 2));
  return tunnel;
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

function buildMaterials() {
  const facades = SHOPS.map((shop, i) => standard(0xffffff, { map: facade(shop, WALLS[i % WALLS.length]), flatShading: false }));
  const stencil = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6f6b64'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(30,25,20,0.35)';
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.8, w * 0.45, h * 0.2, 0, 0, Math.PI * 2); ctx.fill(); // damp patch
    ctx.fillStyle = '#e8e0d0'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(pick(['PATNA NAGAR NIGAM', 'NO PARKING', 'नाला संख्या 7', 'DANGER · खतरा']), w / 2, h * 0.35);
  });
  return {
    roadGeo: new THREE.PlaneGeometry(ROAD_WIDTH, SEGMENT_LENGTH).rotateX(-Math.PI / 2).translate(0, FLOOR, 0),
    dashGeo: new THREE.BoxGeometry(0.14, 0.02, 2.4),
    sidewalkGeo: new THREE.BoxGeometry(SIDEWALK, 0.25, SEGMENT_LENGTH),
    kerbGeo: new THREE.BoxGeometry(0.12, 0.27, SEGMENT_LENGTH),
    buildingGeo: new THREE.BoxGeometry(BUILDING_DEPTH, 1, SEGMENT_LENGTH * 0.96).translate(0, 0.5, 0),
    wireGeo: new THREE.CylinderGeometry(0.025, 0.025, ROAD_WIDTH + SIDEWALK * 2 + 2, 4).rotateZ(Math.PI / 2),
    backGeo: new THREE.BoxGeometry(BUILDING_DEPTH + 2, 1, SEGMENT_LENGTH * 0.45).translate(0, 0.5, 0),
    groundGeo: new THREE.PlaneGeometry(160, SEGMENT_LENGTH).rotateX(-Math.PI / 2),
    // backWalls[storeys]: windows on every wall (they show through the gaps), a plain roof.
    backWalls: Object.fromEntries([2, 3, 4, 5, 6].map((storeys) => [storeys, WALLS.map((wall) => {
      const texture = backFacade(wall);
      texture.repeat.set(1.5, storeys);
      const face = standard(0xffffff, { map: texture, roughness: 1 });
      const roof = standard(new THREE.Color(wall).multiplyScalar(0.6), { roughness: 1 });
      return [face, face, roof, roof, face, face];
    })])),
    tankGeo: new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10).translate(0, 0.6, 0),
    tank: standard(0x1c1c1e, { roughness: 0.7 }),
    ground: standard(0x8a7a66, { roughness: 1 }),
    panelGeo: new THREE.BoxGeometry(LANE_WIDTH * 0.99, 0.3, SEGMENT_LENGTH).translate(0, -0.15, 0),
    pipeGeo: new THREE.CylinderGeometry(0.16, 0.16, SEGMENT_LENGTH, 8).rotateX(Math.PI / 2),
    asphalt: standard(0xffffff, { map: asphalt(), roughness: 0.95, flatShading: false }),
    paint: standard(0xe8e6e0, { roughness: 0.9 }), // matte, so the dashes don't glow
    sidewalk: standard(0x9a9182, { roughness: 1 }),
    kerb: standard(0xffffff, { map: kerbStripes() }),
    plainWall: standard(0xb8aa96, { roughness: 1 }),
    roof: standard(0x6b6359),
    facades,
    pole: standard(0x3b3d42, { metalness: 0.5 }),
    lampGlow: basic(0xffd27a),
    wire: basic(0x141414),
    concrete: [standard(0x6f6b64, { roughness: 1 }), standard(0xffffff, { map: stencil, roughness: 1 })],
    pipe: standard(0x8a5a32, { metalness: 0.5, roughness: 0.6 }),
    rib: standard(0x56524b),
  };
}

export class World {
  constructor(scene, zones) {
    this.zones = zones;
    this.materials = buildMaterials();
    this.skyline = new THREE.Mesh(
      new THREE.CylinderGeometry(SKYLINE.radius, SKYLINE.radius, SKYLINE.height, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: skylineTexture(), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true }),
    );
    this.skyline.renderOrder = -1;
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(SKYLINE.radius + 150, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.sky.renderOrder = -2;
    scene.add(this.sky, this.skyline);
    this.segments = [];
    for (let s = 0; s < SEGMENT_COUNT; s++) {
      const seg = new THREE.Group();
      seg.road = buildRoad(this.materials);
      seg.tunnel = buildTunnel(this.materials);
      seg.add(seg.road, seg.tunnel);
      scene.add(seg);
      this.segments.push(seg);
    }
    this.reset();
  }

  // behind: metres of street to keep behind Riya until the next reset / keepBehind.
  reset(playerZ = 0, behind = BEHIND) {
    this.behind = behind;
    this.segments.forEach((seg, s) => {
      seg.position.z = playerZ + behind - 2 - s * SEGMENT_LENGTH;
      this.decorate(seg);
    });
  }

  keepBehind(metres = BEHIND) {
    this.behind = metres;
  }

  // The stretch of street currently built: [nearest z ahead, furthest z behind].
  get span() {
    const zs = this.segments.map((seg) => seg.position.z);
    return [Math.min(...zs) - SEGMENT_LENGTH / 2, Math.max(...zs) + SEGMENT_LENGTH / 2];
  }

  // Dress a segment for the zone it is in, with a fresh mix of buildings.
  decorate(seg) {
    const zone = this.zones.zoneAt(seg.position.z);
    seg.road.visible = zone === 'road';
    seg.tunnel.visible = zone === 'tunnel';
    if (zone === 'road') {
      for (const building of seg.road.buildings) {
        const height = 6 + Math.random() * 9;
        building.scale.y = height;
        building.position.set(building.side * BUILDING_X, FLOOR, 0);
        const front = pick(this.materials.facades);
        const { plainWall, roof } = this.materials;
        // BoxGeometry faces: +x, -x, +y, -y, +z, -z. The shopfront faces the road.
        building.material = building.side < 0
          ? [front, plainWall, roof, plainWall, plainWall, plainWall]
          : [plainWall, front, roof, plainWall, plainWall, plainWall];
      }
      const side = Math.random() < 0.5 ? -1 : 1;
      seg.road.lamp.position.x = side * (ROAD_WIDTH / 2 + 0.4);
      seg.road.lamp.scale.x = side; // arm reaches out over the road
      seg.road.wires.visible = Math.random() < 0.6;
    } else {
      for (const panel of seg.tunnel.panels) {
        panel.material = Math.random() < 0.12 ? this.materials.concrete[1] : this.materials.concrete[0];
      }
    }
  }

  update(dt, playerZ) {
    // The skyline travels with Riya so it stays on the horizon; hidden underground.
    this.skyline.position.set(0, SKYLINE.bottom + SKYLINE.height / 2, playerZ);
    this.sky.position.set(0, FLOOR, playerZ);
    this.skyline.visible = this.sky.visible = this.zones.zoneAt(playerZ) === 'road';
    const loop = SEGMENT_COUNT * SEGMENT_LENGTH;
    for (const seg of this.segments) {
      if (seg.position.z - SEGMENT_LENGTH / 2 > playerZ + this.behind) {
        seg.position.z -= loop;
        this.decorate(seg);
      }
    }
  }
}
