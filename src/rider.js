import * as THREE from 'three';

// Riya in play: painted sprites (public/art/sprites/), one per pose, on a
// plane that faces the gameplay camera. Heights are in metres, the sprite's
// bottom (the board) sits at the rider's origin.
const POSES = {
  ride: { file: 'sprite-ride', height: 3.3 },
  left: { file: 'sprite-left', height: 3.3 },
  right: { file: 'sprite-right', height: 3.3 },
  jump: { file: 'sprite-jump', height: 3.2 },
  slide: { file: 'sprite-slide', height: 2.3 },
  hit: { file: 'sprite-hit', height: 3.3 },
  cheer: { file: 'sprite-cheer', height: 3.6 },
};
const CAMERA_PITCH = -0.3; // the gameplay camera looks down this much; the sprite tilts to face it
const TINT = { space: new THREE.Color(0xffffff), water: new THREE.Color(0xc8eef0) };
const HIT_TINT = new THREE.Color(0xff8fb8);

const loader = new THREE.TextureLoader();
const textures = {};
for (const [pose, { file }] of Object.entries(POSES)) {
  textures[pose] = loader.load(`/art/sprites/${file}.webp`, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  });
}

export class Rider {
  constructor() {
    this.group = new THREE.Group();
    // Unit plane, origin at the bottom centre; resized per pose.
    const geometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
    this.sprite = new THREE.Mesh(geometry, this.material);
    this.sprite.rotation.x = CAMERA_PITCH;
    this.group.add(this.sprite);

    // A soft teal glow on the floor under the board.
    this.glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x46e0c0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.glow.scale.set(1, 1, 1.8);
    this.group.add(this.glow);

    this.zoneTint = TINT.space;
    this.hitFlash = 0;
    this.squash = 0;
    this.setPose('ride');
  }

  setPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.material.map = textures[pose];
    this.material.needsUpdate = true;
    this.squash = 1; // a little squash-and-stretch on every change
  }

  setZone(zone) { this.zoneTint = TINT[zone]; }
  flash() { this.hitFlash = 1; }

  // state: { lean, airborne, sliding, hit, cheer, height (above the floor) }
  update(dt, time, state) {
    let pose = 'ride';
    if (state.cheer) pose = 'cheer';
    else if (state.hit) pose = 'hit';
    else if (state.sliding) pose = 'slide';
    else if (state.airborne) pose = 'jump';
    else if (state.lean < -0.18) pose = 'left';
    else if (state.lean > 0.18) pose = 'right';
    this.setPose(pose);

    const texture = textures[this.pose];
    const image = texture.image;
    const height = POSES[this.pose].height;
    const width = image ? (height * image.width) / image.height : height * 0.6;
    this.squash = Math.max(0, this.squash - dt * 6);
    const s = Math.sin(this.squash * Math.PI) * 0.08;
    this.sprite.scale.set(width * (1 + s), height * (1 - s), 1);
    this.sprite.position.y = Math.sin(time * 6) * 0.03; // hover bob

    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.material.color.copy(this.zoneTint).lerp(HIT_TINT, this.hitFlash);

    // The glow stays on the floor and fades as she rises.
    const above = state.height ?? 0;
    this.glow.position.y = -above + 0.02;
    this.glow.material.opacity = 0.25 / (1 + above);
  }
}
