# Game Design — working title TBD

A low-poly 3D endless runner in the browser (Three.js). Cool sci-fi tone with a
funny streak. Voice lines in Indian English.

## Story — "The Mystery Parcel"
**Riya Kumari**, 19, from Patna (Bihar), rides night shifts for an interplanetary
delivery app. Mishra ji at Dispatch sends her a humming parcel from orbital
station Chandra-7 to "Nani, Coral Colony, Ocean Planet Neela". Station security
thinks it's contraband; a giant anglerfish keeps following it. Twist: it's a
glowing anglerfish egg Nani ordered as a pet ("some assembly required"), and the
"monster" was its mother. Litti-chokha for everyone.

**Look:** saffron half-helmet with stickers and goggles, long braid with a
marigold band, teal courier jacket with saffron stripes, Madhubani-print
dupatta, indigo cargo pants, white sneakers; hoverboard painted like an Indian
truck ("HORN OK PLEASE"). The parcel ("FRAGILE · TO: NANI · NEELA") glows from
its seams. All story text lives in `src/story.js`.

## Deliveries (levels)
| # | Title | Route | New here |
|---|---|---|---|
| 1 | First Shift | space 600 m | guided tutorial (lanes, gems, jump, slide, flip) |
| 2 | Security Alert | space 900 m | security drone chase, power-ups |
| 3 | Hull Breach | space 350 → water 650 | ocean, oxygen, anglerfish |
| 4 | The Deep | water → space → water | — |
| 5 | Nani's Doorstep | 4 zones, 2200 m | finale cutscene at Nani's cottage |

Each ends at a marigold-garland drop-off: DELIVERED stamp, short outro, then
up to 3 stars (delivered · ≥60 % of gems · parcel undamaged = no hits).
Finishing delivery 5 unlocks **Endless**. Progress is saved in the browser.

## Cutscenes and tutorial
- Letterboxed cutscenes with voiced, portrait subtitles: exterior station
  shots, 360° orbits round Riya, parcel close-ups, a swoop into the gameplay
  camera. Tap / Space = next line, Skip / Esc = skip. (`cinematic.js`,
  `scenes.js`, finale in `ending.js`.)
- Tutorial: when a lesson obstacle is close, time nearly stops and a gesture
  (touch) or key prompt waits for the right move; other moves are ignored.
  Later deliveries show tips for the chaser, power-ups and air. (`tutorial.js`)

## UI style
Indian truck-art retro-futurism: saffron, rani pink, teal and cream on deep
indigo; layered painted borders, diamond bands, signboard buttons, Yatra One
(sign-painter display face) + Baloo 2.

## Core loop
Auto-move forward → steer around a 360° tube → dodge, collect, survive → speed
rises → one crash ends the run → score screen → retry.

## The tube (360°)
- The track is an **octagonal tube**: 8 flat lanes around the inside wall.
- The player always stands "down"; the camera rolls with them, so the world
  rotates around the player.
- **Gravity flip**: launch across the centre of the tube to the opposite lane.
  On cooldown. Invulnerable while crossing.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Move one lane left / right | ← → / A D | swipe left / right |
| Jump | ↑ / W | swipe up |
| Slide | ↓ / S | swipe down |
| Gravity flip | Space | double tap |

## Zones
| | Space | Underwater |
|---|---|---|
| Feel | fast, snappy | 78% speed, floaty jumps, slower lane changes |
| Look | dark station, neon, glass panels with stars + planet | teal coral tunnel, kelp, plankton, thick fog |
| Chaser | security drone | giant anglerfish |
| Obstacles | crates, red low lasers, amber high lasers | coral rocks, sea-urchin lines (jump), jellyfish (slide) |
| Resource | — | oxygen: ~22 s tank, each bubble +10%, empty = drowned |
| Twist | gravity flip | (later) the fish's lure fakes you out, darker deep sections |

Schedule: 650 m of space, then zones alternate every 700–1000 m. The track is
kept clear for 60 m before each gate. Gates are set pieces: a **hull breach**
(a wall of sea water across the tunnel) into the ocean, and a **geyser** (white
foam) back up to space. Crossing one splashes, shows a zone banner, refills
oxygen and shakes off the chaser.

## Obstacles (space)
- **Crate** — blocks a lane; hitting it ends the run.
- **Low laser** — jump over. Hitting it **zaps** you.
- **High laser** — slide under. Hitting it **zaps** you.
- Later: rotating laser arms, closing shutters, debris.

## Hits and the security drone
- A zap slows you briefly and brings the **security drone** right onto your
  tail. It falls back after a few seconds.
- Get zapped again while it is close ("SECURITY CLOSE" on screen) and it
  catches you. The run also starts with the drone close behind.

## Power-ups (one every 300–500 m)
| | Effect |
|---|---|
| Magnet (red) | 8 s — nearby coins in every lane fly to you |
| Shield (cyan) | 12 s — absorbs one hit of any kind |
| Boost (yellow) | 4 s — much faster, smash through everything, drone drops back |

## Patterns
Picked at random, harder ones unlock with distance:
- **Scatter** — one random row; never three crates side by side, so an open
  lane is always one move away.
- **Laser ring** — lasers in all 8 lanes; jump (coin arc over it) or slide.
- **Spiral** — crates winding round the tube; step against the turn.
- **Checker** — rows of alternating low/high lasers everywhere.
- **Tunnel** — a long crate block with a 2-lane channel of lasers; a long
  lead-in gives time to get there or flip there.

## Funny element
Mission control ("Dispatch", Indian English) comments on the run: customer
ratings dropping, the package being "fragile, handle with care, ya", the fish
having "no delivery address", etc.

## Assets
- **3D models** — built in code from Three.js primitives, flat-shaded low-poly
  (`src/models.js`): the courier (with the FRAGILE parcel, flapping scarf,
  balance arms), hoverboard, security drone (rotors + siren), anglerfish, crates,
  lasers, coral rocks, urchins, jellyfish, pickups, zone gates.
- **2D art** — Gemini images, made by `npm run art` (`tools/gen_images.py`) into
  `public/art/`: menu key art (wide + tall), the Dispatch portrait, power-up /
  oxygen / coin icons, emblem + favicon. No text in the art, so the game name can
  change freely. Regenerate one piece: `python tools/gen_images.py dispatch`.
- **Dispatch voice** — Gemini TTS (Indian English) made by `npm run voice`
  (`tools/gen_voice.py`) into `public/vo/` with a manifest keyed by line text.
  Every take is transcribed and checked (exact words + Indian accent) before it
  is kept (`--recheck` re-verifies existing takes). Edit lines in
  `src/dispatch.js`, then rerun to voice only new lines.
  M key or the 🔊 button mutes.
- **Music** — Lyria (`npm run music`, `tools/gen_music.py`) into `public/music/`:
  menu, space and water tracks, each checked by a Gemini text model to be
  instrumental and to fit its brief. Crossfades on zone change; ducks under
  Dispatch, when paused and on the score card.
- **Sound effects** — synthesized at runtime with Web Audio (`src/audio.js`), no
  files: lane whoosh, jump, slide, flip, coin streaks, bubbles, power-ups, zap,
  shield, crash / chomp / drown, splash, geyser, low-oxygen beep, UI clicks.

## Menus and settings
Main menu (key art, best score), How to play, Settings (music / effects / voice
volume, vibration, graphics Auto / High / Low), Pause (P / Esc / ❚❚ button, and
automatically when the tab or app is left), Game over (score, Dispatch quip,
Retry / Main menu). Settings and best score persist in the browser.

## Phones
Swipe / double-tap controls, notch-safe layout, vibration on hits, installable
to the home screen (web manifest + icons), first-run control hints, and auto
graphics quality: starts at medium on phones and drops resolution / bloom if
the frame rate stays under 40 fps.

## Build order
1. ✅ Shape prototype — tube, lanes, jump, slide, flip, obstacles, coins, score, game over.
2. ✅ Chaser drone + difficulty patterns + power-ups.
3. ✅ Underwater zone + transition + oxygen.
4. ✅ Real low-poly models, Gemini UI art, Dispatch voice.
5. ✅ Menus, audio, polish, mobile tuning.
6. ✅ Story mode: Riya, 5 deliveries, cutscenes, tutorial, truck-art UI.
