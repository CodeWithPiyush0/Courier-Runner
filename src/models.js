import * as THREE from 'three';
import { LANE_WIDTH, LANES, CORNER_RADIUS } from './config.js';

// Low-poly models, built from Three.js primitives. Every model faces -z (the
// run direction) and stands on y = 0. Models with motion get an
// `animate(dt, time, ...)` method.

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

// ---------- the courier ----------

function parcelLabel() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#d9822b';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8cf9a'; // packing tape
    ctx.fillRect(s * 0.42, 0, s * 0.16, s);
    ctx.save();
    ctx.translate(s / 2, s * 0.45);
    ctx.rotate(-0.12);
    ctx.strokeStyle = '#c0182b';
    ctx.lineWidth = 8;
    ctx.strokeRect(-112, -36, 224, 72);
    ctx.fillStyle = '#c0182b';
    ctx.font = '900 50px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRAGILE', 0, 3);
    ctx.restore();
    ctx.fillStyle = '#3a2410';
    ctx.font = 'bold 21px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('▲ THIS SIDE UP ▲', s / 2, s * 0.86);
  });
}

function hoverboard() {
  const deck = standard(0x232a4a, { metalness: 0.5, roughness: 0.4 });
  const trim = standard(0x35e8ff, { emissive: 0x35e8ff, emissiveIntensity: 0.6 });
  const glow = basic(0x35e8ff);

  // Top-view outline: pointed nose at -z, squared tail at +z.
  const outline = new THREE.Shape();
  outline.moveTo(0, -1.1);
  outline.lineTo(0.55, -0.55);
  outline.lineTo(0.6, 0.75);
  outline.lineTo(0.45, 0.98);
  outline.lineTo(-0.45, 0.98);
  outline.lineTo(-0.6, 0.75);
  outline.lineTo(-0.55, -0.55);
  outline.closePath();
  const deckGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: false })
    .rotateX(Math.PI / 2).translate(0, 0.12, 0);

  const board = new THREE.Group();
  board.add(mesh(deckGeo, deck));
  board.add(box(0.12, 0.02, 1.7, trim, 0, 0.13, 0.05)); // racing stripe
  board.add(mesh(new THREE.PlaneGeometry(0.95, 1.7).rotateX(Math.PI / 2), glowHalo(0x35e8ff, 0.5), 0, -0.02, 0.1));

  const thrusters = [];
  for (const x of [-0.3, 0.3]) {
    board.add(mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.3, 6).rotateX(Math.PI / 2), deck, x, 0.06, 1.0));
    const flame = mesh(new THREE.ConeGeometry(0.1, 0.45, 6).rotateX(Math.PI / 2), glow, x, 0.06, 1.35);
    board.add(flame);
    thrusters.push(flame);
  }
  for (const x of [-0.5, 0.5]) {
    const fin = mesh(new THREE.ConeGeometry(0.12, 0.35, 3).rotateX(Math.PI / 2), deck, x, 0.04, 0.85);
    fin.rotation.z = Math.sign(x) * 0.5;
    board.add(fin);
  }
  board.thrusters = thrusters;
  return board;
}

export function buildCourier() {
  const suit = standard(0xd5dbe6, { roughness: 0.6 });
  const dark = standard(0x2a3150, { roughness: 0.5, metalness: 0.4 });
  const accent = standard(0xff8a2a, { roughness: 0.7 });
  const visorMat = standard(0x0b2a3a, { emissive: 0x35e8ff, emissiveIntensity: 0.35, metalness: 0.8, roughness: 0.2 });
  const glow = basic(0x35e8ff);
  const scarfMat = standard(0xff3d9a, { emissive: 0x5a0f30 });

  const board = hoverboard();

  const rider = new THREE.Group();
  rider.position.y = 0.13;

  // Legs, knees slightly bent, boots.
  for (const side of [-1, 1]) {
    rider.add(box(0.26, 0.16, 0.4, dark, side * 0.2, 0.08, -0.02));
    const leg = box(0.22, 0.66, 0.24, suit, side * 0.2, 0.47, 0);
    leg.rotation.x = 0.12;
    rider.add(leg);
    rider.add(box(0.24, 0.12, 0.26, dark, side * 0.2, 0.4, -0.05)); // knee pad
  }
  rider.add(box(0.62, 0.18, 0.36, dark, 0, 0.84, 0)); // belt
  rider.add(box(0.14, 0.12, 0.05, accent, 0, 0.84, -0.19)); // buckle

  const torso = box(0.7, 0.58, 0.42, suit, 0, 1.2, 0);
  rider.add(torso);
  rider.add(box(0.5, 0.3, 0.06, dark, 0, 1.24, -0.22)); // chest plate
  rider.add(box(0.36, 0.04, 0.07, glow, 0, 1.3, -0.24));

  // Arms pivot at the shoulders and are held out for balance.
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.43, 1.42, 0);
    arm.add(box(0.18, 0.5, 0.2, suit, 0, -0.25, 0));
    arm.add(box(0.2, 0.12, 0.22, accent, 0, -0.12, 0)); // sleeve band
    arm.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), dark, 0, -0.55, 0)); // glove
    arm.side = side;
    rider.add(arm);
    arms.push(arm);
  }

  // Helmet with visor and a blinking antenna.
  rider.add(mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.1, 6), dark, 0, 1.53, 0)); // neck ring
  const helmet = mesh(new THREE.IcosahedronGeometry(0.3, 1), suit, 0, 1.8, 0);
  rider.add(helmet);
  const visor = mesh(new THREE.SphereGeometry(0.27, 8, 4, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.35), visorMat, 0, 1.8, -0.04);
  rider.add(visor);
  rider.add(box(0.03, 0.32, 0.03, dark, 0.15, 2.1, 0.1));
  const beacon = mesh(new THREE.SphereGeometry(0.05, 6, 4), basic(0xff3d3d), 0.15, 2.27, 0.1);
  rider.add(beacon);

  // The package: on the back, label facing the camera.
  const labelTexture = parcelLabel();
  const label = standard(0xffffff, {
    map: labelTexture, emissiveMap: labelTexture, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.9,
  });
  const cardboard = standard(0xd9822b, { roughness: 0.9 });
  const parcelGeo = new THREE.BoxGeometry(0.66, 0.62, 0.44);
  const parcel = new THREE.Mesh(parcelGeo, [cardboard, cardboard, cardboard, cardboard, label, cardboard]);
  parcel.position.set(0, 1.18, 0.44);
  rider.add(parcel);
  for (const x of [-0.24, 0.24]) rider.add(box(0.07, 0.62, 0.5, dark, x, 1.22, 0.2)); // straps

  // Scarf: a chain of segments flapping off to one side (clear of the parcel label).
  const scarf = [];
  let parent = rider;
  let anchor = new THREE.Vector3(0.26, 1.55, 0.12);
  for (let i = 0; i < 3; i++) {
    const segment = new THREE.Group();
    segment.position.copy(anchor);
    segment.add(box(0.16 - i * 0.02, 0.05, 0.3, scarfMat, 0, 0, 0.15));
    parent.add(segment);
    scarf.push(segment);
    parent = segment;
    anchor = new THREE.Vector3(0, 0, 0.3);
  }

  // pose: { lean (-1..1), airborne, sliding, speed (0..1) }
  const animate = (dt, time, pose) => {
    for (const arm of arms) {
      const out = pose.airborne ? 1.2 : 0.65;
      arm.rotation.z = arm.side * (out + Math.sin(time * 3 + arm.side) * 0.08) - pose.lean * 0.5;
      arm.rotation.x = pose.sliding ? -0.8 : -0.15;
    }
    scarf.forEach((segment, i) => {
      const flap = 8 + pose.speed * 10;
      segment.rotation.x = 0.25 + Math.sin(time * flap - i * 0.9) * (0.18 + i * 0.05);
      segment.rotation.y = (i === 0 ? 0.9 : 0.1) + Math.sin(time * flap * 0.7 - i) * 0.25;
    });
    for (const flame of board.thrusters) flame.scale.z = 0.8 + Math.random() * 0.5 + pose.speed * 0.6;
    beacon.visible = Math.floor(time * 2) % 2 === 0;
  };

  return { board, rider, animate };
}

// ---------- chasers ----------

// Station security drone: rotors, a big red eye and a siren on top.
export function buildDrone() {
  const metal = standard(0x3b4262, { metalness: 0.6, roughness: 0.4 });
  const red = basic(0xff2a4d);
  const blue = basic(0x3d7bff);

  const core = new THREE.Group();
  core.add(mesh(new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.75, 1.1), metal));
  core.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), red, 0, 0, -0.5)); // eye
  core.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), glowHalo(0xff2a4d, 0.35), 0, 0, -0.52));
  core.add(box(0.5, 0.06, 0.06, red, 0, -0.05, 0.5)); // rear light bar

  const blades = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = box(0.08, 0.06, 0.65, metal, x * 0.42, 0.05, z * 0.32);
    arm.rotation.y = Math.atan2(x, z);
    core.add(arm);
    const blade = box(0.46, 0.015, 0.05, metal, x * 0.62, 0.13, z * 0.5);
    core.add(blade);
    blades.push(blade);
  }

  // Siren: red and blue halves that take turns.
  const sirenRed = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), red, -0.09, 0.42, 0);
  const sirenBlue = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), blue, 0.09, 0.42, 0);
  core.add(sirenRed, sirenBlue);

  core.scale.setScalar(0.8);
  core.animate = (dt, time) => {
    for (const blade of blades) blade.rotation.y += dt * 40;
    const phase = Math.floor(time * 6) % 2 === 0;
    sirenRed.visible = phase;
    sirenBlue.visible = !phase;
  };
  return core;
}

// Giant anglerfish: huge chomping jaw, teeth, glowing lure and spots.
export function buildAnglerfish() {
  const skin = standard(0x22303f, { roughness: 0.9 });
  const belly = standard(0x3b4f5e, { roughness: 0.9 });
  const toothMat = standard(0xf2efe0, { emissive: 0x333022 });
  const lureGlow = basic(0xd8ff6a);
  const spotGlow = basic(0x46e0c0);

  const fish = new THREE.Group();
  fish.add(mesh(new THREE.IcosahedronGeometry(0.9, 1).scale(1, 0.85, 1.25), skin));

  // Eyes: small and mean, high on the head.
  for (const side of [-1, 1]) {
    fish.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), basic(0xfff4c2), side * 0.45, 0.4, -0.75));
    fish.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), basic(0x111111), side * 0.47, 0.41, -0.86));
  }

  // Lower jaw that opens and shuts, with a row of teeth on each jaw.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.35, -0.3);
  jaw.add(box(1.4, 0.3, 1.0, belly, 0, -0.15, -0.45));
  const toothGeo = new THREE.ConeGeometry(0.07, 0.28, 4);
  for (let i = 0; i < 7; i++) {
    const tooth = mesh(toothGeo, toothMat, -0.6 + i * 0.2, 0.08, -0.9);
    jaw.add(tooth);
    const upper = mesh(toothGeo, toothMat, -0.5 + i * 0.17, 0.25, -0.98);
    upper.rotation.x = Math.PI;
    fish.add(upper);
  }
  fish.add(jaw);

  // Glowing spots along the flanks.
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) fish.add(mesh(new THREE.SphereGeometry(0.06, 5, 4), spotGlow, side * 0.85, -0.1, -0.3 + i * 0.3));
  }

  // Dorsal spines, side fins, tail.
  for (let i = 0; i < 3; i++) {
    const spine = mesh(new THREE.ConeGeometry(0.07, 0.4, 4), skin, 0, 0.85 - i * 0.05, 0.1 + i * 0.3);
    spine.rotation.x = 0.4;
    fish.add(spine);
  }
  const fins = [];
  for (const side of [-1, 1]) {
    const fin = new THREE.Group();
    fin.position.set(side * 0.9, -0.1, 0.1);
    fin.add(mesh(new THREE.ConeGeometry(0.3, 0.7, 3).rotateZ(side * Math.PI / 2), belly, side * 0.3, 0, 0));
    fin.side = side;
    fish.add(fin);
    fins.push(fin);
  }
  const tail = new THREE.Group();
  tail.position.z = 1.1;
  for (const y of [-0.3, 0.3]) {
    const lobe = mesh(new THREE.ConeGeometry(0.35, 0.8, 3).rotateX(-Math.PI / 2).scale(0.25, 1, 1), skin, 0, y, 0.4);
    lobe.rotation.x = -y;
    tail.add(lobe);
  }
  fish.add(tail);

  // The lure on its stalk.
  const stalk = box(0.05, 0.05, 1.1, skin, 0, 1.0, -0.6);
  stalk.rotation.x = 0.5;
  fish.add(stalk);
  const lure = mesh(new THREE.SphereGeometry(0.16, 8, 6), lureGlow, 0, 0.85, -1.2);
  lure.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), glowHalo(0xd8ff6a, 0.3)));
  fish.add(lure);

  fish.animate = (dt, time) => {
    tail.rotation.y = Math.sin(time * 8) * 0.5;
    jaw.rotation.x = 0.2 + Math.sin(time * 3) * 0.2; // chomp
    for (const fin of fins) fin.rotation.z = fin.side * Math.sin(time * 6) * 0.4;
    lure.position.y = 0.85 + Math.sin(time * 5) * 0.08;
  };
  fish.scale.setScalar(0.85);
  return fish;
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

    'gate@water': gate(0x1f7fd6, 0.55, 0x9ff3ff), // hull breach: a wall of sea water
    'gate@space': gate(0xdffaff, 0.35, 0xffffff), // geyser: foam blasting back up to space
  };
}
