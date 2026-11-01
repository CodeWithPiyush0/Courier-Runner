import { settings } from './settings.js';

// Each track, then a stand-in to play until it has been generated (npm run music).
const MUSIC = {
  menu: ['music/menu.mp3'],
  road: ['music/road.mp3'],
  tunnel: ['music/tunnel.mp3'],
};
const MUSIC_LEVEL = 0.7; // music sits a little under the effects and voice
const VOICE_DUCK = 0.45; // music level while Dispatch is talking
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

  // Play a named effect. `muffled` dulls things in a tunnel;
  // `step` raises the pitch (coin streaks).
  play(name, { muffled = false, step = 0 } = {}) {
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
      case 'coin':
        this.tone({ from: 1320 * pitch, duration: 0.07, volume: 0.16 });
        this.tone({ from: 1760 * pitch, duration: 0.12, volume: 0.14, delay: 0.05 });
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
      case 'smash':
        this.noise({ filter: 'lowpass', from: 2500, to: 200, duration: 0.3, volume: 0.3 });
        break;
      case 'crash':
        this.noise({ filter: 'lowpass', from: muffle || 3000, to: 80, duration: 0.7, volume: 0.5 });
        this.tone({ from: 130, to: 35, duration: 0.6, volume: 0.45 });
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
      case 'gameover':
        [523, 392, 330, 262].forEach((f, i) => this.tone({ type: 'triangle', from: f, duration: 0.3, volume: 0.18, delay: i * 0.15 }));
        break;
      case 'click':
        this.tone({ from: 900, to: 700, duration: 0.05, volume: 0.12 });
        break;
    }
  }
}
