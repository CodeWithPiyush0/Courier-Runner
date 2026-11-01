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
  ],
  tunnel: [
    "Shortcut, very good. Smell, very bad. Keep going!",
    "Don't touch the walls. Patna Nagar Nigam has not cleaned them since 1998.",
    "Torch on, Bholu. Even the rats here need directions.",
    "Great echo in there. Sing something, the customer likes music.",
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
];

export const CRASH_LINES = {
  road: [
    "Arre! That was a cow. Cows don't move, Bholu.",
    "Parcel status: slightly flattened. Customer gave one star, yaar.",
    "No problem. We'll tell the customer it's 'out for delivery'.",
    "Hello? Bholu? ... Okay, sending the next courier.",
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

export const SHIELD_BREAK_LINES = [
  "Helmet cracked! That one's coming out of your salary.",
  "Helmet gone. Okay, back to being careful.",
];

export function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}
