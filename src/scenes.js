import { SHOTS } from './cinematic.js';
import { PROLOGUE_CAPTION, ENDING } from './story.js';

// The 2.5D cutscene shots that story lines refer to by name (story.js `shot`).
// bg: picture in public/art/story/, cast: cut-outs placed on it, move: camera
// move (stage.js), dust: floating particles, caption: shown the first time.
export const STAGE_SHOTS = {
  dispatch: { bg: 'bg-dispatch', cast: [{ img: 'cut-mishra', side: 'right' }], move: 'truck-left', caption: 'DesiDash Interplanetary · Dispatch' },
  'dispatch-close': { bg: 'bg-dispatch', cast: [{ img: 'cut-mishra', side: 'centre' }], move: 'push-fast' },
  dock: { bg: 'bg-dock', cast: [{ img: 'cut-riya-talk', side: 'left' }], move: 'truck-right', caption: 'Chandra-7 · Cargo dock' },
  'dock-shock': { bg: 'bg-dock', cast: [{ img: 'cut-riya-shock', side: 'left' }], move: 'push-fast' },
  parcel: { bg: 'plate-parcel', move: 'push', dust: 'sparkle' },
  'tunnel-grin': { bg: 'bg-tunnel', cast: [{ img: 'cut-riya-grin', side: 'left' }], move: 'rise' },
  'tunnel-shock': { bg: 'bg-tunnel', cast: [{ img: 'cut-riya-shock', side: 'left' }], move: 'push-fast' },
  security: { bg: 'bg-tunnel', cast: [{ img: 'cut-drone', side: 'right' }], move: 'push', flicker: true },
  breach: { bg: 'plate-breach', move: 'push', dust: 'bubbles' },
  deep: { bg: 'plate-deep', move: 'truck-left', dust: 'bubbles' },
  'deep-close': { bg: 'plate-deep', move: 'push-fast', dust: 'bubbles' },
  nani: { bg: 'bg-kitchen', cast: [{ img: 'cut-nani', side: 'right' }], move: 'truck-left', dust: 'steam', caption: 'Coral Colony, Neela · Nani ka ghar' },
  doorstep: { bg: 'plate-doorstep', move: 'push', dust: 'bubbles', caption: 'Coral Colony · Delivery point' },
  egg: { bg: 'plate-egg', move: 'push-fast', dust: 'sparkle' },
  hatch: { bg: 'plate-hatch', move: 'rise', dust: 'sparkle' },
  mother: { bg: 'plate-mother', move: 'truck-right', dust: 'bubbles' },
  dinner: { bg: 'plate-dinner', move: 'drift', dust: 'steam' },
  'kitchen-wave': { bg: 'bg-kitchen', cast: [{ img: 'cut-riya-wave', side: 'centre' }], move: 'push', dust: 'steam' },
};

// Every picture a list of lines needs, so it can be loaded before the cutscene.
export function picturesFor(lines) {
  const names = new Set();
  for (const line of lines) {
    const shot = STAGE_SHOTS[line.shot];
    if (!shot) continue;
    names.add(shot.bg);
    for (const member of shot.cast ?? []) names.add(member.img);
  }
  return [...names];
}

// One beat per line, with the caption shown the first time a place appears.
function lineBeats(lines) {
  const captioned = new Set();
  return lines.map((line) => {
    const stage = STAGE_SHOTS[line.shot];
    const caption = stage?.caption && !captioned.has(line.shot) ? stage.caption : undefined;
    captioned.add(line.shot);
    return { stage, line, caption };
  });
}

// The last beat of every intro: crane down from high behind Riya into the
// gameplay camera, with the delivery's title card.
const intoTheRun = (level) => ({
  shot: SHOTS.dolly({ from: [0, 7, 16], to: [0, 3.7, 7], lookFrom: [0, 0.5, -12], lookTo: [0, 0.6, -3] }),
  duration: 2.8,
  hold: 0,
  pose: { ride: true },
  title: { kicker: `Delivery ${level.id}`, title: level.title, place: level.place },
});

export function introBeats(level) {
  const beats = [];
  if (level.id === 1) {
    // Outside, alongside the station tube, then rushing down the tunnel to find Riya from behind.
    beats.push({
      shot: SHOTS.dolly({ from: [17, 8, -8], to: [12, 4, -22], lookFrom: [0, -2, -60], lookTo: [0, -1, -48] }),
      duration: 4.5, outside: true, caption: PROLOGUE_CAPTION,
    });
    beats.push({
      shot: SHOTS.dolly({ from: [0, 3.4, 60], to: [0, 3, 7.5], lookFrom: [0, 1, -20], lookTo: [0, 1.4, -6] }),
      duration: 3, caption: PROLOGUE_CAPTION,
    });
  }
  return [...beats, ...lineBeats(level.intro), intoTheRun(level)];
}

export function outroBeats(level) {
  return lineBeats(level.outro);
}

export function endingBeats() {
  return lineBeats(ENDING);
}
