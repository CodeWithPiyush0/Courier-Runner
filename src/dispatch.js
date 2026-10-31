// Mission control's lines (Indian English). Shown as text for now; these become
// the Gemini voice-over script later. Lines keyed by zone are picked by where
// the courier is.

export const START_LINES = [
  "Security drone is on your tail! Go, go, go!",
  "Station security wants your delivery permit. Just... drive faster.",
  "New order picked up. Security is not happy about it. Chalo, move!",
];

export const RUN_LINES = {
  space: [
    "Courier, customer is asking 'where is my order?' Third time already.",
    "Lasers ahead. Please don't get sliced, the paperwork is too much.",
    "Good speed, keep it up! Fuel is not free, okay?",
    "Reminder: package is marked FRAGILE. Handle with care, ya.",
    "Your delivery rating is 4.2. It was 4.8 before you started.",
    "Station security says those lasers are only mostly lethal. Relax.",
    "Customer has added a note: 'Please don't ring the bell, baby is sleeping.'",
    "Arre, why are you on the ceiling? Never mind, it's working. Continue.",
  ],
  water: [
    "Customer is asking why tracking shows 'under the sea'. What do I tell them?",
    "Don't touch the jellyfish. Company insurance does not cover jellyfish.",
    "That fish has no delivery address. Please don't give it ours.",
    "Package is waterproof. I think. Mostly. Keep it dry anyway.",
    "Breathe, courier. Literally. Collect those bubbles.",
  ],
};

export const ENTER_WATER_LINES = [
  "Arre! Hull breach! You're in the ocean now. Grab bubbles for air!",
  "Station has a small leak. And by small I mean the whole ocean. Swim!",
  "You fell into the sea?! Okay, okay, new route. Watch your oxygen!",
];

export const ENTER_SPACE_LINES = [
  "Geyser launch! Welcome back to space. Shake off the water, ya.",
  "Back in the station! Please don't drip on the floor.",
  "Whoosh! Back up. Customer is asking why the package smells of fish.",
];

export const LOW_OXYGEN_LINES = [
  "Oxygen low! Bubbles, courier, bubbles!",
  "Your air is almost finished. Please breathe responsibly.",
];

export const HIT_LINES = {
  space: [
    "Ouch! Security is right behind you, don't get zapped again!",
    "Zapped! That drone is very close now, courier.",
    "Arre, careful! Security is asking for your ID.",
    "That laser left a mark. Keep moving, drone is coming!",
  ],
  water: [
    "Stung! And the big fish is right behind you!",
    "Ouch! That fish smelled the package. Swim faster!",
    "Careful! One more sting and you're fish food.",
  ],
};

export const CRASH_LINES = {
  space: [
    "Package status: 'slightly flattened'. Customer gave one star, yaar.",
    "Arre! That was a wall. Walls don't move, courier.",
    "Dispatch here. Insurance claim filed. Again.",
    "No problem. We'll tell the customer it's 'out for delivery'.",
    "That's okay, beta. Even the best couriers crash. Mostly not this much.",
    "Hello? Courier? ... Okay, sending the next courier.",
  ],
  water: [
    "That was coral, courier. Coral has been there for a thousand years. It wins.",
    "Package is now part of the reef. Very eco-friendly. Customer is not happy.",
    "Hello? Courier? ... I'm hearing only bubbles.",
  ],
};

export const CAUGHT_LINES = {
  space: [
    "Security caught you. They are asking for your parking ticket.",
    "Drone says you were doing 46 in a 40 zone. Challan is coming.",
    "Caught! Package is now in 'lost and found'. Very sad.",
  ],
  water: [
    "The fish ate you. And the package. Customer is asking for a refund.",
    "Gulp. That's the sound of your delivery rating.",
    "Fish one, courier zero. We'll send a submarine next time.",
  ],
};

export const DROWNED_LINES = [
  "Courier ran out of air. Customer says no problem, package is waterproof.",
  "Oxygen finished! Next time please breathe a bit more, okay?",
  "You forgot to breathe? That's the one thing, courier!",
];

export const POWER_LINES = {
  magnet: ["Magnet on! Collect everything, we will sort it later.", "Coin magnet active. Free money, enjoy."],
  shield: ["Shield up! Now you can be careless for a bit.", "Shield active. Company property, please return it."],
  boost: ["Boost! Hold on to the package!", "Turbo mode! Customer will be so happy."],
};

export const SHIELD_BREAK_LINES = [
  "Shield gone! That one's coming out of your salary.",
  "Shield broke. Okay, back to being careful.",
];

export function pick(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}
