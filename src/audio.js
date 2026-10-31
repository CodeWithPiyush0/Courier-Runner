import { settings } from './settings.js';

const MUSIC = { menu: 'music/menu.mp3', space: 'music/space.mp3', water: 'music/water.mp3' };
const MUSIC_LEVEL = 0.7; // music sits a little under the effects and voice
const VOICE_DUCK = 0.45; // music level while Dispatch is talking
const PAUSE_DUCK = 0.35;

// All game audio: streamed music with crossfades, synthesized sound effects,
// Dispatch's voice, and phone vibration. Everything runs through one
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

    this.voiceEl = new Audio();
    ctx.createMediaElementSource(this.voiceEl).connect(this.voiceBus);
    this.voiceEl.addEventListener('ended', () => this.setVoiceDuck(1));

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

  // Crossfade to a track (menu | space | water). Before unlock it is remembered.
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
      const el = new Audio(MUSIC[name]);
      el.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain).connect(this.musicBus);
      track = { el, gain };
      this.tracks[name] = track;
    }
    clearTimeout(track.stopTimer);
    track.el.play().catch(() => {}); // a missing track just stays silent
    track.gain.gain.setTargetAtTime(1, t, 0.6);
    this.currentTrack = name;
  }

  // ---------- voice ----------

  playVoice(file) {
    if (!this.ctx) return;
    this.voiceEl.src = file;
    this.voiceEl.play().then(() => this.setVoiceDuck(VOICE_DUCK)).catch(() => {});
  }

  stopVoice() {
    this.voiceEl?.pause();
    this.setVoiceDuck(1);
  }

  // ---------- vibration ----------

  buzz(pattern) {
    if (settings.get('haptics')) navigator.vibrate?.(pattern);
  }

  // ---------- synthesized effects ----------

  // A pitched blip: oscillator sliding from `from` to `to` Hz with a quick decay.
  tone({ type = 'sine', from, to = from, duration, volume = 0.3, delay = 0, lowpass = 0 }) {
    const ctx = this.ctx;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    let node = osc.connect(env);
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      node = node.connect(filter);
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

  // Play a named effect. `water` muffles and lowers things underwater;
  // `step` raises the pitch (coin streaks).
  play(name, { water = false, step = 0 } = {}) {
    if (!this.ctx || settings.get('muted')) return;
    const muffle = water ? 1800 : 0;
    const pitch = 2 ** (Math.min(step, 12) / 12);
    switch (name) {
      case 'lane':
        this.noise({ from: 900, to: 2600, duration: 0.1, volume: 0.12, q: 2 });
        break;
      case 'jump':
        this.tone({ type: 'triangle', from: water ? 220 : 320, to: water ? 480 : 760, duration: 0.16, volume: 0.22, lowpass: muffle });
        this.noise({ from: 600, to: 2000, duration: 0.14, volume: 0.06 });
        break;
      case 'slide':
        this.noise({ filter: 'lowpass', from: 1400, to: 250, duration: 0.28, volume: 0.18 });
        break;
      case 'flip':
        this.tone({ type: 'sawtooth', from: 180, to: 1100, duration: 0.42, volume: 0.1, lowpass: 2400 });
        this.noise({ from: 400, to: 3000, duration: 0.45, volume: 0.12, q: 1.5 });
        break;
      case 'coin':
        this.tone({ from: 1320 * pitch, duration: 0.07, volume: 0.16 });
        this.tone({ from: 1760 * pitch, duration: 0.12, volume: 0.14, delay: 0.05 });
        break;
      case 'bubble':
        this.tone({ from: 380, to: 1300, duration: 0.09, volume: 0.22 });
        this.tone({ from: 520, to: 1600, duration: 0.07, volume: 0.15, delay: 0.06 });
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
      case 'smash':
        this.noise({ filter: 'lowpass', from: 2500, to: 200, duration: 0.3, volume: 0.3 });
        break;
      case 'crash':
        this.noise({ filter: 'lowpass', from: muffle || 3000, to: 80, duration: 0.7, volume: 0.5 });
        this.tone({ from: 130, to: 35, duration: 0.6, volume: 0.45 });
        break;
      case 'chomp':
        this.tone({ type: 'square', from: 140, to: 60, duration: 0.25, volume: 0.25, lowpass: 900 });
        this.tone({ type: 'square', from: 120, to: 50, duration: 0.25, volume: 0.25, lowpass: 900, delay: 0.22 });
        break;
      case 'drown':
        for (let i = 0; i < 6; i++) this.tone({ from: 700 - i * 80, to: 1100 - i * 80, duration: 0.08, volume: 0.15, delay: i * 0.12 });
        break;
      case 'splash':
        this.noise({ from: 300, to: 3500, duration: 0.9, volume: 0.35, q: 0.7 });
        for (let i = 0; i < 4; i++) this.tone({ from: 400 + i * 150, to: 1400, duration: 0.08, volume: 0.1, delay: 0.25 + i * 0.09 });
        break;
      case 'geyser':
        this.noise({ filter: 'highpass', from: 200, to: 6000, duration: 1.1, volume: 0.3 });
        break;
      case 'oxygen':
        this.tone({ type: 'square', from: 880, duration: 0.07, volume: 0.07 });
        this.tone({ type: 'square', from: 880, duration: 0.07, volume: 0.07, delay: 0.12 });
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
