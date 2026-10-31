import * as THREE from 'three';
import {
  TUBE_RADIUS, LANE_ANGLE, HOVER_HEIGHT, SLIDE_TIME, FLIP_TIME, FLIP_COOLDOWN,
  STUMBLE_TIME, STUMBLE_SLOWDOWN, HIT_GRACE, ZONE_PHYSICS, wrapLane,
} from './config.js';
import { buildCourier } from './models.js';

const CAMERA_OFFSET = new THREE.Vector3(0, -TUBE_RADIUS + 3.7, 7);

// The rig sits on the tube axis and rotates to the player's lane; the courier and
// the camera are its children, so the camera always rolls with the floor.
export class Player {
  constructor(scene, camera) {
    this.rig = new THREE.Group();
    scene.add(this.rig);

    this.body = new THREE.Group();
    this.spin = new THREE.Group(); // pivot at the courier's middle, for flips and crashes
    this.spin.position.y = 1;
    const { board, rider, animate, parcelGlow, parcelParts } = buildCourier();
    this.animateCourier = animate;
    this.parcelGlow = parcelGlow;
    this.parcelParts = parcelParts;
    this.pose = null; // set by cutscenes: { idle } or { wave }
    const inner = new THREE.Group();
    inner.position.y = -1;
    inner.add(board, rider);
    this.spin.add(inner);
    this.body.add(this.spin);
    this.rig.add(this.body);
    this.rider = rider;

    this.shield = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshBasicMaterial({
        color: 0x35e8ff, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false,
      }),
    );
    this.shield.position.y = 1;
    this.body.add(this.shield);

    this.camera = camera;
    camera.position.copy(CAMERA_OFFSET);
    camera.rotation.set(-0.3, 0, 0);
    this.rig.add(camera);

    const light = new THREE.PointLight(0xbfe6ff, 12, 30, 1.4);
    light.position.set(0, -TUBE_RADIUS + 3, -2);
    this.rig.add(light);
    // Soft fill from the camera side, so what the player sees (backs of the
    // courier and chaser, fronts of obstacles) isn't in shadow.
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
    this.physics = ZONE_PHYSICS.space;
    this.dead = false;
    this.shield.visible = false;
    this.spin.visible = true;
    this.spin.rotation.set(0, 0, 0);
    this.rider.scale.y = 1;
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
  }

  setShield(on) { this.shield.visible = on; }

  // Movement feel per zone: snappy in space, slow and floaty underwater.
  setZone(zone) { this.physics = ZONE_PHYSICS[zone]; }

  // Returns true if the action did something (so the game can play its sound).
  act(action) {
    if (this.dead || this.flipping) return false;
    switch (action) {
      case 'left': this.targetLane -= 1; return true;
      case 'right': this.targetLane += 1; return true;
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
        if (this.cooldown > 0) return false;
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

    if (this.flipping) {
      // Launch across the middle of the tube to the opposite wall, somersaulting.
      this.flipT = Math.min(1, this.flipT + dt / FLIP_TIME);
      const t = this.flipT;
      const eased = t * t * (3 - 2 * t);
      this.lane = this.flipFrom + (this.targetLane - this.flipFrom) * eased;
      this.lift = Math.sin(Math.PI * t) * (TUBE_RADIUS - 1.5);
      this.spin.rotation.x = -Math.PI * 2 * eased;
      if (t >= 1) {
        this.flipT = -1;
        this.lane = this.targetLane;
        this.lift = 0;
        this.spin.rotation.x = 0;
      }
    } else {
      this.lane += (this.targetLane - this.lane) * Math.min(1, dt * this.physics.laneSpeed);
      const wobble = Math.sin(this.time * 40) * 0.5 * (this.stumbleT / STUMBLE_TIME);
      this.spin.rotation.x = this.boosting ? -0.35 : 0; // tuck forward while boosting
      this.spin.rotation.z = wobble;
    }

    if (this.jumpY > 0 || this.vy > 0) {
      this.vy -= this.physics.gravity * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) { this.jumpY = 0; this.vy = 0; }
    }

    const crouch = this.sliding ? 0.5 : 1;
    this.rider.scale.y += (crouch - this.rider.scale.y) * Math.min(1, dt * 20);
    this.body.rotation.z = (this.lane - this.targetLane) * 0.6; // lean into lane changes
    this.spin.visible = this.grace === 0 || Math.floor(this.time * 20) % 2 === 0; // blink while invulnerable
    this.shield.rotation.y += dt;
    this.animateCourier(dt, this.time, this.pose ?? {
      lean: Math.max(-1, Math.min(1, this.lane - this.targetLane)),
      airborne: this.jumpY > 0.1 || this.flipping,
      sliding: this.sliding,
      speed: Math.min(1, Math.max(0, (speed - 8) / 40)),
    });
    this.apply();
  }

  // Tumble after a crash; the camera shake fades out.
  updateDead(dt, shake) {
    this.time += dt;
    this.spin.visible = true;
    this.spin.rotation.x += dt * 9;
    this.spin.rotation.z += dt * 4;
    this.animateCourier(dt, this.time, { lean: 0, airborne: true, sliding: false, speed: 0 });
    this.camera.position.set(
      CAMERA_OFFSET.x + (Math.random() - 0.5) * shake,
      CAMERA_OFFSET.y + (Math.random() - 0.5) * shake,
      CAMERA_OFFSET.z,
    );
  }

  apply() {
    const bob = this.flipping ? 0 : Math.sin(this.time * 6) * 0.06;
    this.rig.position.z = this.z;
    this.rig.rotation.z = this.lane * LANE_ANGLE;
    this.body.position.y = -TUBE_RADIUS + HOVER_HEIGHT + this.jumpY + this.lift + bob;
    if (!this.dead) {
      const jolt = this.shake * 0.6; // camera jolt after a hit
      this.camera.position.set(
        CAMERA_OFFSET.x + (Math.random() - 0.5) * jolt,
        CAMERA_OFFSET.y + (Math.random() - 0.5) * jolt,
        CAMERA_OFFSET.z,
      );
    }
  }
}
