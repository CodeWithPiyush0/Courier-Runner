// The story: who's who, the five deliveries, and every cutscene line.
// Lines here are voiced by tools/gen_voice.py (each speaker has their own voice),
// so after editing a line, run `npm run voice` to record the new version.

export const CHARACTERS = {
  riya: { name: 'Riya', portrait: '/art/portrait-riya.webp' },
  dispatch: { name: 'Mishra ji · Dispatch', portrait: '/art/dispatch.webp' },
  nani: { name: 'Nani', portrait: '/art/portrait-nani.webp' },
  security: { name: 'Chandra-7 Security', portrait: '/art/portrait-security.webp' },
};

// Each delivery is a level. `zones` is the route: a list of [zone, metres], and
// the delivery is complete at the end of it. `difficulty` ramps from the first
// to the second value over the route. Features switch the harder systems on.
export const LEVELS = [
  {
    id: 1,
    title: 'First Shift',
    place: 'Chandra-7 cargo ring',
    zones: [['space', 600]],
    difficulty: [0, 0.15],
    chaser: false,
    powers: false,
    tutorial: 'basics',
    intro: [
      { who: 'dispatch', text: "Riya! Riya Kumari! Are you awake? A big order just came in." },
      { who: 'riya', text: "Ka ho, Mishra ji! I'm always awake. Night shift, na? What's the parcel?" },
      { who: 'dispatch', text: "Pickup from Chandra-7. Drop at... 'Nani, Coral Colony, Ocean Planet Neela'." },
      { who: 'dispatch', text: "Strange box. It's humming." },
      { who: 'riya', text: "Humming? Parcels don't hum, Mishra ji." },
      { who: 'dispatch', text: "This one does. Five-star tip if it arrives today. Chalo, I'll guide you through the cargo ring." },
    ],
    outro: [
      { who: 'riya', text: "Cargo ring cleared! Easy-peasy." },
      { who: 'dispatch', text: "Don't celebrate yet. Station security is asking questions about your parcel." },
    ],
  },
  {
    id: 2,
    title: 'Security Alert',
    place: 'Chandra-7 inner tunnels',
    zones: [['space', 900]],
    difficulty: [0.15, 0.35],
    chaser: true,
    powers: true,
    tutorial: 'chase',
    intro: [
      { who: 'security', text: "Attention, courier. Your parcel is emitting unknown signals. Stop for inspection." },
      { who: 'riya', text: "Sorry, sir! Delivery deadline hai! Inspect it at the next station!" },
      { who: 'dispatch', text: "Riya, if that drone zaps you twice, it catches you. Keep moving!" },
    ],
    outro: [
      { who: 'dispatch', text: "You lost them! But the sensors say there's a hull breach ahead." },
      { who: 'riya', text: "A breach? As in... water?" },
    ],
  },
  {
    id: 3,
    title: 'Hull Breach',
    place: 'Neela sea dome',
    zones: [['space', 350], ['water', 650]],
    difficulty: [0.3, 0.45],
    chaser: true,
    powers: true,
    tutorial: 'water',
    intro: [
      { who: 'dispatch', text: "The cargo ring runs right into the Neela sea dome. Something big cracked it open." },
      { who: 'riya', text: "Arre baap re. My board is waterproof, right?" },
      { who: 'dispatch', text: "Mostly. Grab air bubbles, or you'll be swimming home." },
    ],
    outro: [
      { who: 'riya', text: "Mishra ji, something huge with a glowing light is following me!" },
      { who: 'dispatch', text: "That's a giant anglerfish. And it seems to want your parcel." },
    ],
  },
  {
    id: 4,
    title: 'The Deep',
    place: 'Neela trench',
    zones: [['water', 700], ['space', 400], ['water', 500]],
    difficulty: [0.45, 0.65],
    chaser: true,
    powers: true,
    intro: [
      { who: 'riya', text: "Why would a fish want a parcel?" },
      { who: 'dispatch', text: "Maybe it ordered something too. Just don't let it bite you!" },
      { who: 'riya', text: "The box is getting warmer. And it's glowing brighter." },
    ],
    outro: [
      { who: 'dispatch', text: "Coral Colony is just ahead. Nani has called every five minutes." },
    ],
  },
  {
    id: 5,
    title: "Nani's Doorstep",
    place: 'Coral Colony, Neela',
    zones: [['space', 500], ['water', 700], ['space', 400], ['water', 600]],
    difficulty: [0.6, 0.9],
    chaser: true,
    powers: true,
    finale: true,
    intro: [
      { who: 'nani', text: "Riya beta! Is my parcel coming? I have made litti-chokha for you." },
      { who: 'riya', text: "Coming, Nani! Just a small fish problem. A very big fish problem." },
    ],
    outro: [],
  },
];

// The finale at Nani's door. `event` cues something in the scene.
export const ENDING = [
  { who: 'nani', text: "Oh! My little night-light has arrived!", event: 'open' },
  { who: 'riya', text: "Nani... that's an egg. An anglerfish egg!", event: 'glow' },
  { who: 'nani', text: "I ordered a pet that glows. The shop said 'some assembly required'.", event: 'hatch' },
  { who: 'riya', text: "So the big fish wasn't chasing me. She was following her baby!", event: 'mother' },
  { who: 'nani', text: "Then she must stay for dinner too. Litti-chokha for everyone!" },
  { who: 'dispatch', text: "Delivery confirmed. Five stars! And Riya, the customer wants to adopt the mother too." },
  { who: 'riya', text: "Mishra ji, next time, please read the parcel label first!" },
];

// Shown over the opening exterior shot.
export const PROLOGUE_CAPTION = 'Chandra-7 Orbital Station · above Ocean Planet Neela · 2:47 AM';

// In-game tutorial prompts. `wait` is the action that completes the step.
export const TUTORIAL_TEXT = {
  lane: { touch: 'Swipe LEFT or RIGHT to dodge', key: 'Press ← or → to dodge', gesture: 'swipe-x' },
  jump: { touch: 'Swipe UP to jump the low laser', key: 'Press ↑ to jump the low laser', gesture: 'swipe-up' },
  slide: { touch: 'Swipe DOWN to slide under', key: 'Press ↓ to slide under', gesture: 'swipe-down' },
  flip: { touch: 'Blocked! DOUBLE-TAP to flip to the far wall', key: 'Blocked! Press SPACE to flip to the far wall', gesture: 'double-tap' },
  coins: { touch: 'Grab the green gems: they are your tips!', key: 'Grab the green gems: they are your tips!' },
  goal: { touch: 'Reach the cargo dock to deliver!', key: 'Reach the cargo dock to deliver!' },
  chase: { touch: 'Lasers zap you. Two quick zaps and security catches you!', key: 'Lasers zap you. Two quick zaps and security catches you!' },
  powers: { touch: 'Power-up ahead: magnet, shield or boost!', key: 'Power-up ahead: magnet, shield or boost!' },
  water: { touch: 'Underwater! Grab bubbles before your air runs out', key: 'Underwater! Grab bubbles before your air runs out', gesture: 'bubble' },
};
