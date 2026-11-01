import { CAMERA_HEIGHT, CAMERA_BACK, CAMERA_PITCH } from './config.js';
import { SHOTS } from './cinematic.js';
import { PROLOGUE_CAPTION, ENDING } from './story.js';

// The 2.5D cutscene shots that story lines refer to by name (story.js `shot`).
// bg: picture in public/art/story/, cast: cut-outs placed on it, move: camera
// move (stage.js), caption: shown the first time.
// Pictures that haven't been painted yet just leave the backdrop plain.
export const STAGE_SHOTS = {
  // The customer at the end of each delivery.
  pappu: { bg: 'bg-patna-street', cast: [{ img: 'cut-bholu-grin', side: 'left' }, { img: 'cut-pappu', side: 'right' }], move: 'push', caption: 'Delivered · Pappu, coaching centre' },
  aunty: { bg: 'bg-apartment', cast: [{ img: 'cut-bholu-talk', side: 'left' }, { img: 'cut-aunty', side: 'right' }], move: 'truck-left', caption: 'Delivered · Gupta Aunty, Dak Bungalow' },
  ramesh: { bg: 'plate-setu', cast: [{ img: 'cut-bholu-grin', side: 'left' }, { img: 'cut-ramesh', side: 'right' }], move: 'push', caption: 'Delivered · Ramesh bhai, stuck on the Setu' },
  munni: { bg: 'plate-haat', cast: [{ img: 'cut-bholu-wave', side: 'left' }, { img: 'cut-munni', side: 'right' }], move: 'truck-right', caption: 'Delivered · Munni didi, Hajipur haat' },
  dispatch: { bg: 'bg-office', cast: [{ img: 'cut-mishra', side: 'right' }], move: 'truck-left', caption: 'DesiDash Couriers · Patna office' },
  'dispatch-close': { bg: 'bg-office', cast: [{ img: 'cut-mishra', side: 'centre' }], move: 'push-fast' },
  nap: { bg: 'plate-bholu-nap', move: 'push', caption: 'Laxmi Radio Repair · Ashok Rajpath' }, // Mishra ji calls; Bholu dozes
  shop: { bg: 'bg-radio-shop', cast: [{ img: 'cut-bholu-phone', side: 'left' }], move: 'push-fast' }, // jolted awake
  parcel: { bg: 'plate-radio', move: 'push' },
  'street-scooter': { bg: 'bg-patna-street', cast: [{ img: 'cut-bholu-scooter', side: 'left' }], move: 'rise' },
  'setu-scooter': { bg: 'plate-setu', cast: [{ img: 'cut-bholu-scooter', side: 'left' }], move: 'rise' },
  'orchard-scooter': { bg: 'bg-orchard', cast: [{ img: 'cut-bholu-scooter', side: 'left' }], move: 'rise', caption: 'Muzaffarpur · the litchi orchards' },
  'street-shock': { bg: 'bg-patna-street', cast: [{ img: 'cut-bholu-shock', side: 'left' }], move: 'push-fast' },
  mamu: { bg: 'bg-patna-street', cast: [{ img: 'cut-mamu-bike', side: 'right' }], move: 'push', flicker: true },
  'mamu-haat': { bg: 'plate-haat', cast: [{ img: 'cut-mamu-bike', side: 'right' }], move: 'push', flicker: true },
  setu: { bg: 'plate-setu', move: 'truck-left', caption: 'Mahatma Gandhi Setu · over the Ganga' },
  haat: { bg: 'plate-haat', move: 'truck-right', caption: 'Hajipur · banana market' },
  nani: { bg: 'bg-courtyard', cast: [{ img: 'cut-nani', side: 'right' }], move: 'truck-left', caption: 'Muzaffarpur · Nani ka ghar' },
  // Nani reaches out towards Bholu, who holds the parcel out towards her.
  doorstep: { bg: 'bg-courtyard', cast: [{ img: 'cut-nani-welcome', side: 'left', bleed: true }, { img: 'cut-bholu-give', side: 'right', bleed: true }], move: 'push', caption: 'Nani ka ghar · Delivery point' },
  reveal: { bg: 'bg-courtyard', cast: [{ img: 'cut-bholu-shock', side: 'left' }, { img: 'cut-mamu', side: 'right' }], move: 'push-fast' },
  'yard-shock': { bg: 'bg-courtyard', cast: [{ img: 'cut-bholu-shock', side: 'left' }], move: 'push-fast' },
  'mamu-laugh': { bg: 'bg-courtyard', cast: [{ img: 'cut-mamu-laugh', side: 'right' }], move: 'truck-left' },
  'radio-party': { bg: 'bg-courtyard', cast: [{ img: 'cut-nani-radio', side: 'left' }, { img: 'cut-mamu-laugh', side: 'right' }], move: 'drift' },
  litchi: { bg: 'bg-orchard', cast: [{ img: 'cut-bholu-grin', side: 'left' }, { img: 'cut-mamu-litchi', side: 'right' }], move: 'push' },
  'yard-wave': { bg: 'bg-courtyard', cast: [{ img: 'cut-bholu-wave', side: 'centre' }], move: 'push' },
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

// The last beat of every intro: from low behind Bholu, rising into the
// gameplay camera, with the delivery's title card.
const intoTheRun = (level) => ({
  shot: SHOTS.dolly({
    from: [0, 2.4, 4.6], to: [0, CAMERA_HEIGHT, CAMERA_BACK],
    lookFrom: [0, 1.4, -3], lookTo: [0, CAMERA_HEIGHT + 10 * Math.tan(CAMERA_PITCH), CAMERA_BACK - 10],
  }),
  duration: 3,
  hold: 0,
  pose: { ride: true },
  title: { kicker: `Delivery ${level.id}`, title: level.title, place: level.place },
});

export function introBeats(level) {
  const beats = [];
  if (level.id === 1) {
    // A drone high over old Patna (city.js) flies down the street and comes
    // down behind Bholu: one continuous 3D shot, always looking ahead, so his
    // sprite is only ever seen from behind.
    beats.push({
      shot: SHOTS.path({
        points: [[0, 46, 80], [0, 33, 58], [0, 18, 38], [0, 7.5, 21], [0, 3.2, 9]],
        looks: [[0, 0, -120], [0, 1, -90], [0, 2, -60], [0, 2, -28], [0, 1.3, -3]],
      }),
      duration: 11, wide: true, caption: PROLOGUE_CAPTION, // slow, so the rooftops can be taken in
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
