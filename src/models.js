import * as THREE from 'three';
import { LANE_WIDTH, LANES, CORNER_RADIUS, TUBE_RADIUS } from './config.js';

// Low-poly track props (obstacles, pickups, gates, the drop-off), built from
// Three.js primitives. Every model faces -z (the run direction) and stands on
// y = 0. Models with motion get an `animate(time)` method. (Riya and the
// chasers are painted sprites: rider.js, chaser.js.)

const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });
const glowHalo = (color, opacity) => basic(color, {
  transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

const box = (w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------- track objects ----------

function hazardPanel() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c8571d';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#7a300e';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, s * 0.38, s, s * 0.24);
    ctx.fillStyle = '#ffd23d';
    for (let x = -s; x < s * 2; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, s * 0.38);
      ctx.lineTo(x + 22, s * 0.38);
      ctx.lineTo(x + 22 - s * 0.24, s * 0.62);
      ctx.lineTo(x - s * 0.24, s * 0.62);
      ctx.fill();
    }
    ctx.fillStyle = '#5a240c';
    for (const [x, y] of [[26, 26], [s - 26, 26], [26, s - 26], [s - 26, s - 26]]) {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Shared materials whose glow pulses (lasers, stings); see animateTrackMaterials.
const pulsing = [];

export function animateTrackMaterials(time) {
  for (const { material, base, speed } of pulsing) material.opacity = base * (0.7 + 0.3 * Math.sin(time * speed));
}

function laser(height, color, postHeight) {
  const edge = LANE_WIDTH * 0.46;
  const post = standard(0x3a405c, { metalness: 0.5 });
  const capMat = basic(color);
  const core = basic(0xffffff);
  const halo = glowHalo(color, 0.55);
  pulsing.push({ material: halo, base: 0.55, speed: 14 });
  const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, LANE_WIDTH * 0.92, 6).rotateZ(Math.PI / 2);
  const haloGeo = new THREE.CylinderGeometry(0.14, 0.14, LANE_WIDTH * 0.92, 8).rotateZ(Math.PI / 2);
  const postGeo = new THREE.BoxGeometry(0.22, postHeight, 0.22);
  const capGeo = new THREE.OctahedronGeometry(0.16, 0);

  return () => {
    const g = new THREE.Group();
    g.add(mesh(beamGeo, core, 0, height), mesh(haloGeo, halo, 0, height));
    for (const side of [-1, 1]) {
      g.add(mesh(postGeo, post, side * edge, postHeight / 2));
      g.add(mesh(capGeo, capMat, side * edge, height));
    }
    return g;
  };
}

// Factories for every object on the track. A key like 'wall@water' is the
// underwater look of 'wall'; types without one look the same everywhere.
export function buildTrackMakers() {
  // ----- space -----
  const crateSide = standard(0xc8571d, { map: hazardPanel(), roughness: 0.7 });
  const crateTop = standard(0x9a4318, { roughness: 0.8 });
  const frame = standard(0x2a2f45, { metalness: 0.6, roughness: 0.4 });
  const crateGeo = new THREE.BoxGeometry(LANE_WIDTH * 0.78, 2.5, 1.3);
  const crateMats = [crateSide, crateSide, crateTop, crateTop, crateSide, crateSide];
  const cw = LANE_WIDTH * 0.4;
  const postGeo = new THREE.BoxGeometry(0.16, 2.6, 0.16);
  const rimGeo = new THREE.BoxGeometry(LANE_WIDTH * 0.82, 0.14, 0.16);

  // ----- water -----
  const rockMats = [standard(0xd9576b, { emissive: 0x4a1422 }), standard(0xa64fd0, { emissive: 0x2a1040 })];
  const branchMat = standard(0xffb347, { emissive: 0x3a250b });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const branchGeo = new THREE.ConeGeometry(0.13, 0.9, 5).translate(0, 0.45, 0);
  const urchinCore = standard(0x3a1a5c, { emissive: 0x7a2fd0 });
  const spikeGeo = new THREE.ConeGeometry(0.05, 0.42, 4).translate(0, 0.3, 0);
  const stingCore = basic(0xe2b8ff);
  const stingHalo = glowHalo(0xb04dff, 0.45);
  pulsing.push({ material: stingHalo, base: 0.45, speed: 9 });
  const bellGeo = new THREE.SphereGeometry(0.7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const bellMat = standard(0xff6fd8, { emissive: 0xb02a90, transparent: true, opacity: 0.8 });
  const innerMat = glowHalo(0xffb3ef, 0.6);
  const frillGeo = new THREE.TorusGeometry(0.68, 0.06, 4, 10).rotateX(Math.PI / 2);
  const tentacleGeo = new THREE.CylinderGeometry(0.025, 0.01, 0.7, 4).translate(0, -0.35, 0);
  const tentacleMat = basic(0xff9be6, { transparent: true, opacity: 0.8 });

  // ----- pickups -----
  const coinGeo = new THREE.OctahedronGeometry(0.35);
  const coinMat = standard(0x3dffb0, { emissive: 0x16a870, metalness: 0.4, roughness: 0.3 });
  const bubbleGeo = new THREE.SphereGeometry(0.34, 10, 8);
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: 0xbfefff, emissive: 0x2f8fd0, transparent: true, opacity: 0.65, roughness: 0.1,
  });
  const shineGeo = new THREE.SphereGeometry(0.08, 6, 4);
  const ringGeo = new THREE.TorusGeometry(0.7, 0.05, 4, 16);

  // ----- zone gates: a membrane filling the whole tunnel -----
  const discGeo = new THREE.CircleGeometry(CORNER_RADIUS, LANES).rotateZ(Math.PI / LANES);
  const rimGateGeo = new THREE.TorusGeometry(CORNER_RADIUS - 0.1, 0.25, 4, LANES).rotateZ(Math.PI / LANES);
  const gate = (discColor, opacity, rimColor) => () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(discGeo, basic(discColor, {
      transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    })));
    g.add(new THREE.Mesh(rimGateGeo, basic(rimColor)));
    return g;
  };

  // A power-up: a spinning icon inside a glowing ring, floating at chest height.
  const pickup = (color, buildIcon) => () => {
    const g = new THREE.Group();
    const icon = buildIcon(standard(color, { emissive: color, emissiveIntensity: 0.5 }));
    icon.position.y = 1.2;
    g.add(icon, mesh(ringGeo, basic(color), 0, 1.2));
    g.spinner = icon;
    return g;
  };

  return {
    wall: () => {
      const g = new THREE.Group();
      g.add(mesh(crateGeo, crateMats, 0, 1.25));
      for (const x of [-cw, cw]) {
        for (const z of [-0.65, 0.65]) g.add(mesh(postGeo, frame, x, 1.3, z));
      }
      for (const y of [0.07, 2.5]) {
        for (const z of [-0.65, 0.65]) g.add(mesh(rimGeo, frame, 0, y, z));
      }
      return g;
    },
    low: laser(0.5, 0xff2a4d, 0.75),
    high: laser(1.65, 0xffb020, 1.8),

    'wall@water': () => {
      // A lump of coral rock with branches growing off it.
      const g = new THREE.Group();
      const mat = rockMats[Math.floor(Math.random() * rockMats.length)];
      const big = mesh(rockGeo, mat, -0.35, 1.0, 0);
      big.scale.set(1.15, 1.0, 0.65);
      const small = mesh(rockGeo, mat, 0.7, 0.75, 0.1);
      small.scale.set(0.8, 0.8, 0.55);
      g.add(big, small);
      for (const [x, y, tilt] of [[-0.8, 1.7, -0.4], [-0.2, 1.9, 0.1], [0.5, 1.4, 0.5], [0.9, 1.2, 0.8]]) {
        const branch = mesh(branchGeo, branchMat, x, y, 0);
        branch.rotation.z = -tilt;
        g.add(branch);
      }
      return g;
    },
    'low@water': () => {
      // Spiky sea urchins with a stinging line between them: jump over.
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, LANE_WIDTH * 0.9, 5).rotateZ(Math.PI / 2), stingCore, 0, 0.45));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, LANE_WIDTH * 0.9, 6).rotateZ(Math.PI / 2), stingHalo, 0, 0.45));
      const directions = new THREE.IcosahedronGeometry(1, 0).attributes.position;
      for (const x of [-1.35, 0, 1.35]) {
        const urchin = new THREE.Group();
        urchin.position.set(x, 0.42, 0);
        urchin.add(mesh(new THREE.IcosahedronGeometry(0.26, 0), urchinCore));
        const up = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3();
        for (let i = 0; i < directions.count; i += 3) {
          dir.fromBufferAttribute(directions, i).normalize();
          const spike = mesh(spikeGeo, urchinCore);
          spike.quaternion.setFromUnitVectors(up, dir);
          urchin.add(spike);
        }
        g.add(urchin);
      }
      return g;
    },
    'high@water': () => {
      // Two jellyfish drifting at head height: slide under.
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, LANE_WIDTH * 0.9, 5).rotateZ(Math.PI / 2),
        basic(0xff6fd8, { transparent: true, opacity: 0.5 }), 0, 1.5));
      const jellies = [];
      for (const x of [-0.95, 0.95]) {
        const jelly = new THREE.Group();
        jelly.position.set(x, 1.95, 0);
        jelly.add(mesh(bellGeo, bellMat), mesh(new THREE.SphereGeometry(0.3, 8, 6), innerMat, 0, 0.15, 0));
        jelly.add(mesh(frillGeo, bellMat));
        const tentacles = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const t = mesh(tentacleGeo, tentacleMat, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
          jelly.add(t);
          tentacles.push(t);
        }
        jelly.tentacles = tentacles;
        jelly.phase = Math.random() * 10;
        g.add(jelly);
        jellies.push(jelly);
      }
      g.animate = (time) => {
        for (const jelly of jellies) {
          const t = time * 3 + jelly.phase;
          jelly.position.y = 1.95 + Math.sin(t) * 0.08;
          jelly.scale.set(1 + Math.sin(t) * 0.06, 1 - Math.sin(t) * 0.06, 1 + Math.sin(t) * 0.06);
          jelly.tentacles.forEach((tentacle, i) => { tentacle.rotation.x = Math.sin(t * 1.3 + i) * 0.3; });
        }
      };
      return g;
    },

    coin: () => {
      const g = new THREE.Group();
      const coin = mesh(coinGeo, coinMat, 0, 1.0);
      g.add(coin);
      g.spinner = coin;
      return g;
    },
    bubble: () => {
      const g = new THREE.Group();
      g.add(mesh(bubbleGeo, bubbleMat, 0, 1.0), mesh(shineGeo, basic(0xffffff), -0.12, 1.12));
      return g;
    },
    magnet: pickup(0xff4d6d, (mat) => {
      const g = new THREE.Group();
      g.add(box(0.16, 0.5, 0.16, mat, -0.24, 0.05, 0), box(0.16, 0.5, 0.16, mat, 0.24, 0.05, 0));
      g.add(box(0.64, 0.16, 0.16, mat, 0, -0.25, 0));
      const tip = basic(0xffffff);
      g.add(box(0.17, 0.12, 0.17, tip, -0.24, 0.36, 0), box(0.17, 0.12, 0.17, tip, 0.24, 0.36, 0));
      return g;
    }),
    shield: pickup(0x35e8ff, (mat) => new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat)),
    boost: pickup(0xffd23d, (mat) => {
      const g = new THREE.Group();
      const cone = new THREE.ConeGeometry(0.28, 0.45, 4).rotateX(-Math.PI / 2);
      g.add(mesh(cone, mat, 0, 0, 0.2), mesh(cone, mat, 0, 0, -0.2));
      return g;
    }),

    finish: buildFinishArch,

    'gate@water': gate(0x1f7fd6, 0.55, 0x9ff3ff), // hull breach: a wall of sea water
    'gate@space': gate(0xdffaff, 0.35, 0xffffff), // geyser: foam blasting back up to space
  };
}

// ---------- delivery point ----------

function signTexture(lines, { bg = '#f59e1b', fg = '#121633', border = '#d6246e', width = 512, height = 160 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = border;
  for (let x = 30; x < width - 20; x += 26) { // painted dots along the edges
    ctx.beginPath(); ctx.arc(x, 26, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, height - 26, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(height / (lines.length + 1.2))}px "Yatra One", "Baloo 2", sans-serif`;
  lines.forEach((line, i) => ctx.fillText(line, width / 2, (height / (lines.length + 1)) * (i + 1)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A ring of marigold garlands with a painted sign: the drop-off point.
function buildFinishArch() {
  const g = new THREE.Group();
  const marigold = [standard(0xff8c1a, { emissive: 0x7a3a00 }), standard(0xffc21a, { emissive: 0x7a5a00 })];
  const flower = new THREE.IcosahedronGeometry(0.16, 0);
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * Math.PI * 2;
    g.add(mesh(flower, marigold[i % 2], Math.cos(a) * (CORNER_RADIUS - 0.35), Math.sin(a) * (CORNER_RADIUS - 0.35), 0));
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.06), basic(0xffffff, { map: signTexture(['DELIVERY POINT']), side: THREE.DoubleSide }));
  sign.position.y = TUBE_RADIUS - 1.4;
  g.add(sign);
  return g;
}
