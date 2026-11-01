import * as THREE from 'three';
import {
  CHASER_START, CHASER_DANGER, CHASER_HOLD, CHASER_DECAY, CAMERA_PITCH, placeBlended,
} from './config.js';

const FAR_BEHIND = 11.5; // just behind the camera, out of view
const CLOSE_BEHIND = 3.4;
const VISIBLE_WITHIN = 9;
const SIDE_OFFSET = 0.3; // lanes; keeps him at Bholu's heel instead of blocking the view
const BEACON = [0xff2a3a, 0x2a6bff]; // police light: red, then blue

const loader = new THREE.TextureLoader();
const glow = (color, size) => new THREE.Mesh(
  new THREE.CircleGeometry(size, 16),
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
);

// A painted sprite of the chaser seen from behind (public/art/sprites/), plus a
// flashing police light.
function chaserSprite(file, height, light) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
  const sprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), material); // origin at the bottom
  sprite.rotation.x = CAMERA_PITCH;
  const fit = (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    sprite.scale.set((height * texture.image.width) / texture.image.height, height, 1);
  };
  material.map = loader.load(`/art/sprites/${file}.webp`, fit);
  sprite.scale.set(height, height, 1);
  group.add(sprite);
  const lamp = glow(light.color, light.size);
  lamp.position.set(...light.at);
  group.add(lamp);
  group.material = material;
  group.lamp = lamp;
  return group;
}

// Mamu, the traffic police, on his motorbike: after Bholu for every rule he
// breaks, on the road and down the shortcuts. Hangs back out of view, closes in
// when Bholu clips something, and catches him if he does it again before he
// falls back.
export class Chaser {
  constructor(scene) {
    this.object = new THREE.Group();
    // The light sits on the beacon pole, measured on the sprite (tilted back with it).
    this.model = chaserSprite('chaser-mamu', 1.75, { color: BEACON[0], size: 0.13, at: [0.24, 1.37, -0.36] });
    this.object.add(this.model);
    scene.add(this.object);
    this.time = 0;
    this.reset();
  }

  reset() {
    this.chase = CHASER_START;
    this.hold = 0;
    this.lane = 0;
  }

  get dangerous() { return this.chase > CHASER_DANGER; }

  alert() {
    this.chase = 1;
    this.hold = CHASER_HOLD;
  }

  backOff() {
    this.chase = 0;
    this.hold = 0;
  }

  // mode: 'idle' keeps its distance, 'chase' falls back over time, 'catch' closes in.
  update(dt, player, mode) {
    this.time += dt;
    if (mode === 'catch') this.chase = Math.min(1.25, this.chase + dt * 2);
    else if (mode === 'chase') {
      if (this.hold > 0) this.hold -= dt;
      else this.chase = Math.max(0, this.chase - dt * CHASER_DECAY);
    }

    this.lane += (player.lane - this.lane) * Math.min(1, dt * 5);
    const behind = FAR_BEHIND - (FAR_BEHIND - CLOSE_BEHIND) * Math.min(1, this.chase) - Math.max(0, this.chase - 1) * 8;
    const sway = Math.sin(this.time * 1.7) * 0.12;
    const bob = Math.sin(this.time * 4) * 0.12;
    placeBlended(this.object, this.lane + SIDE_OFFSET + sway, 0.05 + bob * 0.3, player.z + behind, player.flat);
    this.object.visible = behind < VISIBLE_WITHIN;

    this.model.rotation.z = -sway * 1.2;
    this.model.lamp.material.color.set(BEACON[Math.floor(this.time * 6) % 2]);
  }
}
