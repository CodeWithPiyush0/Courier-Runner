import * as THREE from 'three';
import {
  CHASER_START, CHASER_DANGER, CHASER_HOLD, CHASER_DECAY, placeOnWall,
} from './config.js';
import { buildDrone, buildAnglerfish } from './models.js';

const FAR_BEHIND = 11; // just behind the camera, out of view
const CLOSE_BEHIND = 2.6;
const VISIBLE_WITHIN = 8.5;
const SIDE_OFFSET = 0.3; // lanes; keeps it at the courier's heel instead of blocking the view

// What's chasing you: the security drone in space, the anglerfish underwater.
// Hangs back out of view, closes in when you get hit, and catches you if you
// get hit again before it falls back.
export class Chaser {
  constructor(scene) {
    this.object = new THREE.Group();
    this.models = { space: buildDrone(), water: buildAnglerfish() };
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
    placeOnWall(this.object, this.lane + SIDE_OFFSET + sway, 1.4 + bob, player.z + behind);
    this.object.visible = behind < VISIBLE_WITHIN;

    this.model.rotation.z = -sway * 1.5;
    this.model.animate(dt, this.time);
  }
}
