import * as THREE from 'three';
import { SHOTS } from './cinematic.js';
import { ENDING } from './story.js';
import { buildNani, buildCottage, buildGift, buildAnglerfish } from './models.js';

// Where things stand, relative to the floor point under Riya (z: negative = ahead).
const COTTAGE = [0, 0, -9];
const NANI = [-1.4, 0, -5.9];
const GIFT = [-0.5, 0, -4.4];

const offset = (anchor, [x, y, z]) => new THREE.Vector3(anchor.x + x, anchor.y + y, anchor.z + z);

// The finale at Nani's coral cottage: the parcel is opened, the egg hatches and
// the mother anglerfish arrives. Builds its props, then plays ENDING as beats.
export class Ending {
  constructor(scene, bursts) {
    this.scene = scene;
    this.bursts = bursts;
    this.group = null;
  }

  build(anchor, player) {
    this.clear();
    this.anchor = anchor.clone();
    this.player = player;
    this.time = 0;
    this.stage = 'arrive';
    this.group = new THREE.Group();

    this.cottage = buildCottage();
    this.cottage.position.copy(offset(anchor, COTTAGE));
    this.nani = buildNani();
    this.nani.position.copy(offset(anchor, NANI));
    this.gift = buildGift();
    this.gift.group.position.copy(offset(anchor, GIFT));
    this.gift.group.visible = false;
    this.baby = buildAnglerfish();
    this.baby.scale.setScalar(0.18);
    this.baby.visible = false;
    this.mother = buildAnglerfish();
    this.mother.scale.setScalar(1.6);
    this.mother.position.copy(offset(anchor, [6, 3, -16]));
    this.mother.visible = false;
    this.group.add(this.cottage, this.nani, this.gift.group, this.baby, this.mother);
    this.scene.add(this.group);
  }

  event(name) {
    const giftAt = offset(this.anchor, GIFT);
    if (name === 'open') {
      for (const part of this.player.parcelParts) part.visible = false; // Riya hands it over
      this.gift.group.visible = true;
      this.stage = 'open';
    } else if (name === 'glow') {
      this.stage = 'glow';
      this.bursts.spawn(giftAt.clone().setY(giftAt.y + 0.6), { color: 0x9fffe0, count: 40, speed: 3, size: 0.12, life: 1.2 });
    } else if (name === 'hatch') {
      this.stage = 'hatch';
      this.hatchTime = this.time;
      this.baby.visible = true;
      this.bursts.spawn(giftAt.clone().setY(giftAt.y + 0.5), { color: 0xffffff, count: 60, speed: 5, size: 0.14, life: 1 });
    } else if (name === 'mother') {
      this.stage = 'mother';
      this.mother.visible = true;
      this.motherTime = this.time;
    }
  }

  update(dt) {
    if (!this.group) return;
    this.time += dt;
    const t = this.time;
    this.nani.animate(dt, t, this.stage === 'mother');
    const { lid, egg, shells, halo } = this.gift;
    if (this.stage !== 'arrive') lid.rotation.x = Math.max(lid.rotation.x - dt * 2, -1.9); // lid swings open
    if (this.stage === 'glow' || this.stage === 'open') {
      egg.position.y = 0.35 + Math.min(0.25, t * 0.05) + Math.sin(t * 3) * 0.03;
      halo.scale.setScalar(1 + Math.sin(t * 6) * 0.15 + (this.stage === 'glow' ? 0.4 : 0));
    }
    if (this.hatchTime !== undefined) {
      const h = t - this.hatchTime;
      shells[0].position.set(-h * 0.5, h * 0.8 - h * h * 0.8, 0); // shell halves fall away
      shells[1].position.set(h * 0.5, -h * 0.3, 0);
      halo.visible = h < 0.4;
      // The baby swims little loops round the gift.
      const at = offset(this.anchor, GIFT);
      this.baby.position.set(at.x + Math.sin(t * 1.6) * 0.9, at.y + 0.9 + Math.sin(t * 3) * 0.15, at.z + Math.cos(t * 1.6) * 0.7);
      this.baby.rotation.y = t * 1.6 + Math.PI / 2;
      this.baby.animate(dt, t);
    }
    if (this.motherTime !== undefined) {
      const m = Math.min(1, (t - this.motherTime) / 3);
      const from = offset(this.anchor, [6, 3, -16]);
      const to = offset(this.anchor, [1.6, 2.4, -6.5]);
      this.mother.position.lerpVectors(from, to, m * m * (3 - 2 * m));
      this.mother.position.y += Math.sin(t * 1.5) * 0.15;
      this.mother.rotation.y = Math.PI * 0.85; // turned towards everyone, not chasing
      this.mother.animate(dt, t * 0.5);
    }
  }

  // The cutscene: each ENDING line with its camera move.
  beats() {
    const shots = [
      SHOTS.dolly({ from: [1.6, 2.2, 4], to: [0.9, 1.8, 1.6], lookFrom: [-0.6, 1.4, -7], lookTo: [-0.8, 1, -5] }),
      SHOTS.dolly({ from: [0.7, 1.1, -2.4], to: [0.2, 0.9, -3.1], lookFrom: [-0.5, 0.6, -4.4] }),
      SHOTS.dolly({ from: [-0.1, 1.0, -2.8], to: [-1.5, 1.1, -3.1], lookFrom: [-0.5, 0.7, -4.4] }),
      SHOTS.dolly({ from: [2.2, 0.5, -1], to: [1.6, 0.7, -2.2], lookFrom: [0.5, 2.4, -7], lookTo: [1.2, 2.6, -8] }),
      SHOTS.orbit({ radius: 4, height: 2.2, from: Math.PI * 0.2, to: Math.PI * 2.2, look: 1.2, center: [-0.5, 0, -4.5] }),
      SHOTS.dolly({ from: [0, 2.4, 3], to: [0, 3.2, 8], lookFrom: [-0.3, 1.2, -5] }),
      SHOTS.orbit({ radius: 2.4, height: 1.5, from: -0.6, to: 0.6, look: 1.5 }),
    ];
    return ENDING.map((line, i) => ({
      shot: shots[i] ?? shots[shots.length - 1],
      line,
      event: line.event,
      pose: i === ENDING.length - 1 ? { wave: true } : { idle: true },
    }));
  }

  clear() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group = null;
    this.hatchTime = undefined;
    this.motherTime = undefined;
    for (const part of this.player?.parcelParts ?? []) part.visible = true;
  }
}
