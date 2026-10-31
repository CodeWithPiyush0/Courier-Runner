import * as THREE from 'three';
import { LANE_WIDTH, LANES, CORNER_RADIUS, TUBE_RADIUS } from './config.js';

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

// ---------- Riya, the courier ----------

const SKIN = 0x9b6a47;
const HAIR = 0x17110d;
const SAFFRON = 0xf59e1b;
const TEAL = 0x0f6b6b;
const RANI = 0xd6246e;
const INDIGO = 0x2c2f6b;
const CREAM = 0xfff1d6;

function parcelLabel() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c98b4a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8cf9a'; // packing tape
    ctx.fillRect(s * 0.42, 0, s * 0.16, s);
    ctx.save();
    ctx.translate(s / 2, s * 0.42);
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
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TO: NANI · NEELA', s / 2, s * 0.8);
    ctx.fillText('▲ THIS SIDE UP ▲', s / 2, s * 0.92);
  });
}

// Madhubani-style print for the dupatta: rani pink with yellow fish and dots.
function dupattaPrint() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#d6246e';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#ffd23d';
    ctx.fillStyle = '#ffd23d';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    for (const [x, y] of [[32, 40], [96, 88]]) { // little fish, a common Madhubani motif
      ctx.beginPath();
      ctx.ellipse(x, y, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 16, y);
      ctx.lineTo(x + 28, y - 9);
      ctx.lineTo(x + 28, y + 9);
      ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(20 + i * 18, s - 18, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// The hoverboard's deck, painted like an Indian truck, lettering near the tail.
function truckArtDeck() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#f59e1b';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#0f6b6b';
    ctx.fillRect(0, 0, s * 0.1, s);
    ctx.fillRect(s * 0.9, 0, s * 0.1, s);
    ctx.fillStyle = '#d6246e';
    for (let y = 8; y < s; y += 22) { // painted diamonds down both edges
      for (const x of [s * 0.05, s * 0.95]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x - 6, y);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#fff1d6';
    ctx.beginPath(); // a lotus in the middle
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.ellipse(s / 2 + Math.cos(a) * 16, s * 0.55 + Math.sin(a) * 16, 16, 8, a, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = '#d6246e';
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.55, 10, 0, Math.PI * 2);
    ctx.fill();
    // The canvas top lands on the tail and appears vertically flipped from the
    // camera behind, so the lettering is drawn flipped to read the right way up.
    ctx.save();
    ctx.translate(s / 2, s * 0.17);
    ctx.scale(1, -1);
    ctx.fillStyle = '#121633';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HORN OK', 0, -14);
    ctx.fillText('PLEASE', 0, 14);
    ctx.restore();
  });
}

function hoverboard() {
  const paint = truckArtDeck();
  paint.repeat.set(1 / 1.2, 1 / 2.1); // deck shape spans x ±0.6, y -1.1..0.98
  paint.offset.set(0.5, 1.1 / 2.1);
  const deckTop = standard(0xffffff, { map: paint, roughness: 0.6 });
  const deckSide = standard(RANI, { roughness: 0.5 });
  const metal = standard(0x3a3550, { metalness: 0.6, roughness: 0.4 });
  const flameMat = basic(0xffb347);

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
  board.add(mesh(deckGeo, [deckTop, deckSide]));
  board.add(mesh(new THREE.PlaneGeometry(0.95, 1.7).rotateX(Math.PI / 2), glowHalo(0x46e0c0, 0.45), 0, -0.02, 0.1));

  const thrusters = [];
  for (const x of [-0.3, 0.3]) {
    board.add(mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.3, 6).rotateX(Math.PI / 2), metal, x, 0.06, 1.0));
    const flame = mesh(new THREE.ConeGeometry(0.1, 0.45, 6).rotateX(Math.PI / 2), flameMat, x, 0.06, 1.35);
    board.add(flame);
    thrusters.push(flame);
  }
  for (const x of [-0.5, 0.5]) {
    const fin = mesh(new THREE.ConeGeometry(0.12, 0.35, 3).rotateX(Math.PI / 2), deckSide, x, 0.04, 0.85);
    fin.rotation.z = Math.sign(x) * 0.5;
    board.add(fin);
  }
  board.thrusters = thrusters;
  return board;
}

// A chain of segments that swings behind (braid, dupatta tails). Returns the segments.
function chain(parent, anchor, count, buildSegment) {
  const segments = [];
  let holder = parent;
  let at = anchor;
  for (let i = 0; i < count; i++) {
    const segment = new THREE.Group();
    segment.position.copy(at);
    const { mesh: piece, length } = buildSegment(i);
    segment.add(piece);
    holder.add(segment);
    segments.push(segment);
    holder = segment;
    at = new THREE.Vector3(0, -length, 0);
  }
  return segments;
}

export function buildCourier() {
  const skin = standard(SKIN, { roughness: 0.8 });
  const hair = standard(HAIR, { roughness: 0.9 });
  const jacket = standard(TEAL, { roughness: 0.7 });
  const stripe = standard(SAFFRON, { emissive: SAFFRON, emissiveIntensity: 0.25 });
  const pants = standard(INDIGO, { roughness: 0.8 });
  const shoe = standard(CREAM, { roughness: 0.6 });
  const dark = standard(0x221d2e, { roughness: 0.6 });
  const helmetMat = standard(SAFFRON, { roughness: 0.45, metalness: 0.1 });
  const tealTrim = standard(TEAL, { roughness: 0.45 });
  const lens = standard(0x2a6b7a, { metalness: 0.7, roughness: 0.15, emissive: 0x0b3a40 });
  const white = standard(0xc9bfb0, { roughness: 0.6 }); // a darker cream, so close-ups don't trip the bloom
  const pupil = standard(0x1a120c, { roughness: 0.3 });
  const marigold = standard(0xff8c1a, { emissive: 0x5a2a00 });
  const dupatta = standard(0xffffff, { map: dupattaPrint(), roughness: 0.8, side: THREE.DoubleSide });

  const board = hoverboard();
  const rider = new THREE.Group();
  rider.position.y = 0.13;

  // Sneakers, legs, hips.
  for (const side of [-1, 1]) {
    rider.add(box(0.24, 0.14, 0.4, shoe, side * 0.18, 0.07, -0.03));
    rider.add(box(0.25, 0.04, 0.42, stripe, side * 0.18, 0.02, -0.03));
    const leg = box(0.22, 0.64, 0.24, pants, side * 0.18, 0.46, 0);
    leg.rotation.x = 0.12;
    rider.add(leg);
    rider.add(box(0.06, 0.18, 0.16, pants, side * 0.3, 0.52, 0)); // cargo pocket
  }
  rider.add(box(0.54, 0.2, 0.32, pants, 0, 0.84, 0));

  // Jacket with saffron reflective stripes.
  rider.add(box(0.6, 0.56, 0.36, jacket, 0, 1.18, 0));
  rider.add(box(0.62, 0.05, 0.38, stripe, 0, 1.02, 0));
  rider.add(box(0.62, 0.05, 0.38, stripe, 0, 1.24, 0));
  rider.add(box(0.34, 0.1, 0.3, jacket, 0, 1.47, 0)); // collar

  // Arms: rolled teal sleeves, bare forearms, fingerless gloves. Pivot at the shoulder.
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.38, 1.4, 0);
    arm.add(box(0.17, 0.3, 0.18, jacket, 0, -0.14, 0));
    arm.add(box(0.18, 0.06, 0.19, stripe, 0, -0.27, 0)); // rolled cuff
    arm.add(box(0.13, 0.26, 0.14, skin, 0, -0.42, 0));
    arm.add(box(0.14, 0.12, 0.15, dark, 0, -0.6, 0));
    arm.side = side;
    rider.add(arm);
    arms.push(arm);
  }

  // Head: face toward -z.
  const head = new THREE.Group();
  head.position.set(0, 1.7, 0);
  rider.add(head);
  rider.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 6), skin, 0, 1.55, 0)); // neck
  head.add(mesh(new THREE.IcosahedronGeometry(0.21, 1).scale(0.92, 1.05, 0.95), skin));
  const eyes = new THREE.Group();
  for (const side of [-1, 1]) {
    eyes.add(box(0.055, 0.032, 0.02, white, side * 0.072, 0.01, -0.19));
    eyes.add(box(0.03, 0.034, 0.02, pupil, side * 0.072, 0.01, -0.2));
    const brow = box(0.08, 0.015, 0.02, hair, side * 0.075, 0.06, -0.19);
    brow.rotation.z = side * -0.15;
    eyes.add(brow);
  }
  head.add(eyes);
  head.add(mesh(new THREE.ConeGeometry(0.025, 0.06, 4).rotateX(-Math.PI / 2), skin, 0, -0.04, -0.21)); // nose
  const smile = box(0.08, 0.015, 0.02, basic(0x5a1e1e), 0, -0.1, -0.18);
  head.add(smile);
  head.add(mesh(new THREE.CircleGeometry(0.012, 6), basic(0x7a0a1e), 0, 0.09, -0.2).rotateY(Math.PI)); // bindi
  // Hair: back and sides of the head, under the helmet. The sphere's gap is
  // centred on phi = 1.5π, which is the -z side: her face.
  head.add(mesh(new THREE.SphereGeometry(0.225, 10, 6, Math.PI * 1.8, Math.PI * 1.4, 0.3, 2.2), hair, 0, 0, 0.01));

  // Saffron half-helmet with a teal stripe, stickers and goggles pushed up.
  head.add(mesh(new THREE.SphereGeometry(0.245, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), helmetMat, 0, 0.04, 0));
  head.add(mesh(new THREE.SphereGeometry(0.25, 12, 6, Math.PI * 1.45, Math.PI * 0.1, 0, Math.PI * 0.42), tealTrim, 0, 0.04, 0));
  head.add(mesh(new THREE.TorusGeometry(0.245, 0.02, 4, 16).rotateX(Math.PI / 2), tealTrim, 0, 0.1, 0)); // rim
  for (const [x, y, z, color] of [[0.17, 0.15, 0.08, RANI], [-0.16, 0.17, 0.1, 0x46e0c0], [0.05, 0.22, 0.15, CREAM]]) {
    const sticker = box(0.07, 0.07, 0.01, standard(color), x, y, z);
    sticker.lookAt(new THREE.Vector3(x * 3, y * 3, z * 3));
    head.add(sticker);
  }
  for (const side of [-1, 1]) {
    head.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateX(Math.PI / 2 - 0.5), lens, side * 0.08, 0.2, -0.17));
  }

  // The braid: out the back of the helmet, swinging, with a marigold band.
  const braid = chain(head, new THREE.Vector3(-0.05, -0.08, 0.2), 6, (i) => {
    const piece = i === 4
      ? mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 6), marigold, 0, -0.04, 0)
      : mesh(new THREE.OctahedronGeometry(0.07 - i * 0.006, 0).scale(1, 1.4, 1), hair, 0, -0.05, 0);
    return { mesh: piece, length: 0.1 };
  });

  // Dupatta: a loop round the neck and two printed tails that fly behind.
  rider.add(mesh(new THREE.TorusGeometry(0.17, 0.05, 4, 10).rotateX(Math.PI / 2), dupatta, 0, 1.5, 0));
  const tails = [-1, 1].map((side) => chain(rider, new THREE.Vector3(side * 0.12, 1.48, 0.12), 3, () => (
    { mesh: mesh(new THREE.PlaneGeometry(0.14, 0.26), dupatta, 0, -0.12, 0), length: 0.24 }
  )));

  // The mystery parcel on her back: label facing the camera, light leaking from the seams.
  const labelTexture = parcelLabel();
  const label = standard(0xffffff, {
    map: labelTexture, emissiveMap: labelTexture, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.9,
  });
  const cardboard = standard(0xc98b4a, { roughness: 0.9 });
  const parcelParts = [];
  const parcel = mesh(new THREE.BoxGeometry(0.58, 0.52, 0.4), [cardboard, cardboard, cardboard, cardboard, label, cardboard], 0, 1.08, 0.4);
  parcelParts.push(parcel);
  // Light leaking from under the lid: a thin glowing ring just below the top edge.
  const seamGlow = basic(0x46ffd0, { transparent: true, opacity: 0.6 });
  for (const [w, d, x, z] of [[0.6, 0.025, 0, 0.6], [0.6, 0.025, 0, 0.2], [0.025, 0.42, 0.3, 0.4], [0.025, 0.42, -0.3, 0.4]]) {
    parcelParts.push(box(w, 0.025, d, seamGlow, x, 1.28, z));
  }
  for (const x of [-0.2, 0.2]) parcelParts.push(box(0.06, 0.6, 0.44, dark, x, 1.18, 0.2)); // straps
  rider.add(...parcelParts);

  let blink = 2;
  // pose: { lean (-1..1), airborne, sliding, speed (0..1), idle, wave }
  const animate = (dt, time, pose) => {
    for (const arm of arms) {
      if (pose.wave && arm.side === 1) {
        arm.rotation.set(0, 0, 2.6 + Math.sin(time * 9) * 0.35);
        continue;
      }
      const out = pose.idle ? 0.18 : pose.airborne ? 1.2 : 0.65;
      arm.rotation.z = arm.side * (out + Math.sin(time * 3 + arm.side) * 0.08) - (pose.lean ?? 0) * 0.5;
      arm.rotation.x = pose.sliding ? -0.8 : pose.idle ? 0 : -0.15;
    }
    const wind = pose.idle ? 2 : 8 + (pose.speed ?? 0) * 10;
    const lift = pose.idle ? 0.15 : 0.9 + (pose.speed ?? 0) * 0.4; // how far the wind lifts things back (+z)
    braid.forEach((segment, i) => {
      segment.rotation.x = -lift * (i === 0 ? 1 : 0.12) + Math.sin(time * wind * 0.6 - i * 0.7) * (0.08 + i * 0.03);
      segment.rotation.z = Math.sin(time * wind * 0.4 - i) * 0.08 - (pose.lean ?? 0) * 0.2;
    });
    tails.forEach((tail, t) => tail.forEach((segment, i) => {
      segment.rotation.x = -lift * (i === 0 ? 1.1 : 0.1) + Math.sin(time * wind - i * 0.9 + t) * (0.15 + i * 0.06);
      segment.rotation.y = Math.sin(time * wind * 0.7 - i + t * 2) * 0.3;
    }));
    for (const flame of board.thrusters) flame.scale.z = 0.8 + Math.random() * 0.5 + (pose.speed ?? 0) * 0.6;
    seamGlow.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(time * 4)); // the parcel hums
    blink -= dt;
    eyes.scale.y = blink < 0.12 ? 0.15 : 1;
    if (blink < 0) blink = 2 + Math.random() * 3;
    head.rotation.y = pose.idle ? Math.sin(time * 0.7) * 0.25 : 0;
  };

  return { board, rider, animate, parcelGlow: seamGlow, parcelParts };
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

    finish: buildFinishArch,

    'gate@water': gate(0x1f7fd6, 0.55, 0x9ff3ff), // hull breach: a wall of sea water
    'gate@space': gate(0xdffaff, 0.35, 0xffffff), // geyser: foam blasting back up to space
  };
}

// ---------- delivery point and the finale ----------

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

export function buildNani() {
  const skin = standard(0xa9744f, { roughness: 0.8 });
  const saree = standard(0xf3e6c8, { roughness: 0.8 });
  const border = standard(0xb3122e, { roughness: 0.7 });
  const shawl = standard(0x6b1a2a, { roughness: 0.9 });
  const silver = standard(0xdcdce4, { roughness: 0.6 });
  const steel = standard(0xc9ced6, { metalness: 0.9, roughness: 0.25 });

  const nani = new THREE.Group();
  const body = new THREE.Group(); // modelled facing -z like everyone else; nani turns it round
  nani.add(body);
  body.add(mesh(new THREE.CylinderGeometry(0.24, 0.44, 1.0, 8), saree, 0, 0.5, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.445, 0.445, 0.09, 8), border, 0, 0.05, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.45, 8), saree, 0, 1.2, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.28, 0.31, 0.24, 8), shawl, 0, 1.32, 0));
  const pallu = box(0.1, 0.9, 0.36, border, 0.2, 1.0, 0.02); // saree end over the shoulder
  pallu.rotation.z = 0.35;
  body.add(pallu);

  const head = new THREE.Group();
  head.position.y = 1.62;
  head.add(mesh(new THREE.IcosahedronGeometry(0.19, 1), skin));
  head.add(mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, 1.3), silver, 0, 0.02, 0.02)); // hair
  head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), silver, 0, 0.1, 0.17)); // bun
  for (const side of [-1, 1]) {
    head.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), standard(0x3a2a20), side * 0.065, 0.01, -0.17));
    head.add(box(0.03, 0.03, 0.01, basic(0x1a120c), side * 0.065, 0.01, -0.175));
  }
  head.add(box(0.07, 0.014, 0.01, basic(0x5a1e1e), 0, -0.08, -0.175)); // smile
  head.add(mesh(new THREE.CircleGeometry(0.018, 8), basic(0xb3122e), 0, 0.08, -0.185).rotateY(Math.PI)); // bindi
  body.add(head);

  const arm = new THREE.Group(); // right arm holding a steel tumbler of chai
  arm.position.set(0.27, 1.35, 0);
  arm.add(box(0.12, 0.42, 0.13, shawl, 0, -0.2, 0));
  arm.add(box(0.1, 0.12, 0.1, skin, 0, -0.46, -0.05));
  arm.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.15, 8), steel, 0, -0.42, -0.15));
  arm.rotation.x = -0.9;
  body.add(arm);
  body.add(box(0.12, 0.42, 0.13, shawl, -0.27, 1.15, 0));

  body.rotation.y = Math.PI; // face +z, towards Riya
  nani.animate = (dt, time, cheer) => {
    head.rotation.z = Math.sin(time * 1.4) * 0.06;
    body.rotation.y = Math.PI + Math.sin(time * 0.8) * 0.08;
    arm.rotation.x = cheer ? -2.4 + Math.sin(time * 8) * 0.3 : -0.9;
  };
  return nani;
}

// Nani's coral cottage, door facing +z (towards Riya arriving).
export function buildCottage() {
  const coral = standard(0xe0607e, { emissive: 0x2a0a12 });
  const wood = standard(0x7a4a26, { roughness: 0.9 });
  const glow = basic(0xffd27a);
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), coral));
  g.add(box(0.9, 1.5, 0.3, wood, 0, 0.75, 2.12));
  for (const side of [-1, 1]) {
    const porthole = mesh(new THREE.CircleGeometry(0.32, 10), glow, side * 1.25, 1.15, 1.72);
    porthole.lookAt(side * 4, 1.15, 5);
    g.add(porthole);
  }
  const marigold = standard(0xff8c1a, { emissive: 0x7a3a00 });
  for (let i = 0; i <= 10; i++) { // garland over the door
    const a = Math.PI * (i / 10);
    g.add(mesh(new THREE.IcosahedronGeometry(0.09, 0), marigold, Math.cos(a) * 0.6, 1.55 + Math.sin(a) * 0.25, 2.3));
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.56), basic(0xffffff, { map: signTexture(['NANI KA GHAR']) }));
  sign.position.set(0, 2.05, 2.05);
  sign.rotation.x = -0.25;
  g.add(sign);
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6), coral, 0.9, 2.1, -0.4)); // chimney
  for (const [x, z, h] of [[-2.4, 1, 0.9], [2.5, 0.6, 1.2], [-2.0, -1.5, 0.7]]) {
    const branch = mesh(new THREE.ConeGeometry(0.15, h, 5).translate(0, h / 2, 0), standard(0xffb347, { emissive: 0x3a250b }), x, 0, z);
    branch.rotation.z = x > 0 ? -0.3 : 0.3;
    g.add(branch);
  }
  return g;
}

// The opened parcel with the glowing egg inside, which hatches.
export function buildGift() {
  const cardboard = standard(0xc98b4a, { roughness: 0.9 });
  const g = new THREE.Group();
  const size = 0.5;
  g.add(box(size, 0.04, size, cardboard, 0, 0.02, 0));
  for (const [x, z, w, d] of [[0, size / 2, size, 0.04], [0, -size / 2, size, 0.04], [size / 2, 0, 0.04, size], [-size / 2, 0, 0.04, size]]) {
    g.add(box(w, size * 0.9, d, cardboard, x, size * 0.45, z));
  }
  const lid = new THREE.Group(); // hinged at the back edge
  lid.position.set(0, size * 0.9, -size / 2);
  lid.add(box(size + 0.04, 0.04, size + 0.04, cardboard, 0, 0, size / 2));
  g.add(lid);

  const eggMat = basic(0xa8ffe4);
  const egg = new THREE.Group();
  egg.position.y = 0.35;
  const shells = [0, 1].map((i) => {
    const shell = mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, i ? Math.PI / 2 : 0, Math.PI / 2).scale(1, 1.3, 1), eggMat);
    egg.add(shell);
    return shell;
  });
  const halo = mesh(new THREE.SphereGeometry(0.34, 10, 8), glowHalo(0x46ffd0, 0.35));
  egg.add(halo);
  g.add(egg);
  return { group: g, lid, egg, shells, halo };
}
