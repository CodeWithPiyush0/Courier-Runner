import { FIRST_ZONE_LENGTH, ZONE_LENGTH } from './config.js';

export const ZONE_ORDER = ['space', 'water'];

// Where along the run each zone starts. Boundaries are z positions (the run
// heads towards -z); zones alternate space → water → space … and are generated
// lazily as far ahead as anyone asks.
export class ZonePlan {
  constructor() { this.reset(0); }

  reset(startZ, firstLength = FIRST_ZONE_LENGTH) {
    this.bounds = [startZ - firstLength];
  }

  // The i-th boundary; crossing it enters zone ZONE_ORDER[(i + 1) % 2].
  boundary(i) {
    while (this.bounds.length <= i) {
      const [min, max] = ZONE_LENGTH;
      this.bounds.push(this.bounds[this.bounds.length - 1] - (min + Math.random() * (max - min)));
    }
    return this.bounds[i];
  }

  zoneAt(z) {
    let i = 0;
    while (z < this.boundary(i)) i++;
    return ZONE_ORDER[i % 2];
  }
}
