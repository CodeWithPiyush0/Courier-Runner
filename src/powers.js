import { POWER_DURATION } from './config.js';

export const POWER_TYPES = Object.keys(POWER_DURATION);

// Countdown timers for the active power-ups.
export class Powers {
  constructor() { this.reset(); }

  reset() {
    this.timers = Object.fromEntries(POWER_TYPES.map((type) => [type, 0]));
  }

  activate(type) { this.timers[type] = POWER_DURATION[type]; }
  end(type) { this.timers[type] = 0; }
  has(type) { return this.timers[type] > 0; }
  remaining(type) { return this.timers[type] / POWER_DURATION[type]; }

  // Returns the power-ups that ran out this frame.
  update(dt) {
    const ended = [];
    for (const type of POWER_TYPES) {
      if (this.timers[type] === 0) continue;
      this.timers[type] = Math.max(0, this.timers[type] - dt);
      if (this.timers[type] === 0) ended.push(type);
    }
    return ended;
  }
}
