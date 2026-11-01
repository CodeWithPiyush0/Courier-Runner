import { CAMERA_HEIGHT, CAMERA_BACK, CAMERA_PITCH } from './config.js';
import { SHOTS } from './cinematic.js';
import { PROLOGUE_CAPTION, ENDING } from './story.js';

// The 2.5D cutscene shots that story lines refer to by name (story.js `shot`).
// bg: picture in public/art/story/, cast: cut-outs placed on it, move: camera
// move (stage.js), dust: floating particles, caption: shown the first time.
// Pictures that haven't been painted yet just leave the backdrop plain.
export const STAGE_SHOTS = {
  dispatch: { bg: 'bg-office', cast: [{ img: 'cut-mishra', side: 'right' }], move: 'truck-left', caption: 'DesiDash Couriers · Patna office' },
  'dispatch-close': { bg: 'bg-office', cast: [{ img: 'cut-mishra', side: 'centre' }], move: 'push-fast' },
  shop: { bg: 'bg-radio-shop', cast: [{ img: 'cut-riya-talk', side: 'left' }], move: 'truck-right', caption: 'Laxmi Radio Repair · Ashok Rajpath' },
  parcel: { bg: 'plate-radio', move: 'push', dust: 'sparkle' },
  'street-grin': { bg: 'bg-patna-street', cast: [{ img: 'cut-riya-grin', side: 'left' }], move: 'rise' },
  'street-shock': { bg: 'bg-patna-street', cast: [{ img: 'cut-riya-shock', side: 'left' }], move: 'push-fast' },
  mamu: { bg: 'bg-patna-street', cast: [{ img: 'cut-mamu', side: 'right' }], move: 'push', flicker: true },
  setu: { bg: 'plate-setu', move: 'truck-left', caption: 'Mahatma Gandhi Setu · over the Ganga' },
  haat: { bg: 'plate-haat', move: 'truck-right', caption: 'Hajipur · banana market' },
  nani: { bg: 'bg-courtyard', cast: [{ img: 'cut-nani', side: 'right' }], move: 'truck-left', dust: 'dust', caption: 'Muzaffarpur · Nani ka ghar' },
  'orchard-grin': { bg: 'bg-orchard', cast: [{ img: 'cut-riya-grin', side: 'left' }], move: 'rise', caption: 'Muzaffarpur · the litchi orchards' },
  doorstep: { bg: 'bg-courtyard', cast: [{ img: 'cut-riya-grin', side: 'left' }, { img: 'cut-nani', side: 'right' }], move: 'push', caption: 'Nani ka ghar · Delivery point' },
  reveal: { bg: 'bg-courtyard', cast: [{ img: 'cut-riya-shock', side: 'left' }, { img: 'cut-mamu', side: 'right' }], move: 'push-fast' },
  'yard-shock': { bg: 'bg-courtyard', cast: [{ img: 'cut-riya-shock', side: 'left' }], move: 'push-fast' },
  'mamu-laugh': { bg: 'bg-courtyard', cast: [{ img: 'cut-mamu-laugh', side: 'right' }], move: 'truck-left' },
  'radio-party': { bg: 'bg-courtyard', cast: [{ img: 'cut-nani', side: 'left' }, { img: 'cut-mamu-laugh', side: 'right' }], move: 'drift', dust: 'dust' },
  litchi: { bg: 'bg-orchard', cast: [{ img: 'cut-riya-grin', side: 'left' }, { img: 'cut-mamu-laugh', side: 'right' }], move: 'push' },
  'yard-wave': { bg: 'bg-courtyard', cast: [{ img: 'cut-riya-wave', side: 'centre' }], move: 'push' },
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

// The last beat of every intro: a low hero shot beside the scooter's back
// wheel that rises and pulls back into the gameplay camera, with the
// delivery's title card.
const intoTheRun = (level) => ({
  shot: SHOTS.dolly({ from: [2.2, 0.6, 3.2], to: [0, CAMERA_HEIGHT, CAMERA_BACK], lookFrom: [0, 1.3, -1.5], lookTo: [0, CAMERA_HEIGHT + 10 * Math.tan(CAMERA_PITCH), CAMERA_BACK - 10] }),
  duration: 3.2,
  hold: 0,
  pose: { ride: true },
  title: { kicker: `Delivery ${level.id}`, title: level.title, place: level.place },
});

export function introBeats(level) {
  const beats = [];
  if (level.id === 1) {
    // Opening: a drone circles old Patna (city.js) once, then dives into
    // Ashok Rajpath and races low along the shopfronts to catch up with Riya.
    const center = [0, 0, -40];
    beats.push({
      shot: SHOTS.orbit({ center, radius: 125, height: 78, from: 0.2 * Math.PI, to: 2 * Math.PI }),
      duration: 7.5, wide: true, caption: PROLOGUE_CAPTION,
    });
    beats.push({
      shot: SHOTS.path({
        points: [[0, 78, 85], [0, 46, 92], [-1, 14, 72], [-3.2, 2.2, 46], [-1.5, 1.9, 8]],
        looks: [[0, 0, -40], [0, 0, -20], [0, 1, 10], [-1.2, 1.6, 18], [0, 1.5, -2]],
      }),
      duration: 5, wide: true, continuous: true, caption: PROLOGUE_CAPTION,
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
