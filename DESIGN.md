# Game Design — Patna Rush

A 2.5D endless runner in the browser (Three.js), set in real-world Bihar. Funny,
warm tone. Voice lines in Indian English with a Bihari flavour.

## Story — "Nani's Radio"
**Bholu**, a young man who grew up in Muzaffarpur, rides a scooter for a delivery
app in Patna. Mishra ji at Dispatch hands him an urgent parcel from Laxmi Radio
Repair: Nani's old radio, fixed in time for her birthday, to be delivered to
"Nani, Litchi Bagan, Muzaffarpur" by evening. Bholu jumps a signal on the way,
and a traffic cop ("Mamu", as everyone in Bihar calls the police) chases him
the whole 75 km. Twist: at Nani's door he takes off his helmet. He really is
Bholu's Mamu, Nani's son, coming home for the birthday too. He cancels the
challan and hands round Shahi litchi; Bholu promises to follow the rules.

**The cast is the developer's family**, drawn as stylised 3D animated
characters inspired by their photos (familiar but not portraits): Bholu (the
developer), Nani (his Dadi), Mamu, Mishra ji. The photos live in `private/`,
which is git-ignored and never deployed; `tools/gen_cast.py` makes a character
design per person, then every picture of them from that design.

**Look:** Bholu in a saffron helmet with stickers, a teal courier jacket and a
red-and-white gamchha, on a mint-green scooter with the parcel box behind. All story text lives in `src/story.js`.

**Customers on the way:** each of the first four deliveries ends with Bholu
dropping a small order off before the leg's closing lines: Pappu's GK book
(coaching centre), Gupta Aunty's pressure cooker (Dak Bungalow), Ramesh bhai's
phone charger (truck driver stuck on the Setu) and Munni didi's weighing scale
(Hajipur haat). Made-up characters, drawn in the cast's style by `gen_cast.py`.

## Deliveries (levels)
| # | Title | Route (metres) | New here |
|---|---|---|---|
| 1 | First Shift | road 450 → tunnel 250 → road 150 | guided tutorial (lanes, tips, jump, slide, tunnel, flip, torch); no chaser |
| 2 | Mamu Alert | road 400 → tunnel 300 → road 250 | Mamu chase, power-ups |
| 3 | Setu Jam | road 300 → tunnel 500 → road 250 | long tunnel, torch tip |
| 4 | Hajipur Haat | road 500 → tunnel 400 → road 400 | — |
| 5 | Litchi Bagan | road 500 → tunnel 400 → road 600 | finale at Nani's doorstep, the Mamu reveal |

Each ends at a marigold gateway (DELIVERY POINT / पहुँच गए!): DELIVERED stamp,
short outro, then up to 3 stars (delivered · ≥60 % of tips · no rules broken =
no hits). Finishing delivery 5 unlocks **Endless**. Progress is saved in the
browser, including a checkpoint every few seconds: after a refresh the title
offers **Resume** or **Restart this delivery**, and **Start over** (with a
confirmation) wipes everything.

## Zones
| | Road | Tunnel (nala / underpass shortcut) |
|---|---|---|
| Shape | flat, 3 lanes | octagonal tube, 8 lanes round the walls |
| Feel | full speed | 92 % speed, slightly floatier |
| Look | Patna street: shopfronts with Hindi/English signs, buildings, lamps, wires, warm dusty haze | concrete panels, stencils, pipes, ceiling lamps, dark |
| Obstacles | auto-rickshaws, cows, barricades (crash) · potholes, speed breakers (jump) · boom barriers, flex banners (slide) | debris (crash) · floor pipes (jump) · hanging cables (slide) |
| Special | — | gravity flip to the ceiling; **phone torch battery** |

Tunnel mouths are signposted portals (शॉर्टकट / NALA SHORTCUT →, and BACK ON
THE ROAD / सड़क →). At a mouth the world blends smoothly between road and tube,
and before an exit Bholu settles back to the floor.

**Torch battery:** the tunnel is lit only by Bholu's phone torch. It drains in
~22 s; each battery pickup adds 12 %. As it runs down the light and view
distance shrink, and below 30 % it beeps and Bholu complains. Empty = stuck in
the dark (run over). Back on the road it refills.

## Core loop
Auto-ride forward → dodge traffic, collect ₹ tips → duck into a shortcut when
the road jams → ride the tunnel walls → out again → speed rises → one crash
ends the run → score screen → retry.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Move one lane left / right | ← → / A D | swipe left / right |
| Jump | ↑ / W | swipe up |
| Slide | ↓ / S | swipe down |
| Gravity flip (tunnel only) | Space | double tap |

On the road, lanes stop at the kerbs and flips are off.

## Hits and Mamu
- Clipping a low or high obstacle is a **broken rule**: whistle, a slowdown,
  and Mamu (blue-red beacon) rides right up behind; he falls back after a few
  seconds.
- Break another rule while he is close ("MAMU CLOSE!") and he catches you.
  From delivery 2 the run starts with him close behind.

## Power-ups (first at 200 m, then every 300–500 m)
| | Effect |
|---|---|
| UPI (magnet) | 8 s — nearby tips in every lane fly to you |
| Helmet (shield) | 12 s — absorbs one hit |
| Chai (boost) | 4 s — much faster, smash through everything, Mamu drops back |

## Patterns
Road: scatter (never all 3 lanes blocked), crossings, traffic lines, jams (long
lead-in to find the gap). Tunnel: scatter, crossing rings, spirals, checker,
channels. Harder ones unlock with distance.

## Look: 2.5D
- **In play**, the street, tunnels, obstacles and pickups are 3D; Bholu and Mamu
  are painted Gemini sprites on camera-facing planes, with a sprite per pose
  (ride, lean left/right, jump, slide, hit, cheer), squash-and-stretch, a
  barrel-roll flip and a hit flash. (`rider.js`, `chaser.js`)
- **Cutscenes** are 2.5D: painted backgrounds, character cut-outs and
  particles at different depths in front of a moving camera, full illustrated
  plates for the big moments, captions and a painted title card. Delivery 1
  opens with 3D shots over Patna rooftops and a rush down the street.
  (`stage.js`, `scenes.js`, `cinematic.js`)
- **Sharpness:** painted art is generated at 2K and cutscenes always render at
  full screen resolution.
- **Voices** are fetched and decoded before a delivery starts, so they start
  instantly; cutscene lines wait for their voice to finish, and chatter never
  cuts off an important line.

## Opening and dialogue
Delivery 1 opens with a real 3D drone shot: high over old Patna (`city.js`,
blocks of houses wearing the painted shopfronts on every wall and painted
rooftops seen from above, with 3D water tanks and trees), the camera flies down
the street and comes down behind Bholu in one continuous move. 3D camera moves
always stay behind him (his sprites are painted from behind). Story pictures fill the screen (no particles). Lines show in a comic-book speech
bubble beside the speaker's face (never over a face), gliding smoothly with the
camera rather than jiggling with the character (or with a portrait at the top when they
aren't in the picture); letterbox bars appear only for 3D camera shots.

## Obstacles
Painted sprites in the cutscenes' animated style (`tools/gen_props.py`,
`public/art/props/`), seen as the chase camera sees them, sized to fill a
lane: crash into an auto, a side-on cow, a banana cart or a barricade; jump
bricks or cones; duck a banner or a boom barrier. In tunnels: a junk heap, a
rusty pipe, hanging cables. The camera sits high enough (4.8 m) that the lane
ahead shows over Bholu's helmet. The street's front buildings wear painted
shopfronts (`public/art/facades/`, `tools/gen_props.py`), each as tall as its picture.

## Dev mode
Open the game with `?dev=1` (always on under `npm run dev`) for a DEV panel:
invincible (on by default), game speed ×1/×2/×4, next zone, finish the
delivery, skip the cutscene, start any delivery, the ending, or Endless. It
never changes saved progress. `window.game` is available in the console too.

## Coins and horns
Coins are big glowing gold ₹ coins with a halo and a twinkle, bobbing as they
spin; picking one up sparkles, bumps the counter and plays a "cha-ching" that
climbs through a streak. On the road, autos, trucks and bikes honk now and
then off to one side; Bholu honks with H or the horn button.

## Tutorial
When a lesson obstacle is close, time nearly stops and a gesture (touch) or
key prompt waits for the right move; other moves are ignored. Later deliveries
show tips for Mamu, power-ups and the torch. (`tutorial.js`)

## UI style
Bihar truck art: saffron, rani pink, teal and cream on deep indigo; painted
borders, diamond bands, signboard buttons, Yatra One + Baloo 2.

## Assets
All Gemini generators read the key from `.env` (`GKEY`). While the Gemini project
is over its spend cap, local stand-ins fill in (no API needed):
`npm run voice-local` (Microsoft neural Indian voices via edge-tts, replaced by
the next `npm run voice`), `python tools/gen_music_local.py` (synthesized
dhol / tumbi / shehnai loops), `python tools/draw_icons.py` (sticker icons),
and **`art-requests/README.md`**, a short credit-aware image brief for Codex /
ChatGPT whose results `python tools/import_art.py art-requests/out` imports.
- **3D props** — built in code from Three.js primitives (`src/models.js`,
  `src/world.js`), with canvas-painted signs in Hindi and English.
- **Story art** — `npm run story-art` (`tools/gen_story_art.py`): scooter
  sprites, Mamu sprite and cut-outs, portraits, cutscene backgrounds and plates.
  Pieces that use another piece as a reference wait for it.
- **UI art** — `npm run art` (`tools/gen_images.py`): key art (wide + tall),
  icons (₹ coin, UPI, helmet, chai, battery), emblem, favicon.
- **Voices** — `npm run voice` (`tools/gen_voice.py`, saved as `public/vo/<character>/<first-words>.mp3`): Gemini TTS per character
  (Dispatch, Bholu, Nani, Mamu), each take transcribed and checked for words and
  accent. Rerun after editing lines to voice only the new ones.
- **Music** — `npm run music` (`tools/gen_music.py`): menu, road and tunnel
  tracks with dhol / dholak and Bhojpuri folk-pop flavour. Crossfades at tunnel
  mouths; ducks under voices.
- **Sound effects** — synthesized with Web Audio (`src/audio.js`): horn-ish
  whooshes, coins, whistle, tunnel in/out, battery charge and low beep,
  power-down, crash, UI clicks.

## Menus, settings, phones
Main menu, How to play, Settings (music / effects / voice volume, vibration,
graphics Auto / High / Low), Pause (also automatic when the tab is left), Game
over with a quip. Swipe / double-tap controls, notch-safe layout, vibration,
installable to the home screen, and auto graphics quality that drops resolution
if the frame rate stays under 40 fps.

## Build order
1. ✅ Tube runner prototype, chaser, patterns, power-ups, zones (space/ocean).
2. ✅ Story mode, tutorial, cinematics, truck-art UI, mobile tuning.
3. ✅ 2.5D sprites and cutscenes, voice fixes, checkpoints, mouth flaps.
4. ✅ Patna Rush: road + tunnel zones, Mamu, torch battery, new story and props.
5. ✅ Voices, music and icons for Patna Rush (local stand-ins).
6. ✅ Painted art via the Codex brief (`art-requests/README.md`): 3D animated-film style, all characters, cutscene backgrounds and menu art.
