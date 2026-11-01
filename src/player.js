import * as THREE from 'three';
import {
  TUBE_RADIUS, LANE_ANGLE, HOVER_HEIGHT, SLIDE_TIME, FLIP_TIME, FLIP_COOLDOWN,
  STUMBLE_TIME, STUMBLE_SLOWDOWN, HIT_GRACE, ZONE_PHYSICS, ROAD_LANE_WIDTH, FLAT_BLEND, wrapLane,
  CAMERA_HEIGHT, CAMERA_BACK, CAMERA_PITCH,
} from './config.js';
import { Rider } from './rider.js';

const CAMERA_OFFSET = new THREE.Vector3(0, -TUBE_RADIUS + CAMERA_HEIGHT, CAMERA_BACK);
const SPIN_PIVOT = 1.6; // flips and crash tumbles turn round the middle of the sprite

const CAMERA_FOLLOW = 0.55; // on the road, how much the camera follows her sideways

// A lane number brought into -4..4 (keeps fractions, so it works mid-move).
const signed = (lane) => ((((lane + 4) % 8) + 8) % 8) - 4;

// The rig sits on the tube axis and rotates to the player's lane; Riya and the
// camera are its children, so in a tunnel the camera rolls with the floor. On
// the road (flat = 1) the rig stays level and she moves sideways across lanes
// -1, 0, 1 instead; `flat` blends between the two at tunnel mouths.
export class Player {
  constructor(scene, camera) {
    this.rig = new THREE.Group();
    scene.add(this.rig);

    this.body = new THREE.Group();
    this.spin = new THREE.Group();
    this.spin.position.y = SPIN_PIVOT;
    this.rider = new Rider();
    this.rider.group.position.y = -SPIN_PIVOT;
    this.spin.add(this.rider.group);
    this.body.add(this.spin);
    this.rig.add(this.body);
    this.pose = null; // set by cutscenes: { ride } or { cheer }

    this.shield = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.45, 1),
      new THREE.MeshBasicMaterial({
        color: 0x3fc1b0, transparent: true, opacity: 0.25, wireframe: true, depthWrite: false,
      }),
    );
    this.shield.position.y = 1.2;
    this.body.add(this.shield);

    this.camera = camera;
    camera.position.copy(CAMERA_OFFSET);
    camera.rotation.set(CAMERA_PITCH, 0, 0);
    this.rig.add(camera);

    // Lights travel with her, so obstacles ahead and around are always lit.
    const light = new THREE.PointLight(0xbfe6ff, 12, 30, 1.4);
    light.position.set(0, -TUBE_RADIUS + 3, -2);
    this.rig.add(light);
    const fill = new THREE.PointLight(0xd6e4ff, 14, 30, 1.2);
    fill.position.copy(CAMERA_OFFSET);
    this.rig.add(fill);

    this.time = 0;
    this.reset();
  }

  reset() {
    this.z = 0;
    this.lane = 0;
    this.targetLane = 0;
    this.jumpY = 0;
    this.vy = 0;
    this.slideT = 0;
    this.flipT = -1;
    this.flipFrom = 0;
    this.lift = 0;
    this.cooldown = 0;
    this.stumbleT = 0;
    this.grace = 0;
    this.shake = 0;
    this.boosting = false;
    this.zone = 'road';
    this.flat = 1;
    this.physics = ZONE_PHYSICS.road;
    this.dead = false;
    this.pose = null;
    this.shield.visible = false;
    this.spin.visible = true;
    this.spin.rotation.set(0, 0, 0);
    this.camera.position.copy(CAMERA_OFFSET);
    this.apply();
  }

  get flipping() { return this.flipT >= 0; }
  get sliding() { return this.slideT > 0; }
  get flipCharge() { return 1 - this.cooldown / FLIP_COOLDOWN; }
  get laneIndex() { return wrapLane(this.lane); }
  get speedFactor() { return 1 - STUMBLE_SLOWDOWN * (this.stumbleT / STUMBLE_TIME); }

  // Zapped by a laser: lose speed for a moment, briefly can't be hit again.
  stumble() {
    this.stumbleT = STUMBLE_TIME;
    this.grace = HIT_GRACE;
    this.shake = 0.35;
    this.rider.flash();
  }

  setShield(on) { this.shield.visible = on; }

  // Road: 3 flat lanes, no flips. Tunnel: the full tube.
  setZone(zone) {
    this.zone = zone;
    this.physics = ZONE_PHYSICS[zone];
    this.rider.setZone(zone);
    if (zone === 'road') {
      this.lane = signed(this.lane);
      this.targetLane = Math.max(-1, Math.min(1, Math.round(signed(this.targetLane))));
    }
  }

  // Head for the nearest floor lane (-1, 0 or 1) without unwinding round the
  // tube: used just before a tunnel comes out onto the road.
  settleToFloor() {
    if (this.flipping) return;
    const lane = Math.round(this.targetLane);
    const offset = signed(lane);
    this.targetLane = lane - offset + Math.max(-1, Math.min(1, offset));
  }

  // Returns true if the action did something (so the game can play its sound).
  act(action) {
    if (this.dead || this.flipping) return false;
    switch (action) {
      case 'left':
      case 'right': {
        const step = action === 'left' ? -1 : 1;
        if (this.zone === 'road' && Math.abs(this.targetLane + step) > 1) return false; // kerb
        this.targetLane += step;
        return true;
      }
      case 'jump':
        if (this.jumpY > 0) return false;
        this.vy = this.physics.jumpVelocity;
        this.slideT = 0;
        return true;
      case 'slide':
        this.slideT = SLIDE_TIME;
        if (this.jumpY > 0) this.vy = -this.physics.jumpVelocity * 1.6; // slam down
        return true;
      case 'flip':
        if (this.cooldown > 0 || this.zone === 'road') return false; // only in a tunnel
        this.flipFrom = this.lane;
        this.targetLane = Math.round(this.targetLane) + 4;
        this.flipT = 0;
        this.cooldown = FLIP_COOLDOWN;
        this.jumpY = 0;
        this.vy = 0;
        this.slideT = 0;
        return true;
      default:
        return false;
    }
  }

  update(dt, speed) {
    this.time += dt;
    this.speed = speed;
    this.z -= speed * dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.slideT = Math.max(0, this.slideT - dt);
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.grace = Math.max(0, this.grace - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.flat += ((this.zone === 'road' ? 1 : 0) - this.flat) * Math.min(1, dt * FLAT_BLEND);

    if (this.flipping) {
      // Launch across the middle of the tube to the opposite wall, in a barrel roll.
      this.flipT = Math.min(1, this.flipT + dt / FLIP_TIME);
      const t = this.flipT;
      const eased = t * t * (3 - 2 * t);
      this.lane = this.flipFrom + (this.targetLane - this.flipFrom) * eased;
      this.lift = Math.sin(Math.PI * t) * (TUBE_RADIUS - 1.5);
      this.spin.rotation.z = -Math.PI * 2 * eased;
      if (t >= 1) {
        this.flipT = -1;
        this.lane = this.targetLane;
        this.lift = 0;
      }
    } else {
      this.lane += (this.targetLane - this.lane) * Math.min(1, dt * this.physics.laneSpeed);
      const wobble = Math.sin(this.time * 40) * 0.25 * (this.stumbleT / STUMBLE_TIME);
      this.spin.rotation.z = wobble + (this.lane - this.targetLane) * 0.35; // lean into lane changes
    }

    if (this.jumpY > 0 || this.vy > 0) {
      this.vy -= this.physics.gravity * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) { this.jumpY = 0; this.vy = 0; }
    }

    this.spin.visible = this.grace === 0 || Math.floor(this.time * 20) % 2 === 0; // blink while invulnerable
    this.shield.rotation.y += dt;
    const lean = this.lane - this.targetLane;
    this.rider.update(dt, this.time, {
      lean: this.pose ? 0 : -lean,
      airborne: !this.pose && (this.jumpY > 0.15 || this.flipping),
      sliding: !this.pose && this.sliding,
      hit: !this.pose && this.stumbleT > STUMBLE_TIME * 0.4,
      cheer: Boolean(this.pose?.cheer),
      height: this.jumpY + this.lift,
    });
    this.apply();
  }

  // Tumble after a crash; the camera shake fades out.
  updateDead(dt, shake) {
    this.time += dt;
    this.spin.visible = true;
    this.spin.rotation.z += dt * 7;
    this.rider.update(dt, this.time, { lean: 0, hit: true, height: this.jumpY });
    this.camera.position.set(
      CAMERA_OFFSET.x + (Math.random() - 0.5) * shake,
      CAMERA_OFFSET.y + (Math.random() - 0.5) * shake,
      CAMERA_OFFSET.z,
    );
  }

  apply() {
    this.rig.position.z = this.z;
    this.rig.rotation.z = this.lane * LANE_ANGLE * (1 - this.flat);
    this.body.position.x = this.lane * ROAD_LANE_WIDTH * this.flat;
    this.body.position.y = -TUBE_RADIUS + HOVER_HEIGHT + this.jumpY + this.lift;
    if (!this.dead) {
      const jolt = this.shake * 0.6; // camera jolt after a hit
      this.camera.position.set(
        CAMERA_OFFSET.x + this.body.position.x * CAMERA_FOLLOW + (Math.random() - 0.5) * jolt,
        CAMERA_OFFSET.y + (Math.random() - 0.5) * jolt,
        CAMERA_OFFSET.z,
      );
    }
  }
}
