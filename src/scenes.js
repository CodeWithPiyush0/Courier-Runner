import { SHOTS } from './cinematic.js';
import { PROLOGUE_CAPTION } from './story.js';

const TURN = Math.PI * 2;

// Camera moves that line up with dialogue, cycled through a delivery's lines.
const LINE_SHOTS = [
  SHOTS.orbit({ radius: 3, height: 1.4, from: 0.3, to: 0.3 + TURN, look: 1.3 }), // full 360 round Riya
  SHOTS.dolly({ from: [1.3, 0.45, -2.7], to: [0.7, 0.55, -2.2], lookFrom: [0, 1.65, 0] }), // low hero angle
  SHOTS.orbit({ radius: 2.1, height: 1.75, from: -0.9, to: 0.9, look: 1.65 }), // sweep across her face
  SHOTS.orbit({ radius: 3.4, height: 2.4, from: Math.PI * 0.8, to: Math.PI * 2.8, look: 1 }), // high 360
];
const PARCEL_CLOSE_UP = SHOTS.dolly({ from: [1, 1.7, 1.8], to: [0.5, 1.5, 1.15], lookFrom: [0, 1.15, 0.4] });
const ON_THE_DRONE = SHOTS.dolly({ from: [-1.6, 1.9, -1.6], to: [-1.1, 1.7, -0.9], lookFrom: [0.6, 1.4, 2.6] });

// The last beat of every intro: swoop round behind Riya into the gameplay camera.
const INTO_THE_RUN = {
  shot: SHOTS.dolly({ from: [2.4, 1.6, -3.2], to: [0, 3.7, 7], lookFrom: [0, 1.3, 0], lookTo: [0, 0.6, -3] }),
  duration: 1.7,
  hold: 0,
  pose: { speed: 0.3 },
};

function shotFor(line, i) {
  if (line.who === 'security') return ON_THE_DRONE;
  if (/humming|glow/i.test(line.text)) return PARCEL_CLOSE_UP;
  return LINE_SHOTS[i % LINE_SHOTS.length];
}

// Intro cutscene for a delivery. The first delivery opens with exterior shots
// of the station.
export function introBeats(level) {
  const beats = [];
  if (level.id === 1) {
    beats.push(
      // Outside, alongside the station tube (its near end stays behind the camera).
      { shot: SHOTS.dolly({ from: [17, 8, -8], to: [12, 4, -22], lookFrom: [0, -2, -60], lookTo: [0, -1, -48] }), duration: 4.2, outside: true, caption: PROLOGUE_CAPTION },
      { shot: SHOTS.dolly({ from: [0, 3.2, -14], to: [0, 2, -5], lookFrom: [0, 1.2, 0] }), duration: 2.6, caption: PROLOGUE_CAPTION },
    );
  }
  level.intro.forEach((line, i) => beats.push({ shot: shotFor(line, i), line }));
  beats.push(INTO_THE_RUN);
  return beats;
}

// Short scene after a delivery: Riya waves while they talk.
export function outroBeats(level) {
  return level.outro.map((line, i) => ({
    shot: LINE_SHOTS[(i + 2) % LINE_SHOTS.length],
    line,
    pose: line.who === 'riya' ? { wave: true } : { idle: true },
  }));
}
