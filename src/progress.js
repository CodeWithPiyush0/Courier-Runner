import { LEVELS } from './story.js';

const KEY = 'courier-runner-progress';

// Story progress, saved in the browser: deliveries unlocked, best stars per
// delivery, intros already seen, and whether Endless is open.
class Progress {
  constructor() {
    this.data = { unlocked: 1, stars: {}, seen: {} };
    try {
      Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch { /* storage unavailable */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  get unlocked() { return this.data.unlocked; }
  get endlessUnlocked() { return this.data.unlocked > LEVELS.length; }
  // The delivery "Start" continues from: the first one without stars.
  get current() { return Math.min(this.data.unlocked, LEVELS.length); }

  stars(id) { return this.data.stars[id] ?? 0; }
  seen(id) { return Boolean(this.data.seen[id]); }

  markSeen(id) {
    this.data.seen[id] = true;
    this.save();
  }

  complete(id, stars) {
    this.data.stars[id] = Math.max(this.stars(id), stars);
    this.data.unlocked = Math.max(this.data.unlocked, id + 1);
    this.save();
  }

  unlockAll() {
    this.data.unlocked = LEVELS.length + 1;
    this.save();
  }
}

export const progress = new Progress();
