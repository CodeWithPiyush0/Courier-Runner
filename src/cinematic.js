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
  // A smooth flight through several points, looking along several targets.
  path: ({ points, looks }) => {
    const v = (p) => new THREE.Vector3(...p);
    const route = new THREE.CatmullRomCurve3(points.map(v));
    const aim = new THREE.CatmullRomCurve3(looks.map(v));
    return (t, a) => {
      const e = ease(t);
      return { pos: route.getPoint(e).add(a), look: aim.getPoint(e).add(a) };
    };
  },
};

// How long a line takes to say, roughly (used when there's no recording, and
// to pace camera moves).
const estimate = (text) => Math.max(2.4, text.length * 0.066 + 0.9);

// Plays a cutscene: a list of beats. A beat is either a 3D shot of the game
// world ({ shot, duration, pose, wide }) or a 2.5D stage shot ({ stage }),
// optionally with a voiced line, a caption and a delivery title card. Lines stay
// up until their voice has finished. Tap / Space = next, Skip / Esc = skip all.
export class Cinematic {
  constructor({ camera, scene, voice, stage }) {
    this.camera = camera;
    this.scene = scene;
    this.voice = voice;
    this.take = 0;
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
  // True during a wide aerial shot (main pushes the fog back so the city shows).
  get wide() { return this.active && Boolean(this.beats[this.index]?.wide); }

  // anchor: () => Vector3 floor point under Bholu. player: for his pose.
  // inTunnel: () => whether he's in a tunnel (the camera then stays inside it).
  // onMusic: (track) => change the music, for a line that asks for it (`music`).
  play(beats, { anchor, player, inTunnel = () => false, onMusic = () => {}, onDone = () => {} }) {
    this.beats = beats;
    this.onMusic = onMusic;
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
    const take = ++this.take; // a replayed line (after a pause) ignores the old take's voice
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

    if (beat.line?.music) this.onMusic(beat.line.music);
    if (beat.line) {
      const who = CHARACTERS[beat.line.who];
      this.bubble.innerHTML = `
        <img src="${who.portrait}" alt="" onerror="this.src='/art/emblem.webp'">
        <div><b>${who.name}</b><span>${beat.line.text}</span></div>`;
      this.bubble.className = 'call';
      this.bubble.style.visibility = 'hidden'; // laid out (and shown) on the next update
      this.bubbleLayout = null;
      this.bubbleShown = false;
      const recorded = this.voice.has(beat.line.text);
      this.voice.play(beat.line.text).then(() => {
        if (this.take !== take) return;
        this.lineDone = true;
        this.lineEndedAt = recorded ? this.time : this.length; // no recording: give reading time
      });
    } else {
      this.bubble.classList.add('hidden');
    }
  }

  // The speech bubble: beside the speaker's face on the open side of the
  // picture (never over a face), above or below the head for a lone figure on
  // a tall screen, or with a portrait at the top when the speaker isn't in the
  // picture. Its shape is decided once per line; after that it glides after
  // the face as the camera moves, eased, so it never jiggles.
  placeBubble(beat, dt) {
    if (beat.stage && !this.stage.ready) return; // wait for the picture
    const b = this.bubble;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const margin = 12;
    const top = 62; // clear of the caption, the Skip button and the bubble's name tag
    const gap = 22; // between the face and the bubble's tail
    const anchor = beat.stage ? this.stage.speakerAnchor() : null;
    const portrait = b.querySelector('img');

    if (!this.bubbleLayout) { // first frame of the line: choose the shape and size
      let mode = 'call';
      if (anchor?.side === 'left' || anchor?.side === 'right') mode = anchor.side;
      else if (anchor) mode = 'above';
      if (portrait) portrait.hidden = mode !== 'call';
      let width = Math.min(520, W - margin * 2);
      if (mode === 'left') width = Math.min(400, anchor.reach - anchor.face.right - gap - margin * 2);
      if (mode === 'right') width = Math.min(400, anchor.face.left - anchor.reach - gap - margin * 2);
      if (mode === 'above') width = Math.min(460, W - margin * 2);
      b.style.setProperty('--bubble-width', `${Math.max(180, width)}px`);
      if (mode === 'above' && anchor.face.top - gap - top < b.offsetHeight) mode = 'below'; // no room over the head
      b.className = { call: 'call', left: 'tail-left', right: 'tail-right', above: 'tail-down', below: 'tail-up' }[mode];
      this.bubbleLayout = { mode, w: b.offsetWidth, h: b.offsetHeight };
    }

    const { mode, w, h } = this.bubbleLayout;
    let x = (W - w) / 2;
    let y = top;
    let tail = 0;
    if (mode === 'left' || mode === 'right') {
      x = mode === 'left' ? anchor.face.right + gap : anchor.face.left - gap - w;
      y = anchor.face.top;
      tail = anchor.face.y - y - 10;
    } else if (mode === 'above' || mode === 'below') {
      x = anchor.face.x - w / 2;
      y = mode === 'above' ? anchor.face.top - gap - h : anchor.face.bottom + gap;
      tail = anchor.face.x;
    }
    x = Math.min(Math.max(x, margin), W - w - margin);
    y = Math.min(Math.max(y, top), H - h - margin);

    const ease = 1 - Math.exp(-dt * 5); // glide, don't snap
    if (this.bubbleShown) {
      this.bubblePos.x += (x - this.bubblePos.x) * ease;
      this.bubblePos.y += (y - this.bubblePos.y) * ease;
    } else {
      this.bubblePos = { x, y };
      this.bubbleShown = true;
      b.style.visibility = '';
    }
    b.style.left = `${this.bubblePos.x}px`;
    b.style.top = `${this.bubblePos.y}px`;
    if (mode === 'left' || mode === 'right') {
      b.style.setProperty('--tail', `${Math.min(Math.max(tail + y - this.bubblePos.y, 14), h - 30)}px`);
    } else if (mode !== 'call') {
      b.style.setProperty('--tail', `${Math.min(Math.max(tail - this.bubblePos.x, 26), w - 26)}px`);
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

    if (beat.line) this.placeBubble(beat, dt);
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
