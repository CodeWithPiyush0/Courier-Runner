import * as THREE from 'three';

const FOV = 40;
const BG_DEPTH = 14; // background plate distance from the camera
const CAST_DEPTH = 6; // character cut-outs
const CAST_SINK = 0.45; // how far a cut-out's bottom edge sits below the frame (camera moves never reveal it)
const COVER = 1.22; // background bigger than the view, so camera moves never show its edge
// Which character each cut-out shows (to know who is speaking).
const WHO = { bholu: 'bholu', mishra: 'dispatch', nani: 'nani', mamu: 'mamu', pappu: 'pappu', aunty: 'aunty', ramesh: 'ramesh', munni: 'munni' };
const whoIs = (img) => Object.entries(WHO).find(([part]) => img.includes(part))?.[1];
const ease = (t) => t * t * (3 - 2 * t);

// Camera moves: (t 0..1) => { x, y, z, roll } offsets from the resting camera.
// Because the layers sit at different depths, every move gives real parallax.
const MOVES = {
  push: (t) => ({ x: 0, y: 0.05 * t, z: -1.2 * ease(t) }),
  'push-fast': (t) => ({ x: 0, y: 0, z: -2 * ease(Math.min(1, t * 1.6)) }),
  'truck-right': (t) => ({ x: -0.9 + 1.8 * ease(t), y: 0, z: -0.3 * t }),
  'truck-left': (t) => ({ x: 0.9 - 1.8 * ease(t), y: 0, z: -0.3 * t }),
  rise: (t) => ({ x: 0, y: 0.6 * ease(t), z: -0.6 * t }), // only upwards: below rest, a cut-out's waist would show
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

  // Load the pictures a cutscene needs (and free the ones it doesn't).
  async load(pictures) {
    const names = pictures;
    const keep = new Set(names);
    for (const [name, promise] of this.textures) {
      if (!keep.has(name)) {
        promise.then((texture) => texture?.dispose());
        this.textures.delete(name);
      }
    }
    await Promise.all(names.map((name) => this.texture(name)));
  }

  // Compose a shot: { bg, cast: [{ img, side }], move, tint }.
  // `speaker` is who is talking (they bob with the voice; the speech bubble points at them).
  async show(shot, speaker) {
    this.shot = shot;
    this.time = 0;
    this.group.clear();
    this.cast = [];
    this.speakerPlane = null;
    this.ready = false; // true once the pictures are up
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
      const geometry = new THREE.PlaneGeometry(imageAspect * scale, scale);
      geometry.translate(shot.bgX ?? 0, 0, -BG_DEPTH);
      const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: bg, color: shot.tint ?? 0xffffff }));
      this.group.add(plane);
      this.bg = plane;
    }

    const v = view(CAST_DEPTH);
    const portrait = aspect < 0.9;
    // A tall phone screen only has room for one: the speaker, if they're in the shot.
    let cast = shot.cast ?? [];
    if (portrait && cast.length > 1) cast = [cast.find((m) => whoIs(m.img) === speaker) ?? cast[0]];
    for (const member of cast) {
      const texture = await this.texture(member.img);
      if (!texture || shot !== this.shot) continue;
      const imageAspect = texture.image.width / texture.image.height;
      let height = v.height * (portrait ? 0.78 : 0.86);
      height = Math.min(height, (v.width * 0.9) / imageAspect);
      const width = height * imageAspect;
      const geometry = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0); // origin at the bottom
      const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02 }));
      const side = portrait ? 0 : { left: -0.24, right: 0.24, centre: 0 }[member.side ?? 'centre'];
      plane.position.set(side * v.width, -v.height / 2 - CAST_SINK, -CAST_DEPTH); // waist well below the frame
      plane.side = portrait ? 'centre' : member.side ?? 'centre';
      plane.size = { width, height };
      this.group.add(plane);
      this.cast.push(plane);
      if (whoIs(member.img) === speaker) this.speakerPlane = plane;
    }

    this.ready = true;
  }

  // A cut-out's face on screen, in CSS pixels: { left, right, top (of the
  // head), y (eyes), bottom (chin) }. Measured from where the cut-out rests,
  // ignoring its breathing and bobbing, so things placed by it stay steady.
  faceBox(plane) {
    const { width, height } = plane.size;
    const screen = (x, y) => {
      const p = new THREE.Vector3(plane.position.x + x, plane.position.y + y, plane.position.z).project(this.camera);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    };
    const topLeft = screen(-width * 0.2, height * 0.99);
    const bottomRight = screen(width * 0.2, height * 0.66);
    return {
      left: topLeft.x, right: bottomRight.x, top: topLeft.y, bottom: bottomRight.y,
      y: screen(0, height * 0.82).y, x: screen(0, 0).x,
    };
  }

  // Where the speaker's face is, which side of the picture they stand on
  // (left | right | centre) and how far the free space reaches on their open
  // side before the next face or the screen edge; null if they're not in it.
  speakerAnchor() {
    const plane = this.speakerPlane;
    if (!plane) return null;
    const face = this.faceBox(plane);
    const others = this.cast.filter((p) => p !== plane).map((p) => this.faceBox(p));
    const reach = plane.side === 'right'
      ? Math.max(0, ...others.filter((o) => o.x < face.x).map((o) => o.right))
      : Math.min(window.innerWidth, ...others.filter((o) => o.x > face.x).map((o) => o.left));
    return { face, side: plane.side, reach };
  }

  // progress: 0..1 through the shot (drives the camera move).
  update(dt, progress) {
    if (!this.shot) return;
    this.time += dt;
    const move = (MOVES[this.shot.move] ?? MOVES.push)(Math.min(1, progress));
    this.camera.position.set(move.x, move.y, move.z);
    this.camera.rotation.set(0, 0, move.roll ?? 0);

    // The speaker bobs with their voice; everyone breathes a little.
    const level = this.sound.voiceLevel();
    this.cast.forEach((plane, i) => {
      const breathe = Math.sin(this.time * 2 + i) * 0.006;
      plane.scale.set(1 - level * 0.01, 1 + breathe + level * 0.025, 1);
      plane.rotation.z = Math.sin(this.time * 1.3 + i) * 0.006 + level * 0.012;
    });

    if (this.shot.flicker && this.bg) { // e.g. a siren washing the scene red and blue
      const red = Math.sin(this.time * 9) > 0;
      this.bg.material.color.set(red ? 0xffc4c4 : 0xc4d0ff);
    }
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
