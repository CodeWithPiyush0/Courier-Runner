# Art brief for Codex: Patna Rush (round 3: backgrounds)

You are making painted images for **Patna Rush**, a browser endless-runner set
in present-day Bihar, India. Riya, a young delivery rider, scooters from Patna
to her Nani's house in Muzaffarpur while a traffic cop, "Mamu", chases her.

> **Status: complete.** Every image in this brief is done, approved and in
> the game. Nothing to make unless asked for something new.

**Credits are limited.** Make them in order and stop after a tier if you run
low.

## How to work

1. For every image, use your image generation tool with the **Style rules**
   below in front of the prompt, and pass `refs/style-mamu.png` and
   `refs/riya-scooter.png` as references **for the rendering style only**
   (not for content).
2. Save each result as a PNG in `art-requests/out/`, named **exactly** as shown.
3. Make each image **once**. Regenerate only if it looks photographic, has an
   orange sunset cast, or has a clear mistake (garbled main sign, a person in
   the foreground where there shouldn't be one).
4. When you're done (or out of credits), run:

   ```
   python tools/import_art.py art-requests/out
   npm run build
   ```

   Report which files you made. Don't edit any code or other files.

## Style rules (put this in front of every prompt)

> A frame from a stylised **3D animated feature film** (in the spirit of
> Pixar, DreamWorks or Illumination), set in India. **Clearly computer
> animated, not a photograph.** Render it exactly like the characters in the
> reference images.
> - Simplified, chunky shapes with soft rounded edges and slightly exaggerated
>   proportions: buildings lean a little, signboards are oversized, trees are
>   plump and rounded.
> - Clean, stylised, hand-painted-looking textures. Fewer, bigger details with
>   readable silhouettes.
> - Bright, cheerful but natural colours. Soft daylight with gentle bounce
>   light, soft shadows and a pale blue, slightly hazy sky.
> - Indian details kept playful and charming: hand-painted Hindi signs,
>   bunting, scooters and autos with toy-like proportions.
>
> **Avoid:** photorealism, photographic textures, realistic grime and wear,
> camera noise, depth of field, lens flare, a golden-hour or sunset glow,
> orange or teal colour grading, dark or gloomy lighting, any watermark.

## Layout for backgrounds

These are full-screen backdrops (1536×1024) that the character cut-outs stand
in front of. Keep the important things in the **middle third**, because phones
crop the sides. Leave the **lower middle open** (floor, road or ground), since
the characters stand there. No people, unless a prompt says so.

---

## Tier 2: cutscene backgrounds

### 4. `bg-office.png`
> A small, busy courier dispatch office in Patna. A desk with a chunky old
> computer, a headset and a ledger, a pedestal fan, a big map of Bihar on the
> wall with pins, stacks of cardboard parcels, a glass of chai, a wall calendar
> and a big hand-painted sign reading "DesiDash Couriers". Daylight through a
> window.

### 5. `bg-radio-shop.png`
> A tiny, charming radio repair shop on Ashok Rajpath, Patna. Shelves packed
> with colourful old transistor radios, a counter with a soldering iron and a
> lamp, and a big hand-painted sign reading "Laxmi Radio Repair". The busy
> street shows beyond the open shutter.

### 6. `bg-patna-street.png`
> A lively old-city street in Patna. Toy-like auto-rickshaws and
> cycle-rickshaws, a cow, oversized shop signs in Hindi and English, bunting
> and overhead wires, and a traffic signal. No people in the foreground.

### 7. `bg-courtyard.png`
> The courtyard of a grandmother's village house in Muzaffarpur, Bihar,
> decorated for her birthday. Whitewashed walls, a woven charpai, a tulsi plant
> on a small pedestal, marigold garlands, a hand pump, and plump litchi trees
> with red fruit beyond the wall. Soft late-afternoon daylight, not a sunset.

### 8. `bg-orchard.png`
> A litchi orchard in Muzaffarpur. Rows of round, plump trees heavy with
> bunches of red litchi, a dusty lane between them, a wooden crate and a
> bamboo ladder.

### 9. `plate-radio.png`
> Close-up of an open cardboard parcel on a wooden table, holding a charming
> old 1970s transistor radio whose dial glows softly. A big shipping label
> reads "TO: NANI, LITCHI BAGAN, MUZAFFARPUR", with a red FRAGILE stamp.

### 10. `plate-setu.png`
> Mahatma Gandhi Setu, the long bridge over the river Ganga, completely jammed
> with toy-like trucks and buses. Beside it a small ramp leads down into a dark
> service tunnel under the bridge. No people in the foreground.

### 11. `plate-haat.png`
> The banana market in Hajipur, Bihar. Wooden carts piled high with green and
> yellow bananas, colourful awnings, a cow, and a narrow gap between the carts.
> Vendors only in the background.

---

## Tier 3: menu art

Also pass `refs/riya-scooter-cheer.png` and `refs/riya-face.png` for Riya and
`refs/style-mamu.png` for Mamu. Here they are references for the characters
too.

### 12. `keyart.png`: 1536×1024
> Video game key art. Riya, a young delivery rider (saffron helmet with a teal
> stripe, long black braid, teal jacket, pink dupatta), rides her mint-green
> scooter with a cardboard parcel box towards the camera through a lively old
> Patna street, weaving between a toy-like auto-rickshaw and a cow. Behind
> her, Mamu, the traffic policeman (as in the reference), chases on a white
> police motorbike with his whistle in his mouth. Riya sits on the left third,
> with open sky at the top centre for the game's title. No text, no logos.

### 13. `keyart-tall.png`: 1024×1536
> Vertical phone-wallpaper key art: Riya (as above) rides her mint-green
> scooter towards the camera through a lively Patna street, with Mamu the
> traffic policeman chasing on his police motorbike behind her, and autos and
> a cow around. Riya is in the middle of the frame, with open sky at the top
> for the title. No text, no logos.
