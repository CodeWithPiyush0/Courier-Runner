import { LANES } from './config.js';
import { TUTORIAL_TEXT } from './story.js';

const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const PLACE_AHEAD = 42; // metres ahead a lesson's obstacle appears
const PROMPT_DISTANCE = 13; // metres before it when time (almost) stops
const FREEZE = 0.03; // time scale while waiting for the player
const KEYS = { lane: ['←', '→'], jump: ['↑'], slide: ['↓'], flip: ['SPACE'] };
const ICONS = { battery: '/art/icon-battery.webp', coins: '/art/icon-coin.webp' };

// Something across every lane there is at z (3 on the road, 8 in a tunnel).
const across = (type) => (track, player, z) => {
  for (const l of track.lanesAt(z)) track.add(type, l, z);
};

// Lessons are lists of steps:
//   wait — place something, nearly freeze time when it's close and show a
//          prompt until the player does `actions` (or is already safe).
//   tip  — show a short tip; time keeps running (slow: briefly slows it).
// Steps start at a distance (`at`) or on an event (`when`: tunnel | power).
const LESSONS = {
  basics: [
    // On the road: lanes, tips, hop, duck.
    {
      kind: 'wait', id: 'lane', at: 20, actions: ['left', 'right'],
      place: (track, player, z) => track.add('wall', player.laneIndex, z),
      safe: (player, step) => player.laneIndex !== step.lane,
    },
    { kind: 'tip', id: 'coins', gap: 30, place: (track, player, z) => track.coinTrail(player.laneIndex, z + 20, 6) },
    { kind: 'wait', id: 'jump', actions: ['jump'], place: across('low') },
    { kind: 'wait', id: 'slide', actions: ['slide'], place: across('high') },
    { kind: 'tip', id: 'goal', resume: true },
    // In the shortcut: the walls, the flip, the torch.
    { kind: 'tip', id: 'tunnel', when: 'tunnel', slow: true, gap: 30 },
    {
      kind: 'wait', id: 'flip', actions: ['flip'],
      place: (track, player, z) => {
        track.clearBetween(z + 25, z - 20); // nothing else near the lesson
        for (let l = 0; l < LANES; l++) if (l !== (player.laneIndex + 4) % LANES) track.add('wall', l, z);
      },
      safe: (player, step) => player.laneIndex === (step.lane + 4) % LANES,
    },
    { kind: 'tip', id: 'battery' },
  ],
  chase: [
    { kind: 'tip', id: 'chase', at: 30 },
    { kind: 'tip', id: 'powers', when: 'power' },
  ],
  tunnel: [
    { kind: 'tip', id: 'battery', when: 'tunnel', slow: true },
  ],
};

// Runs the lessons of a delivery and draws the coach card (#coach).
export class Tutorial {
  constructor(sound) {
    this.sound = sound;
    this.el = document.getElementById('coach');
    this.steps = [];
  }

  start(lesson, track) {
    this.steps = [...(LESSONS[lesson] ?? [])];
    this.track = track;
    this.index = 0;
    this.phase = 'idle';
    this.nextAt = this.steps[0]?.at ?? 0;
    this.slowTime = 0;
    this.hide();
  }

  stop() {
    this.steps = [];
    this.hide();
  }

  get step() { return this.steps[this.index]; }
  get waiting() { return this.phase === 'prompt'; }

  // Advance the lessons. Returns the time scale the game should run at.
  update(dt, { player, distance, zone }) {
    const step = this.step;
    this.slowTime = Math.max(0, this.slowTime - dt);
    if (!step) return 1;

    if (this.phase === 'idle' && this.ready(step, distance, zone)) {
      const z = player.z - PLACE_AHEAD;
      step.lane = player.laneIndex;
      step.place?.(this.track, player, z);
      if (step.kind === 'wait') {
        this.obstacleZ = z;
        this.phase = 'approach';
      } else {
        this.show(step, false);
        if (step.resume) this.track.resumeSpawning(player.z - 60);
        if (step.slow) this.slowTime = 2.5;
        this.finishStep(distance + (step.gap ?? 25));
      }
    } else if (this.phase === 'approach' && player.z - this.obstacleZ < PROMPT_DISTANCE) {
      if (step.safe?.(player, step)) {
        this.praise();
        this.finishStep(distance + 22);
      } else {
        this.phase = 'prompt';
        this.show(step, true);
      }
    }

    if (this.phase === 'prompt') return FREEZE;
    return this.slowTime > 0 ? 0.35 : 1;
  }

  ready(step, distance, zone) {
    if (step.when === 'tunnel') return zone === 'tunnel';
    if (step.when === 'power') return this.track.items.some((i) => i.kind === 'power' && !i.done);
    return distance >= this.nextAt;
  }

  finishStep(nextAt) {
    this.index++;
    this.phase = 'idle';
    this.nextAt = Math.max(nextAt, this.step?.at ?? 0);
  }

  // Called with every player action; returns false to swallow actions that
  // aren't the one being taught while time is frozen.
  allow(action, distance) {
    if (this.phase !== 'prompt') return true;
    if (!this.step.actions.includes(action)) return false;
    this.praise();
    this.finishStep(distance + 22);
    return true;
  }

  show(step, waiting) {
    const text = TUTORIAL_TEXT[step.id][TOUCH ? 'touch' : 'key'];
    const gesture = TUTORIAL_TEXT[step.id].gesture;
    let visual = '';
    if (waiting && TOUCH && gesture) visual = `<div class="gesture ${gesture}"><i></i></div>`;
    else if (waiting && KEYS[step.id]) visual = `<div class="keys">${KEYS[step.id].map((k) => `<kbd>${k}</kbd>`).join('')}</div>`;
    else if (ICONS[step.id]) visual = `<img class="coach-icon" src="${ICONS[step.id]}" alt="" onerror="this.remove()">`;
    this.el.className = waiting ? 'waiting' : 'tip';
    this.el.innerHTML = `${visual}<p>${text}</p>`;
    clearTimeout(this.hideTimer);
    if (!waiting) this.hideTimer = setTimeout(() => this.hide(), 3200);
  }

  praise() {
    this.sound.play('power');
    this.el.className = 'praise';
    this.el.innerHTML = `<p>${['Shabash!', 'Nice!', 'Perfect!'][Math.floor(Math.random() * 3)]}</p>`;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), 900);
  }

  hide() {
    this.el.className = 'hidden';
  }
}
