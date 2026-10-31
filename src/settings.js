const KEY = 'courier-runner-settings';

export const DEFAULTS = {
  music: 0.6, // volumes 0..1
  sfx: 0.8,
  voice: 1,
  muted: false, // the quick 🔊 button / M key
  haptics: true,
  quality: 'auto', // auto | high | low
};

// Player preferences, saved in the browser. Reading or writing storage can fail
// (private mode, blocked site data); the game then just uses the defaults.
class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      Object.assign(this.values, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch { /* storage unavailable */ }
    this.listeners = [];
  }

  get(name) { return this.values[name]; }

  set(name, value) {
    this.values[name] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* storage unavailable */ }
    for (const listener of this.listeners) listener(name, value);
  }

  onChange(listener) { this.listeners.push(listener); }
}

export const settings = new Settings();
