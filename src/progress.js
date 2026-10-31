import { LEVELS } from './story.js';

const KEY = 'courier-runner-progress';
const EMPTY = () => ({ unlocked: 1, stars: {}, seen: {}, checkpoint: null });

// Story progress, saved in the browser: deliveries unlocked, best stars per
// delivery, intros already seen, whether Endless is open, and a checkpoint of
// the delivery in progress so a refresh can resume it.
class Progress {
  constructor() {
    this.data = EMPTY();
    try {
      Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch { /* storage unavailable */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  }

  get unlocked() { return this.data.unlocked; }
  get endlessUnlocked() { return this.data.unlocked > LEVELS.length; }
  get started() { return this.data.unlocked > 1 || Boolean(this.data.checkpoint); }
  // The delivery "Continue" goes to: the first one not yet finished.
  get current() { return Math.min(this.data.unlocked, LEVELS.length); }
  // { level, distance, coins, hits, tutorialDone } or null.
  get checkpoint() { return this.data.checkpoint; }

  stars(id) { return this.data.stars[id] ?? 0; }
  seen(id) { return Boolean(this.data.seen[id]); }

  markSeen(id) {
    this.data.seen[id] = true;
    this.save();
  }

  saveCheckpoint(checkpoint) {
    this.data.checkpoint = checkpoint;
    this.save();
  }

  clearCheckpoint() {
    if (!this.data.checkpoint) return;
    this.data.checkpoint = null;
    this.save();
  }

  complete(id, stars) {
    this.data.stars[id] = Math.max(this.stars(id), stars);
    this.data.unlocked = Math.max(this.data.unlocked, id + 1);
    this.data.checkpoint = null;
    this.save();
  }

  // New game: forget everything.
  reset() {
    this.data = EMPTY();
    this.save();
  }

  unlockAll() {
    this.data.unlocked = LEVELS.length + 1;
    this.save();
  }
}

export const progress = new Progress();
