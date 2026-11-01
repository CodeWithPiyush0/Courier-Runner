// Radio chatter during a run (Indian English, with Bihar flavour). Shown as
// text and voiced by tools/gen_voice.py. Lines keyed by zone are picked by
// where Bholu is. Dispatch (Mishra ji) says these unless noted.

export const START_LINES = [
  "Mamu is right behind you! Go, go, go!",
  "New order, Bholu. Traffic police on your tail. Chalo, move!",
  "Full speed, Bholu. And try not to jump every signal, haan?",
];

export const RUN_LINES = {
  road: [
    "Customer is asking 'where is my order?' Third time already.",
    "Careful near the cows, Bholu. They have right of way. Always.",
    "Your delivery rating is 4.2. It was 4.8 before you started.",
    "Reminder: parcel is marked FRAGILE. Handle with care, ya.",
    "Auto-wala is honking at you. Honk back, it's polite here.",
    "Traffic is so bad, even the pigeons are walking.",
    "A cow is reading the traffic signal. Even she follows rules more than you.",
    "Fun fact: in Patna, the horn is also the brake.",
    "Customer review just came in: 'Delivery boy faster than my internet.'",
    "Mishra ji here. My chai is getting cold just watching you drive.",
    "That auto-wala just asked if you want to race. Please say no.",
  ],
  tunnel: [
    "Shortcut, very good. Smell, very bad. Keep going!",
    "Don't touch the walls. Patna Nagar Nigam has not cleaned them since 1998.",
    "Torch on, Bholu. Even the rats here need directions.",
    "Great echo in there. Sing something, the customer likes music.",
    "If you see a rat wearing a helmet, that is Mamu's cousin. Keep going.",
    "Torch on, phone on, brain on. Two out of three is fine.",
  ],
};

export const ENTER_TUNNEL_LINES = [
  "Road is jammed. Take the nala shortcut, quick!",
  "Into the underpass! Keep your torch on.",
  "Shortcut time! Only rats and pipes in there. Mostly rats.",
];

export const ENTER_ROAD_LINES = [
  "Back on the road. Fresh air! Well, Patna air.",
  "Out of the nala! Mamu is still somewhere behind you.",
  "Daylight! Now dodge the autos, na.",
];

// Bholu, when the torch is running out.
export const LOW_BATTERY_LINES = [
  "Battery low! Grab the cells, grab the cells!",
  "Phone is dying! Someone give me a charger!",
];

// Mamu, when Bholu clips something and he closes in.
export const HIT_LINES = [
  "Ae, scooter wale! Ruko! Ruko!",
  "One more rule broken and I'll catch you!",
  "Helmet is fine, driving is not! Stop!",
  "Signal is red, hero! Red!",
  "Overtaking from the left? Even my bike is shocked!",
  "I have a challan book thicker than your parcel!",
];

export const CRASH_LINES = {
  road: [
    "Arre! That was a cow. Cows don't move, Bholu.",
    "Parcel status: slightly flattened. Customer gave one star, yaar.",
    "No problem. We'll tell the customer it's 'out for delivery'.",
    "Hello? Bholu? ... Okay, sending the next courier.",
    "Don't worry, the cow is fine. The cow is always fine.",
  ],
  tunnel: [
    "That was a pipe, Bholu. Pipes have been there longer than you.",
    "Dispatch here. Insurance claim filed. Again.",
    "Hello? Bholu? I'm hearing only echo.",
  ],
};

// When Mamu catches him.
export const CAUGHT_LINES = [
  "Mamu caught you. He is writing a challan. A very long challan.",
  "Caught! Mamu says, 'license, RC, pollution certificate, sab dikhao.'",
  "Signal jumping, five hundred rupees. Speeding, one thousand. Running from police? Priceless.",
];

// When the torch dies in a tunnel.
export const DARK_LINES = [
  "Torch died. Bholu rode into the dark. And then into a wall.",
  "Battery finished! Next time charge your phone, beta.",
  "Pitch dark in there. Even the rats called for help.",
];

export const POWER_LINES = {
  magnet: ["UPI magnet on! Tips are flying in.", "Scan and earn! Collect everything, we will count later."],
  shield: ["Helmet on! Now you can be careless for a bit.", "Extra helmet! Safety first, then speed."],
  boost: ["Cutting chai! Full power!", "One chai, and he's off! Customer will be so happy."],
};

// The UPI soundbox, when Bholu grabs the UPI magnet (after its "ting-ting").
export const SOUNDBOX_LINES = [
  "UPI par sau rupaye prapt hue!",
  "UPI par tip prapt hui!",
];

// When the tips come in a long streak.
export const STREAK_LINES = [
  "Wah! Tips are raining like monsoon!",
  "So many tips! Mishra ji is already counting his commission.",
  "Bholu, at this rate you will buy your own auto!",
];

export const SHIELD_BREAK_LINES = [
  "Helmet cracked! That one's coming out of your salary.",
  "Helmet gone. Okay, back to being careful.",
];

export function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}
