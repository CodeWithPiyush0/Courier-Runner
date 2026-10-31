import * as THREE from 'three';
import {
  CHASER_START, CHASER_DANGER, CHASER_HOLD, CHASER_DECAY, placeOnWall,
} from './config.js';

const FAR_BEHIND = 11; // just behind the camera, out of view
const CLOSE_BEHIND = 2.6;
const VISIBLE_WITHIN = 8.5;
const SIDE_OFFSET = 0.3; // lanes; keeps it at Riya's heel instead of blocking the view
const CAMERA_PITCH = -0.3; // sprites tilt to face the gameplay camera

const loader = new THREE.TextureLoader();
const glow = (color, size) => new THREE.Mesh(
  new THREE.CircleGeometry(size, 16),
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
);

// A painted sprite of the chaser seen from behind (public/art/sprites/), plus a
// glowing light that animates: the drone's siren, the fish's lure.
function chaserSprite(file, height, light) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
  const sprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), material); // origin at the bottom
  sprite.rotation.x = CAMERA_PITCH;
  material.map = loader.load(`/art/sprites/${file}.webp`, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    sprite.scale.set((height * texture.image.width) / texture.image.height, height, 1);
  });
  sprite.scale.set(height, height, 1);
  group.add(sprite);
  const lamp = glow(light.color, light.size);
  lamp.position.set(...light.at);
  group.add(lamp);
  group.material = material;
  group.lamp = lamp;
  return group;
}

// What's chasing you: the security drone in space, the anglerfish underwater.
// Hangs back out of view, closes in when you get hit, and catches you if you
// get hit again before it falls back.
export class Chaser {
  constructor(scene) {
    this.object = new THREE.Group();
    this.models = {
      space: chaserSprite('chaser-drone', 1.5, { color: 0xff3355, size: 0.16, at: [-0.28, 1.32, 0.05] }), // siren on top
      water: chaserSprite('chaser-fish', 2.3, { color: 0xd8ff6a, size: 0.22, at: [0, 2.05, -0.3] }), // lure ahead of the head
    };
    this.object.add(this.models.space, this.models.water);
    scene.add(this.object);
    this.time = 0;
    this.setZone('space');
    this.reset();
  }

  reset() {
    this.chase = CHASER_START;
    this.hold = 0;
    this.lane = 0;
  }

  setZone(zone) {
    this.zone = zone;
    for (const [name, model] of Object.entries(this.models)) model.visible = name === zone;
  }

  get model() { return this.models[this.zone]; }
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
    placeOnWall(this.object, this.lane + SIDE_OFFSET + sway, 0.4 + bob, player.z + behind);
    this.object.visible = behind < VISIBLE_WITHIN;

    const model = this.model;
    model.rotation.z = -sway * 1.2;
    if (this.zone === 'space') { // siren: red, then blue
      model.lamp.material.color.set(Math.floor(this.time * 6) % 2 ? 0x3d7bff : 0xff3355);
    } else { // the lure pulses
      model.lamp.scale.setScalar(1 + Math.sin(this.time * 5) * 0.25);
    }
  }
}
