import * as THREE from 'three';
import { particleMaterial } from './effects.js';

const FOV = 40;
const BG_DEPTH = 14; // background plate distance from the camera
const CAST_DEPTH = 6; // character cut-outs
const DUST_DEPTH = 3.5; // floating particles in front
const COVER = 1.22; // background bigger than the view, so camera moves never show its edge
const MOUTH_OPEN = 0.13; // voice level that opens the speaker's mouth
const MOUTH_HOLD = 0.07; // seconds a mouth stays open/shut at least, so it flaps rather than flickers
// Which character each cut-out shows (to know whose mouth moves).
const WHO = { riya: 'riya', mishra: 'dispatch', nani: 'nani', drone: 'security' };
const whoIs = (img) => Object.entries(WHO).find(([part]) => img.includes(part))?.[1];
const ease = (t) => t * t * (3 - 2 * t);

// Camera moves: (t 0..1) => { x, y, z, roll } offsets from the resting camera.
// Because the layers sit at different depths, every move gives real parallax.
const MOVES = {
  push: (t) => ({ x: 0, y: 0.05 * t, z: -1.2 * ease(t) }),
  'push-fast': (t) => ({ x: 0, y: 0, z: -2 * ease(Math.min(1, t * 1.6)) }),
  'truck-right': (t) => ({ x: -0.9 + 1.8 * ease(t), y: 0, z: -0.3 * t }),
  'truck-left': (t) => ({ x: 0.9 - 1.8 * ease(t), y: 0, z: -0.3 * t }),
  rise: (t) => ({ x: 0, y: -0.5 + 0.8 * ease(t), z: -0.6 * t }),
  drift: (t) => ({ x: 0.5 * Math.sin(t * 2.2), y: 0.15 * Math.sin(t * 3.1), z: -0.5 * t, roll: 0.01 * Math.sin(t * 2) }),
};

// The 2.5D cutscene stage: a separate little scene of painted layers in front
// of a perspective camera. Pictures come from public/art/story/.
export class Stage {
  constructor(sound) {
    this.sound = sound;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07081a);
    this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);
    this.loader = new THREE.TextureLoader();
    this.textures = new Map();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.time = 0;
    this.shot = null;
    // Where each cut-out's "mouth open" patch goes (made by tools/gen_mouths.py).
    this.mouths = fetch('/art/story/mouths.json')
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
    this.mouthOpen = false;
    this.mouthTimer = 0;
  }

  texture(name) {
    if (!this.textures.has(name)) {
      this.textures.set(name, new Promise((resolve) => {
        this.loader.load(`/art/story/${name}.webp`, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          resolve(texture);
        }, undefined, () => resolve(null));
      }));
    }
    return this.textures.get(name);
  }

  // Load the pictures a cutscene needs (and free the ones it doesn't), plus
  // the mouth patches of the characters in them.
  async load(pictures) {
    const mouths = await this.mouths;
    const names = [...pictures, ...pictures.filter((n) => mouths[n]).map((n) => `${n}-mouth`)];
    const keep = new Set(names);
    for (const [name, promise] of this.textures) {
      if (!keep.has(name)) {
        promise.then((texture) => texture?.dispose());
        this.textures.delete(name);
      }
    }
    await Promise.all(names.map((name) => this.texture(name)));
  }

  // Compose a shot: { bg, cast: [{ img, side }], move, dust, tint }.
  // `speaker` is who is talking (their mouth moves with the voice).
  async show(shot, speaker) {
    this.shot = shot;
    this.time = 0;
    this.group.clear();
    this.cast = [];
    this.mouth = null;
    const mouths = await this.mouths;
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const view = (depth) => {
      const height = 2 * depth * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      return { height, width: height * aspect };
    };

    const bg = await this.texture(shot.bg);
    if (shot !== this.shot) return; // a newer shot was asked for meanwhile
    if (bg) {
      const v = view(BG_DEPTH);
      const imageAspect = bg.image.width / bg.image.height;
      // Cover the view (like CSS background-size: cover), plus a margin for moves.
      const scale = Math.max(v.width / imageAspect, v.height) * COVER;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(imageAspect * scale, scale),
        new THREE.MeshBasicMaterial({ map: bg, color: shot.tint ?? 0xffffff }),
      );
      plane.position.set(shot.bgX ?? 0, 0, -BG_DEPTH);
      this.group.add(plane);
      this.bg = plane;
    }

    const v = view(CAST_DEPTH);
    const portrait = aspect < 0.9;
    for (const member of shot.cast ?? []) {
      const texture = await this.texture(member.img);
      if (!texture || shot !== this.shot) continue;
      const imageAspect = texture.image.width / texture.image.height;
      let height = v.height * (portrait ? 0.78 : 0.86);
      height = Math.min(height, (v.width * 0.9) / imageAspect);
      const width = height * imageAspect;
      const geometry = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0); // origin at the bottom
      const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02 }));
      const side = portrait ? 0 : { left: -0.24, right: 0.24, centre: 0 }[member.side ?? 'centre'];
      plane.position.set(side * v.width, -v.height / 2 - 0.25, -CAST_DEPTH);
      this.group.add(plane);
      this.cast.push(plane);

      // The speaker's open mouth: a small patch laid over the closed one.
      const spot = mouths[member.img];
      const patch = spot && whoIs(member.img) === speaker ? await this.texture(`${member.img}-mouth`) : null;
      if (patch && shot === this.shot) {
        const mouth = new THREE.Mesh(
          new THREE.PlaneGeometry(spot.w * width, spot.h * height),
          new THREE.MeshBasicMaterial({ map: patch, transparent: true, depthWrite: false }),
        );
        mouth.position.set((spot.x + spot.w / 2 - 0.5) * width, (1 - spot.y - spot.h / 2) * height, 0.002);
        mouth.visible = false;
        plane.add(mouth);
        this.mouth = mouth;
      }
    }

    this.dust = this.makeDust(shot.dust ?? 'dust');
    this.group.add(this.dust);
  }

  makeDust(kind) {
    const count = 70;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, -DUST_DEPTH - Math.random() * 3], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const color = { dust: 0xffd9a0, bubbles: 0xbff7ff, sparkle: 0x9fffe0, steam: 0xfff1d6 }[kind] ?? 0xffd9a0;
    const points = new THREE.Points(geometry, particleMaterial({ color, size: kind === 'bubbles' ? 0.09 : 0.05, opacity: 0.8, maxPixels: 10 }));
    points.kind = kind;
    points.frustumCulled = false;
    return points;
  }

  // progress: 0..1 through the shot (drives the camera move).
  update(dt, progress) {
    if (!this.shot) return;
    this.time += dt;
    const move = (MOVES[this.shot.move] ?? MOVES.push)(Math.min(1, progress));
    this.camera.position.set(move.x, move.y, move.z);
    this.camera.rotation.set(0, 0, move.roll ?? 0);

    // The speaker bobs with their voice and their mouth flaps; everyone breathes a little.
    const level = this.sound.voiceLevel();
    this.mouthTimer -= dt;
    const open = level > MOUTH_OPEN;
    if (open !== this.mouthOpen && this.mouthTimer <= 0) {
      this.mouthOpen = open;
      this.mouthTimer = MOUTH_HOLD;
    }
    if (this.mouth) this.mouth.visible = this.mouthOpen;
    this.cast.forEach((plane, i) => {
      const breathe = Math.sin(this.time * 2 + i) * 0.006;
      plane.scale.set(1 - level * 0.01, 1 + breathe + level * 0.025, 1);
      plane.rotation.z = Math.sin(this.time * 1.3 + i) * 0.006 + level * 0.012;
    });

    if (this.shot.flicker && this.bg) { // e.g. a siren washing the scene red and blue
      const red = Math.sin(this.time * 9) > 0;
      this.bg.material.color.set(red ? 0xffc4c4 : 0xc4d0ff);
    }

    const positions = this.dust.geometry.attributes.position.array;
    const rise = this.dust.kind === 'bubbles' ? 0.5 : this.dust.kind === 'steam' ? 0.25 : 0.06;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += Math.sin(this.time + i) * 0.002;
      positions[i + 1] += rise * dt;
      if (positions[i + 1] > 2.2) positions[i + 1] = -2.2;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
