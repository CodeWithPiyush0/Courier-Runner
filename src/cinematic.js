import * as THREE from 'three';
import { TUBE_RADIUS } from './config.js';
import { CHARACTERS } from './story.js';

const ease = (t) => t * t * (3 - 2 * t);
const MIN_LINE = 1.2; // seconds a line stays up, however short
const AFTER_LINE = 0.45; // breath after the voice finishes
const TAP_LOCK = 0.35; // ignore taps right after a cut, so a double tap doesn't skip a line

// Camera moves for the 3D shots. Each returns (t 0..1, anchor) => { pos, look },
// where anchor is the point on the floor under Bholu and offsets are in metres
// (x right, y up, z backwards — the run heads towards -z).
export const SHOTS = {
  // Straight move between two offsets, looking from one target to another.
  dolly: ({ from, to, lookFrom, lookTo = lookFrom }) => (t, a) => {
    const e = ease(t);
    const at = (v) => new THREE.Vector3(a.x + v[0], a.y + v[1], a.z + v[2]);
    return { pos: at(from).lerp(at(to), e), look: at(lookFrom).lerp(at(lookTo), e) };
  },
};

// How long a line takes to say, roughly (used when there's no recording, and
// to pace camera moves).
const estimate = (text) => Math.max(2.4, text.length * 0.066 + 0.9);

// Plays a cutscene: a list of beats. A beat is either a 3D shot of the game
// world ({ shot, duration, pose }) or a 2.5D stage shot ({ stage }),
// optionally with a voiced line, a caption and a delivery title card. Lines stay
// up until their voice has finished. Tap / Space = next, Skip / Esc = skip all.
export class Cinematic {
  constructor({ camera, scene, voice, stage }) {
    this.camera = camera;
    this.scene = scene;
    this.voice = voice;
    this.stage = stage;
    this.el = document.getElementById('cinematic');
    this.bubble = document.getElementById('bubble');
    this.caption = document.getElementById('caption');
    this.titleCard = document.getElementById('titlecard');
    this.cut = document.getElementById('cut');
    this.active = false;
    document.getElementById('skip').addEventListener('click', (e) => {
      e.currentTarget.blur();
      this.finish();
    });
  }

  // True while the current beat is a 2.5D stage shot (main renders the stage then).
  get onStage() { return this.active && Boolean(this.beats[this.index]?.stage); }

  // anchor: () => Vector3 floor point under Bholu. player: for his pose.
  // inTunnel: () => whether he's in a tunnel (the camera then stays inside it).
  play(beats, { anchor, player, inTunnel = () => false, onDone = () => {} }) {
    this.beats = beats;
    this.anchor = anchor;
    this.inTunnel = inTunnel;
    this.player = player;
    this.onDone = onDone;
    this.active = true;
    // Take the camera off Bholu's rig for the cutscene; restored in finish().
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
    this.lineDone = !beat.line;
    this.lineEndedAt = 0;
    this.length = beat.duration ?? estimate(beat.line?.text ?? '');
    this.player.pose = beat.pose ?? { ride: true };
    this.dip();

    if (beat.stage) this.stage.show(beat.stage, beat.line?.who);
    this.el.classList.toggle('letterbox', !beat.stage); // bars for 3D camera shots only
    this.caption.textContent = beat.caption ?? '';
    this.caption.classList.toggle('hidden', !beat.caption);

    if (beat.title) {
      this.titleCard.innerHTML = `<small>${beat.title.kicker}</small><b>${beat.title.title}</b><span>${beat.title.place}</span>`;
      this.titleCard.classList.remove('hidden');
    } else {
      this.titleCard.classList.add('hidden');
    }

    if (beat.line) {
      const who = CHARACTERS[beat.line.who];
      this.bubble.innerHTML = `
        <img src="${who.portrait}" alt="" onerror="this.src='/art/emblem.webp'">
        <div><b>${who.name}</b><span>${beat.line.text}</span></div>`;
      this.bubble.className = 'call';
      this.bubble.style.visibility = 'hidden'; // placed (and shown) on the next update
      this.bubblePlaced = false;
      const recorded = this.voice.has(beat.line.text);
      this.voice.play(beat.line.text).then(() => {
        if (this.beats[this.index] !== beat) return;
        this.lineDone = true;
        this.lineEndedAt = recorded ? this.time : this.length; // no recording: give reading time
      });
    } else {
      this.bubble.classList.add('hidden');
    }
  }

  // Put the speech bubble beside the speaker's face, tail pointing at them.
  // A speaker who isn't in the picture talks from a portrait bubble at the top.
  placeBubble(beat) {
    if (beat.stage && !this.stage.ready) return; // wait for the picture, so it doesn't jump
    const b = this.bubble;
    const anchor = beat.stage ? this.stage.speakerAnchor() : null;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const margin = 12;
    const top = 56; // clear of the caption and the Skip button
    const portrait = b.querySelector('img');
    if (!anchor) {
      b.className = 'call';
      if (portrait) portrait.hidden = false;
      b.style.setProperty('--bubble-width', `min(520px, ${W - margin * 2}px)`);
      b.style.left = `${(W - b.offsetWidth) / 2}px`;
      b.style.top = `${top}px`;
    } else if (anchor.side === 'centre') { // above the head (phones, single shots)
      if (portrait) portrait.hidden = true;
      b.style.setProperty('--bubble-width', `min(460px, ${W - margin * 2}px)`);
      const left = Math.min(Math.max(anchor.x - b.offsetWidth / 2, margin), W - b.offsetWidth - margin);
      const y = Math.max(top, anchor.y - H * 0.13 - b.offsetHeight);
      b.className = 'tail-down';
      b.style.left = `${left}px`;
      b.style.top = `${y}px`;
      b.style.setProperty('--tail', `${Math.min(Math.max(anchor.x - left, 26), b.offsetWidth - 26)}px`);
    } else { // beside the head, on the open side of the picture
      if (portrait) portrait.hidden = true;
      b.style.setProperty('--bubble-width', `min(400px, ${W * 0.4}px)`);
      const gap = W * 0.07;
      const left = anchor.side === 'left'
        ? Math.min(anchor.x + gap, W - b.offsetWidth - margin)
        : Math.max(anchor.x - gap - b.offsetWidth, margin);
      const y = Math.min(Math.max(anchor.y - 30, top), H - b.offsetHeight - margin);
      b.className = anchor.side === 'left' ? 'tail-left' : 'tail-right';
      b.style.left = `${left}px`;
      b.style.top = `${y}px`;
      b.style.setProperty('--tail', `${Math.min(Math.max(anchor.y - y - 11, 14), b.offsetHeight - 30)}px`);
    }
    if (!this.bubblePlaced) {
      this.bubblePlaced = true;
      b.style.visibility = '';
    }
  }

  // A quick dip through black between shots.
  dip() {
    this.cut.classList.remove('on');
    void this.cut.offsetWidth;
    this.cut.classList.add('on');
  }

  next() {
    if (this.active && this.time > TAP_LOCK) this.start(this.index + 1);
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const beat = this.beats[this.index];
    const progress = Math.min(1, this.time / this.length);

    if (beat.line) this.placeBubble(beat);
    if (beat.stage) {
      this.stage.update(dt, progress);
    } else {
      const { pos, look } = beat.shot(progress, this.anchor());
      // In a tunnel, keep the camera inside it.
      if (this.inTunnel()) {
        const fromAxis = Math.hypot(pos.x, pos.y);
        if (fromAxis > TUBE_RADIUS - 0.4) {
          const scale = (TUBE_RADIUS - 0.4) / fromAxis;
          pos.x *= scale;
          pos.y *= scale;
        }
      }
      this.camera.position.copy(pos);
      this.camera.lookAt(look);
    }

    const done = beat.line
      ? this.lineDone && this.time >= Math.max(MIN_LINE, this.lineEndedAt + AFTER_LINE)
      : this.time >= this.length + (beat.hold ?? 0.25);
    const stuck = this.time > this.length * 2 + 6; // a voice that never reports back
    if (done || stuck) this.start(this.index + 1);
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
    this.bubble.classList.add('hidden');
    this.titleCard.classList.add('hidden');
    this.saved.parent.add(this.camera);
    this.camera.position.copy(this.saved.position);
    this.camera.quaternion.copy(this.saved.quaternion);
    this.onDone();
  }
}
