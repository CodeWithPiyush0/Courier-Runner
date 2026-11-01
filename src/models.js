import * as THREE from 'three';
import { LANES, CORNER_RADIUS, TUBE_RADIUS, ROAD_LANE_WIDTH, LANE_WIDTH, CAMERA_PITCH } from './config.js';

// Track props. Obstacles are painted sprites (public/art/props/, made by
// tools/gen_props.py) in the cutscenes' animated style, so they read at a
// glance; pickups, tunnel mouths and the drop-off are built from Three.js
// primitives. Every prop faces the player (who comes from +z) and stands on
// y = 0. Props that move get `animate(time)`.

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

// A painted sign: coloured board, border, one or more lines of text.
export function signTexture(lines, { bg = '#f59e1b', fg = '#121633', border = '#d6246e', width = 512, height = 160 } = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(6, h * 0.07);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.floor(h / (lines.length + 1.1))}px "Baloo 2", "Noto Sans Devanagari", "Nirmala UI", sans-serif`;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, (h / (lines.length + 1)) * (i + 1), w * 0.92));
  });
}

// ---------- obstacles: painted sprites ----------

const TUNNEL_TINT = 0xe8dfcf; // sprites are unlit; a little dimmer in the tunnel's torchlight
const spriteLoader = new THREE.TextureLoader();
const spriteTextures = {};
const shadowGeo = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

function spriteTexture(name) {
  spriteTextures[name] ??= spriteLoader.load(`/art/props/${name}.webp`, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    for (const fit of texture.fits ?? []) fit();
  });
  return spriteTextures[name];
}

// One painted prop: `width` metres wide (height from the picture), standing on
// the floor, or hanging with its top at `top` metres. `copies` repeats it side
// by side across a wide lane. A soft shadow grounds anything on the floor.
function spriteProp(name, { width, copies = 1, top = null, tunnel = false }) {
  const g = new THREE.Group();
  const texture = spriteTexture(name);
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, color: tunnel ? TUNNEL_TINT : 0xffffff,
  });
  const each = width / copies;
  for (let i = 0; i < copies; i++) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), material);
    plane.rotation.x = CAMERA_PITCH;
    plane.position.x = (i - (copies - 1) / 2) * each;
    const fit = () => {
      const height = (each * texture.image.height) / texture.image.width;
      plane.scale.set(each, height, 1);
      plane.position.y = top === null ? 0 : top - height;
    };
    if (texture.image) fit();
    else (texture.fits ??= []).push(fit);
    g.add(plane);
  }
  if (top === null) {
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.scale.set(width * 1.05, 1, 1.1);
    shadow.position.y = 0.02;
    g.add(shadow);
  }
  return g;
}

// Pick one of several props (name, options) for a type of obstacle.
const sprites = (choices, extra = {}) => () => {
  const [name, options] = pick(choices);
  return spriteProp(name, { ...options, ...extra });
};

const ROAD = ROAD_LANE_WIDTH;
const TUNNEL = LANE_WIDTH;
const OBSTACLES = {
  'wall@road': sprites([
    ['ob-auto', { width: ROAD * 0.95 }], ['ob-auto', { width: ROAD * 0.95 }], ['ob-cow', { width: ROAD * 1.1 }],
    ['ob-cart', { width: ROAD * 1.05 }], ['ob-barricade', { width: ROAD * 1.0 }],
  ]),
  'low@road': sprites([['ob-bricks', { width: ROAD * 1.0 }], ['ob-cones', { width: ROAD * 0.85 }]]),
  'high@road': sprites([['ob-banner', { width: ROAD * 1.0 }], ['ob-boom', { width: ROAD * 1.0 }]]),
  'wall@tunnel': sprites([['tn-junk', { width: TUNNEL * 0.8 }]], { tunnel: true }),
  'low@tunnel': sprites([['tn-pipe', { width: TUNNEL * 0.95, copies: 2 }]], { tunnel: true }),
  'high@tunnel': sprites([['tn-wires', { width: TUNNEL * 0.95, copies: 3, top: 3.4 }]], { tunnel: true }),
};


// ---------- pickups ----------

const ringGeo = new THREE.TorusGeometry(0.7, 0.05, 4, 16);

// A power-up: a spinning icon inside a glowing ring, floating at chest height.
const pickup = (color, buildIcon) => () => {
  const g = new THREE.Group();
  const icon = buildIcon();
  icon.position.y = 1.2;
  g.add(icon, mesh(ringGeo, basic(color), 0, 1.2));
  g.spinner = icon;
  return g;
};

function rupeeCoin() {
  const face = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f2b531';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a8761a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 10, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8a5a10'; ctx.font = 'bold 76px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('₹', w / 2, h / 2 + 4);
  });
  // A warm glow of its own, so it shines even in the shade or a dark tunnel.
  const faceMat = standard(0xffffff, { map: face, metalness: 0.45, roughness: 0.3, flatShading: false, emissive: 0x6a4500, emissiveIntensity: 0.6 });
  const edge = standard(0xe0a530, { metalness: 0.6, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.6 });
  return new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.09, 24).rotateX(Math.PI / 2), [edge, faceMat, faceMat]);
}

// A soft round glow and a four-point star, drawn once and shared by every coin.
const coinHaloMaterial = new THREE.SpriteMaterial({
  map: canvasTexture(64, 64, (ctx, w, h) => {
    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    glow.addColorStop(0, 'rgba(255,214,90,0.9)');
    glow.addColorStop(0.45, 'rgba(255,190,40,0.35)');
    glow.addColorStop(1, 'rgba(255,170,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const twinkleMaterial = new THREE.SpriteMaterial({
  map: canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 5 : 31;
      const a = (i / 8) * Math.PI * 2;
      ctx.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    ctx.fill();
  }),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

function upiCard() {
  const qr = canvasTexture(128, 160, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5f259f'; ctx.fillRect(0, 0, w, 30);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('UPI', w / 2, 23);
    ctx.fillStyle = '#111';
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (Math.random() > 0.5) ctx.fillRect(14 + x * 10, 40 + y * 10, 10, 10);
    for (const [x, y] of [[14, 40], [84, 40], [14, 110]]) {
      ctx.fillStyle = '#111'; ctx.fillRect(x, y, 30, 30);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, y + 6, 18, 18);
      ctx.fillStyle = '#111'; ctx.fillRect(x + 11, y + 11, 8, 8);
    }
  });
  return box(0.5, 0.64, 0.04, standard(0xffffff, { map: qr, emissive: 0x222222 }));
}

function helmet() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), standard(0xd62828, { metalness: 0.2, roughness: 0.4 })));
  g.add(mesh(new THREE.SphereGeometry(0.37, 12, 4, Math.PI * 1.2, Math.PI * 0.6, Math.PI * 0.25, Math.PI * 0.2), standard(0x223344, { metalness: 0.7, roughness: 0.1 })));
  g.add(mesh(new THREE.TorusGeometry(0.36, 0.03, 4, 16).rotateX(Math.PI / 2), standard(0x1a1a1a)));
  return g;
}

function chai() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 10), standard(0xffffff, { transparent: true, opacity: 0.45, roughness: 0.1 })));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.32, 10), standard(0xb0703a), 0, -0.04, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), glowHalo(0xffffff, 0.4), (i - 1) * 0.08, 0.32 + i * 0.1, 0)); // steam
  return g;
}

function battery() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 12), standard(0x1f9d55, { metalness: 0.3 })));
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 12), standard(0x1a1a1a), 0, -0.22, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), standard(0xc89a3a, { metalness: 0.8 }), 0, 0.34, 0));
  g.add(mesh(new THREE.SphereGeometry(0.45, 10, 8), glowHalo(0x8fff9f, 0.18)));
  return g;
}

// ---------- tunnel mouths and the drop-off ----------

// A concrete wall across the whole road with an octagonal tunnel mouth in it.
function portal(signLines, signColors) {
  const g = new THREE.Group();
  const outline = new THREE.Shape();
  outline.moveTo(-16, -TUBE_RADIUS - 0.2);
  outline.lineTo(16, -TUBE_RADIUS - 0.2);
  outline.lineTo(16, 12);
  outline.lineTo(-16, 12);
  outline.closePath();
  const hole = new THREE.Path();
  for (let i = 0; i <= LANES; i++) {
    const a = ((i + 0.5) / LANES) * Math.PI * 2;
    const x = Math.sin(a) * CORNER_RADIUS;
    const y = -Math.cos(a) * CORNER_RADIUS;
    if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
  }
  outline.holes.push(hole);
  const concrete = standard(0x8f8a82, { roughness: 1, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(outline), concrete));
  g.add(mesh(new THREE.TorusGeometry(CORNER_RADIUS, 0.3, 4, LANES).rotateZ(Math.PI / LANES), standard(0x5f5a52), 0, 0, 0.1));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.2), basic(0xffffff, { map: signTexture(signLines, signColors), side: THREE.DoubleSide }));
  sign.position.set(0, CORNER_RADIUS + 1.2, 0.15);
  g.add(sign);
  return g;
}

// The drop-off: a gateway strung with marigold garlands and a painted sign.
function buildFinishArch() {
  const g = new THREE.Group();
  const post = standard(0xd6246e);
  const marigold = [standard(0xff8c1a, { emissive: 0x7a3a00 }), standard(0xffc21a, { emissive: 0x7a5a00 })];
  const flower = new THREE.IcosahedronGeometry(0.16, 0);
  const span = ROAD_LANE_WIDTH * 1.9;
  for (const x of [-span, span]) g.add(box(0.4, 5.4, 0.4, post, x, -TUBE_RADIUS + 2.7, 0));
  for (let row = 0; row < 3; row++) { // drooping garlands
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = -span + t * span * 2;
      const y = -TUBE_RADIUS + 5 - row * 0.45 - Math.sin(t * Math.PI) * 0.9;
      g.add(mesh(flower, marigold[(i + row) % 2], x, y, 0));
    }
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.2), basic(0xffffff, { map: signTexture(['DELIVERY POINT', 'पहुँच गए!']), side: THREE.DoubleSide }));
  sign.position.y = -TUBE_RADIUS + 5.9;
  g.add(sign);
  return g;
}

// Factories for every object on the track. A key like 'wall@road' is that
// type's look in that zone.
export function buildTrackMakers() {
  return {
    ...OBSTACLES,

    coin: () => { // a big gold ₹ with a soft halo and a twinkle, bobbing as it spins
      const g = new THREE.Group();
      const coin = rupeeCoin();
      coin.position.y = 1.1;
      g.add(coin);
      const halo = new THREE.Sprite(coinHaloMaterial);
      halo.scale.setScalar(1.7);
      halo.position.y = 1.1;
      g.add(halo);
      const twinkle = new THREE.Sprite(twinkleMaterial);
      twinkle.position.set(0.28, 1.42, 0.1);
      g.add(twinkle);
      const phase = Math.random() * Math.PI * 2;
      g.animate = (time) => {
        const bob = Math.sin(time * 4 + phase) * 0.12;
        coin.position.y = halo.position.y = 1.1 + bob;
        twinkle.position.y = 1.42 + bob;
        twinkle.scale.setScalar(0.25 + Math.max(0, Math.sin(time * 6 + phase)) * 0.45);
      };
      g.spinner = coin;
      return g;
    },
    battery: () => {
      const g = new THREE.Group();
      const cell = battery();
      cell.position.y = 1.0;
      g.add(cell);
      g.spinner = cell;
      return g;
    },
    magnet: pickup(0x8f5fe0, upiCard),
    shield: pickup(0xd62828, helmet),
    boost: pickup(0xffc21a, chai),

    'gate@tunnel': () => portal(['शॉर्टकट', 'NALA SHORTCUT →'], { bg: '#0e6b68', fg: '#fff1d6', border: '#ffc21a', width: 512, height: 140 }),
    'gate@road': () => portal(['BACK ON THE ROAD', 'सड़क →'], { bg: '#f59e1b', fg: '#121633', border: '#d6246e', width: 512, height: 140 }),
    finish: buildFinishArch,
  };
}
