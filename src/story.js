// The story: who's who, the five deliveries, and every cutscene line.
// Lines here are voiced by tools/gen_voice.py (each speaker has their own voice),
// so after editing a line, run `npm run voice` to record the new version.
// `shot` names the cutscene picture for the line (see scenes.js).
//
// Bholu grew up in Muzaffarpur and rides a scooter for a delivery app in Patna.
// Today's parcel is Nani's old radio, fixed in Patna in time for her birthday,
// and it has to reach Nani's house in the litchi orchards of Muzaffarpur by
// evening. A traffic cop ("Mamu", as everyone in Bihar calls the police) chases
// him the whole 75 km for breaking rules. At Nani's door the cop takes off his
// helmet: he really is Bholu's Mamu, Nani's son, coming home for the birthday too.

export const CHARACTERS = {
  bholu: { name: 'Bholu', portrait: '/art/portrait-bholu.webp' },
  dispatch: { name: 'Mishra ji · Dispatch', portrait: '/art/dispatch.webp' },
  nani: { name: 'Nani', portrait: '/art/portrait-nani.webp' },
  mamu: { name: 'Traffic Mamu', portrait: '/art/portrait-mamu.webp' },
  // Customers Bholu delivers to on the way (one at the end of each delivery).
  pappu: { name: 'Pappu · Customer', portrait: '/art/portrait-pappu.webp' },
  aunty: { name: 'Gupta Aunty · Customer', portrait: '/art/portrait-aunty.webp' },
  ramesh: { name: 'Ramesh bhai · Customer', portrait: '/art/portrait-ramesh.webp' },
  munni: { name: 'Munni didi · Customer', portrait: '/art/portrait-munni.webp' },
};

// Each delivery is a level. `zones` is the route: a list of [zone, metres], and
// the delivery is complete at the end of it. Roads have 3 lanes; tunnels are the
// nala / underpass shortcuts where he can ride the walls. `difficulty` ramps
// from the first to the second value over the route.
export const LEVELS = [
  {
    id: 1,
    title: 'First Shift',
    place: 'Patna old city',
    zones: [['road', 450], ['tunnel', 250], ['road', 150]],
    difficulty: [0, 0.15],
    chaser: false,
    powers: false,
    tutorial: 'basics',
    intro: [
      { who: 'dispatch', shot: 'nap', text: "Bholu! Bholu! Are you awake? An urgent parcel just came in." },
      { who: 'bholu', shot: 'shop', text: "Ka ho, Mishra ji! Always awake. What's the parcel?" },
      { who: 'dispatch', shot: 'dispatch-close', text: "Pickup from Laxmi Radio Repair, Patna. Drop at... 'Nani, Litchi Bagan, Muzaffarpur'." },
      { who: 'bholu', shot: 'parcel', text: "Arre, that's my Nani! Wait... why is this box humming?" },
      { who: 'dispatch', shot: 'dispatch', text: "It's her old radio, fixed and switched on. Today is her birthday. Deliver it by evening. Chalo!" },
    ],
    outro: [
      { who: 'pappu', shot: 'pappu', text: "Bholu bhaiya! My GK book, just in time. Exam is tomorrow!" },
      { who: 'bholu', shot: 'pappu', text: "All the best, Pappu! Question one: who is Patna's fastest delivery boy?" },
      { who: 'bholu', shot: 'street-scooter', text: "Old city done! Patna traffic is no match for me." },
      { who: 'dispatch', shot: 'dispatch-close', text: "Don't celebrate yet. A traffic police Mamu saw you jump that signal." },
    ],
  },
  {
    id: 2,
    title: 'Mamu Alert',
    place: 'Dak Bungalow chauraha',
    zones: [['road', 400], ['tunnel', 300], ['road', 250]],
    difficulty: [0.15, 0.35],
    chaser: true,
    powers: true,
    tutorial: 'chase',
    intro: [
      { who: 'mamu', shot: 'mamu', text: "Ae, scooter wale! Signal tod ke kahan ja rahe ho? Ruko!" },
      { who: 'bholu', shot: 'street-shock', text: "Sorry, Mamu! Birthday delivery hai! Challan baad mein!" },
      { who: 'bholu', shot: 'street-shock', text: "Wait... why does that voice sound so familiar?" },
      { who: 'dispatch', shot: 'dispatch-close', text: "Bholu, if that Mamu catches you, no birthday, only challan. Bhago!" },
    ],
    outro: [
      { who: 'aunty', shot: 'aunty', text: "Arre Bholu, my new pressure cooker! Sit, have one litti before you go." },
      { who: 'bholu', shot: 'aunty', text: "Next time, aunty! A traffic police Mamu is chasing me today." },
      { who: 'dispatch', shot: 'dispatch', text: "You lost him! But Gandhi Setu is jammed for ten kilometres." },
      { who: 'bholu', shot: 'setu-scooter', text: "Ten kilometres? Then I'm taking the tunnel under the bridge!" },
    ],
  },
  {
    id: 3,
    title: 'Setu Jam',
    place: 'Mahatma Gandhi Setu, over the Ganga',
    zones: [['road', 300], ['tunnel', 500], ['road', 250]],
    difficulty: [0.3, 0.45],
    chaser: true,
    powers: true,
    tutorial: 'tunnel',
    intro: [
      { who: 'dispatch', shot: 'setu', text: "Gandhi Setu. Five kilometres over the Ganga, and fifty thousand trucks." },
      { who: 'bholu', shot: 'setu-scooter', text: "There's a service tunnel under the bridge. Dark, but empty." },
      { who: 'dispatch', shot: 'dispatch', text: "Keep your phone torch on. And don't drop Nani's radio in the Ganga!" },
    ],
    outro: [
      { who: 'ramesh', shot: 'ramesh', text: "My charger! Three hours in this jam, bhai, and my phone was dead." },
      { who: 'bholu', shot: 'ramesh', text: "Charge it full, Ramesh bhai. This jam is not going anywhere." },
      { who: 'bholu', shot: 'haat', text: "Hajipur! I can smell the bananas already." },
      { who: 'mamu', shot: 'mamu-haat', text: "I can still see you, scooter wale! Hajipur mein bhi pakad lenge!" },
    ],
  },
  {
    id: 4,
    title: 'Hajipur Haat',
    place: 'Hajipur banana market',
    zones: [['road', 500], ['tunnel', 400], ['road', 400]],
    difficulty: [0.45, 0.65],
    chaser: true,
    powers: true,
    intro: [
      { who: 'bholu', shot: 'haat', text: "Hajipur banana market. Every cart in Bihar is here today." },
      { who: 'dispatch', shot: 'dispatch', text: "Customer called. Nani says the radio must reach before the evening songs." },
      { who: 'bholu', shot: 'parcel', text: "Mishra ji, the parcel is singing now! It's playing old film songs!" },
    ],
    outro: [
      { who: 'munni', shot: 'munni', text: "My new weighing scale! Now nobody can cheat me. Take a banana, Bholu." },
      { who: 'bholu', shot: 'munni', text: "Thank you, didi! Fuel for the last stretch to Nani's." },
      { who: 'dispatch', shot: 'dispatch-close', text: "Muzaffarpur is close. Nani has called nine times. Nine!" },
    ],
  },
  {
    id: 5,
    title: 'Litchi Bagan',
    place: 'Muzaffarpur',
    zones: [['road', 500], ['tunnel', 400], ['road', 600]],
    difficulty: [0.6, 0.9],
    chaser: true,
    powers: true,
    finale: true,
    intro: [
      { who: 'nani', shot: 'nani', text: "Bholu beta! The whole family is coming for my birthday. Where is my radio?" },
      { who: 'bholu', shot: 'orchard-scooter', text: "Almost there, Nani! Just one small problem. A traffic police Mamu." },
    ],
    outro: [],
  },
];

// The finale at Nani's house in Muzaffarpur.
export const ENDING = [
  { who: 'nani', shot: 'doorstep', text: "My radio! And my Bholu! Both arrived together!" },
  { who: 'mamu', shot: 'reveal', text: "Got you finally, scooter wale! Signal jumping, five hundred rupees." },
  { who: 'bholu', shot: 'yard-shock', text: "Mamu?! You chased me all the way from Patna?" },
  { who: 'mamu', shot: 'mamu-laugh', text: "Of course! I was coming home for Amma's birthday too. You just wouldn't stop!" },
  { who: 'nani', shot: 'radio-party', text: "Arre, both of you, sit! The radio is playing our old song." },
  { who: 'mamu', shot: 'litchi', text: "Here. Challan cancelled. Have some Shahi litchi instead." },
  { who: 'dispatch', shot: 'dispatch-close', text: "Delivery confirmed. Five stars! And Bholu, tell your Mamu we need escorts like him." },
  { who: 'bholu', shot: 'yard-wave', text: "Happy birthday, Nani! And Mamu, next time I follow the rules. Promise!" },
];

// Shown over the opening shots.
export const PROLOGUE_CAPTION = 'Patna · Ashok Rajpath · 4:30 PM';

// In-game tutorial prompts. `gesture` is the touch animation shown.
export const TUTORIAL_TEXT = {
  lane: { touch: 'Swipe LEFT or RIGHT to change lane', key: 'Press ← or → to change lane', gesture: 'swipe-x' },
  jump: { touch: 'Swipe UP to hop the pothole', key: 'Press ↑ to hop the pothole', gesture: 'swipe-up' },
  slide: { touch: 'Swipe DOWN to duck under', key: 'Press ↓ to duck under', gesture: 'swipe-down' },
  flip: { touch: 'Blocked! DOUBLE-TAP to flip to the ceiling', key: 'Blocked! Press SPACE to flip to the ceiling', gesture: 'double-tap' },
  coins: { touch: 'Grab the ₹ coins: they are your tips!', key: 'Grab the ₹ coins: they are your tips!' },
  tunnel: { touch: 'Shortcut! In tunnels you can ride the walls', key: 'Shortcut! In tunnels you can ride the walls' },
  goal: { touch: 'Reach the delivery point to finish!', key: 'Reach the delivery point to finish!' },
  chase: { touch: 'Hit something and Mamu closes in. Twice quickly and he catches you!', key: 'Hit something and Mamu closes in. Twice quickly and he catches you!' },
  powers: { touch: 'Power-up ahead: UPI magnet, helmet or cutting chai!', key: 'Power-up ahead: UPI magnet, helmet or cutting chai!' },
  battery: { touch: 'Dark in here! Grab batteries to keep your torch on', key: 'Dark in here! Grab batteries to keep your torch on', gesture: 'battery' },
};
