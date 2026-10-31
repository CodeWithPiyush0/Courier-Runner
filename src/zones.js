import { FIRST_ZONE_LENGTH, ZONE_LENGTH } from './config.js';

export const ZONE_ORDER = ['space', 'water'];

// Where along the run each zone starts. Boundaries are z positions (the run
// heads towards -z).
// - Story deliveries follow a fixed route: [[zone, metres], ...], ending at
//   `finishZ`.
// - Endless runs alternate space → water → space … with random lengths,
//   generated lazily as far ahead as anyone asks.
export class ZonePlan {
  constructor() { this.reset(0); }

  reset(startZ, route = null) {
    this.route = route;
    if (route) {
      let z = startZ;
      this.bounds = route.map(([, metres]) => (z -= metres));
      this.finishZ = z;
    } else {
      this.bounds = [startZ - FIRST_ZONE_LENGTH];
      this.finishZ = -Infinity;
    }
  }

  // The i-th zone change (-Infinity when there are no more).
  boundary(i) {
    if (this.route) return i < this.route.length - 1 ? this.bounds[i] : -Infinity;
    while (this.bounds.length <= i) {
      const [min, max] = ZONE_LENGTH;
      this.bounds.push(this.bounds[this.bounds.length - 1] - (min + Math.random() * (max - min)));
    }
    return this.bounds[i];
  }

  zoneAt(z) {
    let i = 0;
    while (z < this.boundary(i)) i++;
    return this.route ? this.route[i][0] : ZONE_ORDER[i % 2];
  }
}
