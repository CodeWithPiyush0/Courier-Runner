import { settings } from './settings.js';

// Each track, then a stand-in to play until it has been generated (npm run music).
const MUSIC = {
  menu: ['music/menu.mp3'],
  road: ['music/road.mp3'],
  tunnel: ['music/tunnel.mp3'],
  // The old song on Nani's radio at the end (you add the file: public/music/radio-song.mp3).
  radio: ['music/radio-song.mp3'],
};
// Tracks that play "through a radio": a warm, slightly tinny band of frequencies.
const RADIO_TRACKS = new Set(['radio']);
const MUSIC_LEVEL = 0.7; // music sits a little under the effects and voice
const VOICE_DUCK = 0.3; // music level while someone is talking (so the words always come through)
const PAUSE_DUCK = 0.35;

// All game audio: streamed music with crossfades, synthesized sound effects,
// the characters' voices, and phone vibration. Everything runs through one
// AudioContext with a gain per channel, so volumes work even on iOS (where
// <audio>.volume is read-only). Browsers only allow audio after a tap or key
// press, so nothing plays until unlock() is called from one.
export class Sound {
  constructor() {
    this.ctx = null;
    this.tracks = {};
    this.currentTrack = null;
    this.wantedTrack = null;
    this.voiceDuck = 1;
    this.pauseDuck = 1;
    this.voiceFiles = new Map(); // url -> Promise<ArrayBuffer | null> (fetched, not yet decoded)
    this.voiceBuffers = new Map(); // url -> Promise<AudioBuffer | null>
    this.voiceSource = null;
    this.voiceToken = 0;
    settings.onChange(() => this.applyVolumes());
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const bus of ['musicBus', 'sfxBus', 'voiceBus']) {
      this[bus] = ctx.createGain();
      this[bus].connect(this.master);
    }

    // Voices go through an analyser so cutscenes can make the speaker bob as they talk.
    this.voiceAnalyser = ctx.createAnalyser();
    this.voiceAnalyser.fftSize = 256;
    this.voiceAnalyser.connect(this.voiceBus);
    this.voiceSamples = new Uint8Array(this.voiceAnalyser.fftSize);

    // One second of white noise, reused by every noisy effect.
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.applyVolumes();
    if (this.wantedTrack) this.playMusic(this.wantedTrack);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.get('muted') ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.get('music') * MUSIC_LEVEL * this.voiceDuck * this.pauseDuck, t, 0.2);
    this.sfxBus.gain.setTargetAtTime(settings.get('sfx'), t, 0.05);
    this.voiceBus.gain.setTargetAtTime(settings.get('voice'), t, 0.05);
  }

  // The tab is hidden or the window minimised: silence everything at once
  // (music, effects, voices); wake() brings the sound back.
  sleep() {
    if (!this.ctx) return;
    this.sleeping = Object.values(this.tracks).filter((t) => !t.el.paused);
    for (const t of this.sleeping) t.el.pause();
    this.stopVoice();
    this.ctx.suspend();
  }

  wake() {
    if (!this.ctx) return;
    this.ctx.resume();
    for (const t of this.sleeping ?? []) t.el.play().catch(() => {});
    this.sleeping = [];
  }

  setPaused(paused) {
    this.pauseDuck = paused ? PAUSE_DUCK : 1;
    if (paused) this.stopVoice();
    this.applyVolumes();
  }

  setVoiceDuck(level) {
    this.voiceDuck = level;
    this.applyVolumes();
  }

  // ---------- music ----------

  // Crossfade to a track (menu | road | tunnel). Before unlock it is remembered.
  playMusic(name) {
    this.wantedTrack = name;
    if (!this.ctx || this.currentTrack === name) return;
    const t = this.ctx.currentTime;
    const old = this.tracks[this.currentTrack];
    if (old) {
      old.gain.gain.setTargetAtTime(0, t, 0.5);
      old.stopTimer = setTimeout(() => old.el.pause(), 3000);
    }
    let track = this.tracks[name];
    if (!track) {
      const [file, standIn] = MUSIC[name];
      const el = new Audio(file);
      el.loop = true;
      if (standIn) {
        el.addEventListener('error', () => {
          if (el.src.endsWith(standIn)) return;
          el.src = standIn;
          if (this.currentTrack === name) el.play().catch(() => {});
        });
      }
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      let source = this.ctx.createMediaElementSource(el);
      if (RADIO_TRACKS.has(name)) {
        const band = this.ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1500;
        band.Q.value = 0.55;
        source = source.connect(band);
      }
      source.connect(gain).connect(this.musicBus);
      track = { el, gain };
      this.tracks[name] = track;
    }
    clearTimeout(track.stopTimer);
    track.el.play().catch(() => {}); // a missing track just stays silent
    track.gain.gain.setTargetAtTime(1, t, 0.6);
    this.currentTrack = name;
  }

  // ---------- voice ----------
  // Voice clips are short, so they are fetched ahead of time and decoded into
  // memory: they start instantly and we know exactly when each one ends.

  fetchVoice(url) {
    if (!this.voiceFiles.has(url)) {
      this.voiceFiles.set(url, fetch(url).then((res) => (res.ok ? res.arrayBuffer() : null)).catch(() => null));
    }
    return this.voiceFiles.get(url);
  }

  decodeVoice(url) {
    if (!this.voiceBuffers.has(url)) {
      this.voiceBuffers.set(url, this.fetchVoice(url)
        .then((data) => (data ? this.ctx.decodeAudioData(data.slice(0)) : null))
        .catch(() => null));
    }
    return this.voiceBuffers.get(url);
  }

  // Play a clip, replacing any line already playing. Resolves when it ends
  // (or straight away if it can't play).
  async playVoice(url) {
    if (!this.ctx) return;
    this.stopVoice();
    const token = this.voiceToken;
    const buffer = await this.decodeVoice(url);
    if (!buffer || token !== this.voiceToken) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.voiceAnalyser);
    this.voiceSource = source;
    this.setVoiceDuck(VOICE_DUCK);
    await new Promise((resolve) => {
      source.onended = resolve;
      source.start();
    });
    if (this.voiceSource === source) {
      this.voiceSource = null;
      this.setVoiceDuck(1);
    }
  }

  stopVoice() {
    this.voiceToken++;
    if (this.voiceSource) {
      try { this.voiceSource.stop(); } catch { /* already stopped */ }
      this.voiceSource = null;
    }
    if (this.ctx) this.setVoiceDuck(1);
  }

  get voiceBusy() { return Boolean(this.voiceSource); }

  // How loud the current line is right now, 0..1.
  voiceLevel() {
    if (!this.voiceSource) return 0;
    this.voiceAnalyser.getByteTimeDomainData(this.voiceSamples);
    let sum = 0;
    for (const v of this.voiceSamples) sum += (v - 128) ** 2;
    return Math.min(1, Math.sqrt(sum / this.voiceSamples.length) / 40);
  }

  // ---------- vibration ----------

  buzz(pattern) {
    if (settings.get('haptics')) navigator.vibrate?.(pattern);
  }

  // ---------- synthesized effects ----------

  // A pitched blip: oscillator sliding from `from` to `to` Hz with a quick decay.
  // `hold` keeps the note at full volume until just before the end (horns);
  // otherwise it decays away like a chime. `pan` is -1 (left) .. 1 (right).
  tone({ type = 'sine', from, to = from, duration, volume = 0.3, delay = 0, lowpass = 0, hold = false, pan = 0 }) {
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    if (hold) env.gain.setValueAtTime(volume, start + duration - 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    let node = osc.connect(env);
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      node = node.connect(filter);
    }
    if (pan) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      node = node.connect(panner);
    }
    node.connect(this.sfxBus);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  // A filtered noise burst (whooshes, splashes, impacts); the filter sweeps from→to.
  noise({ filter = 'bandpass', from, to = from, duration, volume = 0.3, delay = 0, q = 1 }) {
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(from, start);
    biquad.frequency.exponentialRampToValueAtTime(to, start + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.03, duration / 3));
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(biquad).connect(env).connect(this.sfxBus);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.05);
  }

  // A cartoon spring "boing" (bumps and knocks).
  boing(delay = 0) {
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const wobble = ctx.createOscillator();
    const depth = ctx.createGain();
    wobble.frequency.value = 22;
    depth.gain.setValueAtTime(90, start);
    depth.gain.exponentialRampToValueAtTime(5, start + 0.4);
    wobble.connect(depth).connect(osc.frequency);
    osc.frequency.setValueAtTime(300, start);
    osc.frequency.exponentialRampToValueAtTime(480, start + 0.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    osc.connect(env).connect(this.sfxBus);
    for (const o of [osc, wobble]) { o.start(start); o.stop(start + 0.45); }
  }

  // An accident, by what Bholu hit: tyres screech first, then the impact.
  // `prop` is the obstacle's picture name (ob-cow, ob-truck, ...).
  accident(prop = '', { muffled = false } = {}) {
    if (!this.ctx || settings.get('muted')) return;
    const muffle = muffled ? 1800 : 0;
    // The screech: a squealing band of noise and a whining tone.
    this.noise({ filter: 'bandpass', from: 2600, to: 1900, duration: 0.42, volume: 0.22, q: 6 });
    this.tone({ type: 'sawtooth', from: 2300, to: 1700, duration: 0.4, volume: 0.04, lowpass: 4000 });
    const at = 0.36; // the bang lands as the screech ends
    if (prop === 'ob-cow') {
      this.tone({ from: 150, to: 55, duration: 0.35, volume: 0.42, delay: at, lowpass: muffle });
      this.noise({ filter: 'lowpass', from: 900, to: 150, duration: 0.25, volume: 0.25, delay: at });
      this.moo(at + 0.35);
    } else if (prop === 'ob-barricade' || prop === 'ob-boom') {
      this.impact('metal', { muffle, delay: at });
      [523, 1347, 2211, 3120].forEach((f) => this.tone({ from: f, duration: 0.9, volume: 0.05, delay: at })); // the clang rings on
    } else if (prop === 'ob-cart' || prop === 'tn-junk' || prop === 'ob-bricks') {
      this.impact('wood', { muffle, delay: at });
    } else {
      this.impact('metal', { muffle, delay: at }); // a vehicle: crunch, glass, and its horn stuck on
      for (let i = 0; i < 9; i++) this.tone({ from: 3000 + Math.random() * 4500, duration: 0.12, volume: 0.04, delay: at + 0.08 + Math.random() * 0.4 });
      if (!muffled) this.play('horn-truck', { pan: 0.3 });
    }
  }

  // A crash: a low thump plus metal crunch (or a wooden clatter).
  impact(kind, { light = false, muffle = 0, delay = 0 } = {}) {
    const loud = light ? 0.5 : 1;
    this.tone({ from: 130, to: 35, duration: 0.6, volume: 0.45 * loud, delay, lowpass: muffle });
    this.noise({ filter: 'lowpass', from: muffle || 3200, to: 90, duration: 0.7, volume: 0.45 * loud, delay });
    if (kind === 'metal') {
      [410, 690, 1170, 1730].forEach((f, i) => this.tone({ type: 'square', from: f, to: f * 0.8, duration: 0.25, volume: 0.03 * loud, delay: delay + i * 0.03, lowpass: 3000 }));
    } else {
      for (let i = 0; i < 7; i++) this.noise({ filter: 'bandpass', from: 700 + Math.random() * 1200, duration: 0.07, volume: 0.15 * loud, delay: delay + 0.05 + i * (0.04 + Math.random() * 0.05), q: 3 });
    }
  }

  // An indignant cow.
  moo(delay = 0) {
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, start);
    osc.frequency.linearRampToValueAtTime(190, start + 0.25);
    osc.frequency.linearRampToValueAtTime(115, start + 1);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(500, start);
    formant.frequency.linearRampToValueAtTime(800, start + 0.3);
    formant.frequency.linearRampToValueAtTime(420, start + 1);
    formant.Q.value = 2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.35, start + 0.12);
    env.gain.setValueAtTime(0.3, start + 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 1.05);
    osc.connect(formant).connect(env).connect(this.sfxBus);
    osc.start(start);
    osc.stop(start + 1.1);
  }

  // Play a named effect. `muffled` dulls things in a tunnel;
  // `step` raises the pitch (coin streaks).
  // `pan` places street sounds left or right.
  play(name, { muffled = false, step = 0, pan = 0 } = {}) {
    if (!this.ctx || settings.get('muted')) return;
    const muffle = muffled ? 1800 : 0;
    const pitch = 2 ** (Math.min(step, 12) / 12);
    switch (name) {
      case 'lane':
        this.noise({ from: 900, to: 2600, duration: 0.1, volume: 0.12, q: 2 });
        break;
      case 'jump':
        this.tone({ type: 'triangle', from: 320, to: 760, duration: 0.16, volume: 0.22, lowpass: muffle });
        this.noise({ from: 600, to: 2000, duration: 0.14, volume: 0.06 });
        break;
      case 'slide':
        this.noise({ filter: 'lowpass', from: 1400, to: 250, duration: 0.28, volume: 0.18 });
        break;
      case 'flip':
        this.tone({ type: 'sawtooth', from: 180, to: 1100, duration: 0.42, volume: 0.1, lowpass: 2400 });
        this.noise({ from: 400, to: 3000, duration: 0.45, volume: 0.12, q: 1.5 });
        break;
      case 'coin': // a bright "cha-ching" that climbs through a streak
        this.tone({ type: 'triangle', from: 1568 * pitch, duration: 0.08, volume: 0.15 });
        this.tone({ type: 'triangle', from: 2093 * pitch, duration: 0.22, volume: 0.13, delay: 0.06 });
        this.tone({ from: 3136 * pitch, duration: 0.18, volume: 0.05, delay: 0.06 });
        this.noise({ filter: 'highpass', from: 6000, to: 9000, duration: 0.12, volume: 0.04, delay: 0.05 });
        break;
      case 'payment': { // a UPI soundbox's "payment received": bell notes climbing a major chord, ringing out on top
        const bell = (f, delay, length, volume) => {
          this.tone({ from: f, duration: length, volume, delay });
          this.tone({ from: f * 2.76, duration: length * 0.35, volume: volume * 0.28, delay }); // the bell's metallic overtone
          this.tone({ from: f * 5.4, duration: length * 0.15, volume: volume * 0.1, delay });
        };
        [[1319, 0], [1661, 0.085], [1976, 0.17]].forEach(([f, d]) => bell(f, d, 0.35, 0.1));
        bell(2637, 0.255, 1.1, 0.14);
        bell(2637, 0.4, 0.9, 0.035); // a soft echo, like the soundbox's little speaker
        break;
      }
      case 'horn': // Bholu's scooter: a cheeky double "peep-peep"
        for (const delay of [0, 0.2]) {
          this.tone({ type: 'square', from: 415, duration: 0.15, volume: 0.07, lowpass: 2200, hold: true, delay });
          this.tone({ type: 'square', from: 523, duration: 0.15, volume: 0.06, lowpass: 2200, hold: true, delay });
        }
        break;
      case 'horn-auto': // an auto-rickshaw's nasal "pom-pom", off to one side
        for (const delay of [0, 0.17]) {
          this.tone({ type: 'square', from: 350, duration: 0.12, volume: 0.035, lowpass: 1400, hold: true, delay, pan });
          this.tone({ type: 'square', from: 440, duration: 0.12, volume: 0.03, lowpass: 1400, hold: true, delay, pan });
        }
        break;
      case 'horn-truck': // a truck's long air horn
        [185, 233, 277].forEach((f) => this.tone({ type: 'sawtooth', from: f, duration: 0.75, volume: 0.025, lowpass: 1300, hold: true, pan }));
        break;
      case 'horn-bike': // a motorbike's quick beeps
        [0, 0.11, 0.22].forEach((delay) => this.tone({ type: 'square', from: 880, duration: 0.08, volume: 0.025, lowpass: 2600, hold: true, delay, pan }));
        break;
      case 'charge': // a battery for the torch
        this.tone({ type: 'square', from: 440, to: 880, duration: 0.12, volume: 0.1, lowpass: 3000 });
        this.tone({ type: 'square', from: 880, to: 1320, duration: 0.1, volume: 0.08, lowpass: 3000, delay: 0.08 });
        break;
      case 'power':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', from: f, duration: 0.14, volume: 0.18, delay: i * 0.06 }));
        break;
      case 'boost':
        this.tone({ type: 'sawtooth', from: 90, to: 520, duration: 0.6, volume: 0.14, lowpass: 3000 });
        this.noise({ filter: 'highpass', from: 400, to: 5000, duration: 0.7, volume: 0.12 });
        break;
      case 'zap':
        this.tone({ type: 'sawtooth', from: 900, to: 90, duration: 0.28, volume: 0.2, lowpass: muffle || 5000 });
        this.noise({ filter: 'highpass', from: 3000, to: 1500, duration: 0.18, volume: 0.15 });
        break;
      case 'shield':
        for (let i = 0; i < 5; i++) this.tone({ from: 1800 + Math.random() * 2400, duration: 0.25, volume: 0.08, delay: i * 0.02 });
        this.noise({ filter: 'highpass', from: 4000, to: 2000, duration: 0.2, volume: 0.15 });
        break;
      case 'smash': // ploughing through something (helmet, chai boost)
        this.impact('metal', { light: true, muffle });
        break;
      case 'whistle': // Mamu's police whistle: a trilled two-tone blast
        for (let i = 0; i < 6; i++) {
          this.tone({ type: 'sine', from: i % 2 ? 2650 : 2400, duration: 0.07, volume: 0.13, delay: i * 0.06 });
        }
        this.tone({ type: 'sine', from: 2500, to: 2300, duration: 0.35, volume: 0.12, delay: 0.36 });
        break;
      case 'powerdown': // the torch dies
        this.tone({ type: 'sawtooth', from: 600, to: 60, duration: 0.8, volume: 0.15, lowpass: 2000 });
        break;
      case 'tunnelIn': // down into the echoing nala
        this.noise({ filter: 'lowpass', from: 3000, to: 300, duration: 0.9, volume: 0.3 });
        this.tone({ from: 160, to: 70, duration: 0.7, volume: 0.25 });
        break;
      case 'tunnelOut': // back out into the open
        this.noise({ filter: 'highpass', from: 300, to: 5000, duration: 0.8, volume: 0.25 });
        break;
      case 'lowBattery':
        this.tone({ type: 'square', from: 880, duration: 0.07, volume: 0.07 });
        this.tone({ type: 'square', from: 880, duration: 0.07, volume: 0.07, delay: 0.12 });
        break;
      case 'bump': // clipped something low: a thud and a cartoon boing
        this.tone({ from: 170, to: 60, duration: 0.22, volume: 0.32, lowpass: muffle });
        this.noise({ filter: 'lowpass', from: 1200, to: 200, duration: 0.16, volume: 0.18 });
        this.boing(0.06);
        break;
      case 'thwack': // ducked too late into a banner or a boom barrier
        this.noise({ filter: 'bandpass', from: 900, to: 400, duration: 0.18, volume: 0.32, q: 0.8 });
        this.tone({ type: 'triangle', from: 240, to: 120, duration: 0.18, volume: 0.2 });
        this.boing(0.08);
        break;
      case 'gameover':
        [523, 392, 330, 262].forEach((f, i) => this.tone({ type: 'triangle', from: f, duration: 0.3, volume: 0.18, delay: i * 0.15 }));
        break;
      case 'click':
        this.tone({ from: 900, to: 700, duration: 0.05, volume: 0.12 });
        break;
    }
  }
}
