import * as THREE from 'three';
import { TUBE_RADIUS } from './config.js';
import { CHARACTERS } from './story.js';

const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// Camera moves for cutscenes. Each returns (t 0..1, anchor) => { pos, look },
// where anchor is the point on the floor under Riya and offsets are in metres
// (x right, y up, z backwards — the run heads towards -z).
export const SHOTS = {
  // Circle round Riya. Angle 0 is in front of her (seeing her face).
  // `center` shifts the pivot away from Riya (an offset like the others).
  orbit: ({ radius = 3, height = 1.6, from = 0, to = Math.PI * 2, look = 1.3, center = [0, 0, 0] } = {}) => (t, a) => {
    const angle = lerp(from, to, ease(t));
    const [cx, cy, cz] = [a.x + center[0], a.y + center[1], a.z + center[2]];
    return {
      pos: new THREE.Vector3(cx + Math.sin(angle) * radius, cy + height, cz - Math.cos(angle) * radius),
      look: new THREE.Vector3(cx, cy + look, cz),
    };
  },
  // Straight move between two offsets, looking from one target to another.
  dolly: ({ from, to, lookFrom, lookTo = lookFrom }) => (t, a) => {
    const e = ease(t);
    const at = (v) => new THREE.Vector3(a.x + v[0], a.y + v[1], a.z + v[2]);
    return { pos: at(from).lerp(at(to), e), look: at(lookFrom).lerp(at(lookTo), e) };
  },
};

// Plays a cutscene: a list of beats, each with a camera shot and optionally a
// voiced line, a caption, a pose for Riya or an event callback. Draws the
// letterbox, subtitles and skip button. Tap / Space advances, Skip ends it.
export class Cinematic {
  constructor({ camera, scene, voice }) {
    this.camera = camera;
    this.scene = scene;
    this.voice = voice;
    this.el = document.getElementById('cinematic');
    this.subtitle = document.getElementById('subtitle');
    this.caption = document.getElementById('caption');
    this.active = false;
    document.getElementById('skip').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.finish();
    });
  }

  // beats: [{ shot, line: { who, text }, duration, caption, pose, event }]
  // anchor: () => Vector3 floor point under Riya. player: for poses.
  play(beats, { anchor, player, onEvent = () => {}, onDone = () => {} }) {
    this.beats = beats;
    this.anchor = anchor;
    this.player = player;
    this.onEvent = onEvent;
    this.onDone = onDone;
    this.active = true;
    // Take the camera off Riya's rig for the cutscene; restored in finish().
    this.saved = {
      parent: this.camera.parent,
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
    };
    this.scene.attach(this.camera);
    this.camera.up.set(0, 1, 0);
    this.el.classList.remove('hidden');
    void this.el.offsetWidth;
    this.el.classList.add('on');
    document.body.classList.add('cinematic');
    this.start(0);
  }

  start(index) {
    this.index = index;
    const beat = this.beats[index];
    if (!beat) return this.finish();
    this.time = 0;
    const text = beat.line?.text ?? '';
    // Long enough to hear the line (≈15 characters a second) plus a breath.
    this.duration = beat.duration ?? Math.max(2.2, text.length * 0.066 + 0.9);
    this.player.pose = beat.pose ?? { idle: true };
    if (beat.event) this.onEvent(beat.event);
    this.caption.textContent = beat.caption ?? '';
    this.caption.classList.toggle('hidden', !beat.caption);
    if (beat.line) {
      const who = CHARACTERS[beat.line.who];
      this.subtitle.innerHTML = `
        <img src="${who.portrait}" alt="">
        <div><b>${who.name}</b><span>${beat.line.text}</span></div>`;
      this.subtitle.classList.remove('hidden');
      this.voice.play(beat.line.text);
    } else {
      this.subtitle.classList.add('hidden');
    }
  }

  next() {
    if (this.active) this.start(this.index + 1);
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const beat = this.beats[this.index];
    const { pos, look } = beat.shot(Math.min(1, this.time / this.duration), this.anchor());
    // Keep the camera inside the tunnel unless the shot is meant to be outside.
    if (!beat.outside) {
      const fromAxis = Math.hypot(pos.x, pos.y);
      if (fromAxis > TUBE_RADIUS - 0.4) {
        const scale = (TUBE_RADIUS - 0.4) / fromAxis;
        pos.x *= scale;
        pos.y *= scale;
      }
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    if (this.time >= this.duration + (beat.hold ?? 0.25)) this.next();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.voice.stop();
    this.player.pose = null;
    this.el.classList.remove('on');
    this.el.classList.add('hidden');
    document.body.classList.remove('cinematic');
    this.caption.classList.add('hidden');
    this.subtitle.classList.add('hidden');
    this.saved.parent.add(this.camera);
    this.camera.position.copy(this.saved.position);
    this.camera.quaternion.copy(this.saved.quaternion);
    this.onDone();
  }
}
