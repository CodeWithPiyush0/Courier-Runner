"""Generate the 2.5D art: Riya's gameplay sprites, the chaser sprites, and the
cutscene backgrounds, character cut-outs and full illustrated shots.

Every character image is drawn from reference images (her portrait etc.) so she
looks the same everywhere. Sprites and cut-outs are drawn on a green screen and
keyed out. Writes public/art/sprites/ and public/art/story/.

    python tools/gen_story_art.py                 # everything missing
    python tools/gen_story_art.py sprite-ride     # just these (always redone)
    python tools/gen_story_art.py --force         # redo all
"""
import argparse
import base64
import io
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini  # noqa: E402
from gen_images import STYLE, green_to_alpha  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)

MODEL = "gemini-3-pro-image"
ART = gemini.ROOT / "public" / "art"
GREEN = "on a perfectly flat pure green (#00FF00) background with nothing else, no ground, no shadow"
BOARD = ("her hoverboard: a flat deck with NO wheels, hovering on a soft teal glow, hand-painted like an Indian truck "
         "(saffron with rani-pink and teal patterns)")
RIYA = ("Riya (exactly as in the reference: saffron helmet with a teal stripe and stickers, goggles, long black braid "
        "with a marigold band, deep teal courier jacket with saffron reflective stripes, pink Madhubani dupatta, "
        "indigo cargo pants, white sneakers, taped cardboard parcel on her back with teal light leaking from its seams)")
# The last reference for every sprite is a crop of the game camera's view of the old placeholder model: it
# fixes the viewpoint (straight behind, a little above), not the style.
SPRITE = (f"Game sprite of {RIYA} riding {BOARD}. Match the CAMERA ANGLE of the last reference image exactly (ignore "
          "its blocky placeholder style): a symmetrical rear view from straight behind and a little above, her back "
          "square to us. She stands FACING FORWARD with both feet side by side, like standing on a flying carpet (NOT "
          "a sideways snowboard stance); the board is a long deck pointing straight ahead of her, so in the image its "
          "nose points up into the distance and its tail is at the bottom centre between her feet. The parcel on her back faces us with a red FRAGILE stamp; her braid and dupatta stream back "
          f"towards us. The whole figure and the whole board visible, filling about 85% of the frame height, {GREEN}. "
          "Same stylised 3D render style as the character references, soft rim light.")
CUTOUT = f"Waist-up character cut-out, {GREEN}. Same stylised 3D render style as the references."
WIDE = ("Wide cinematic 16:9 shot. Keep the main subject in the centre third so it still reads when cropped to a "
        "tall phone screen.")

# name: (folder, aspect, kind, refs, prompt). kind: sprite | cutout | plate.
ASSETS = {
    # --- Riya in play (back view). The ride pose is the reference for the others.
    "sprite-ride": ("sprites", "3:4", "sprite", ["portrait-riya", "sprites/camera-guide"], f"{SPRITE} Pose: riding steadily, knees bent, arms slightly out for balance."),
    "sprite-left": ("sprites", "3:4", "sprite", ["portrait-riya", "sprites/sprite-ride", "sprites/camera-guide"], f"{SPRITE} Pose: swerving to HER LEFT (our left), body and board tilted left, right arm raised for balance."),
    "sprite-right": ("sprites", "3:4", "sprite", ["portrait-riya", "sprites/sprite-ride", "sprites/camera-guide"], f"{SPRITE} Pose: swerving to HER RIGHT (our right), body and board tilted right, left arm raised for balance."),
    "sprite-jump": ("sprites", "3:4", "sprite", ["portrait-riya", "sprites/sprite-ride", "sprites/camera-guide"], f"{SPRITE} Pose: mid-jump, knees tucked up high, the board lifted under her feet, arms up, braid flying."),
    "sprite-slide": ("sprites", "3:4", "sprite", ["portrait-riya", "sprites/sprite-ride", "sprites/camera-guide"], f"{SPRITE} Pose: ducking very low, crouched flat on the board to slide under something, one hand on the board."),
    "sprite-hit": ("sprites", "3:4", "sprite", ["portrait-riya", "sprites/sprite-ride", "sprites/camera-guide"], f"{SPRITE} Pose: just zapped, jolted off-balance with arms flailing, little pink electric sparks around her."),
    "sprite-cheer": ("sprites", "3:4", "sprite", ["portrait-riya", "sprites/sprite-ride", "sprites/camera-guide"], f"{SPRITE} Pose: celebrating, standing tall on the board with both fists raised high."),
    # --- the chasers, seen from behind as they follow her
    "chaser-drone": ("sprites", "1:1", "sprite", ["portrait-security", "sprites/camera-guide"], f"Game sprite of the station security drone from the first reference (round dark-metal body, four small rotors, red and blue siren on top, tiny police-style cap). REAR VIEW, matching the camera angle of the last reference (ignore its style): we see the back of the drone as it flies away from us, chasing someone ahead; its eye faces away so it is not visible. No glow halos or lens flares. Centred, {GREEN}. Same stylised 3D render style."),
    "chaser-fish": ("sprites", "1:1", "sprite", ["keyart", "sprites/camera-guide"], f"Game sprite of the giant anglerfish from the first reference (rusty-brown, big toothy jaw, glowing lure on a stalk). REAR VIEW, matching the camera angle of the last reference (ignore its style): it swims straight away from us chasing someone ahead, so we see its tail fin at the bottom, its back and dorsal fins, and the glowing lure peeking up over its head. Not a side view. No glow halos. Centred, {GREEN}. Same stylised 3D render style."),

    # --- cut-outs for the 2.5D cutscenes (front-facing)
    "cut-riya-talk": ("story", "3:4", "cutout", ["portrait-riya"], f"{CUTOUT} {RIYA}, three-quarter view facing the viewer, one hand on her hip, talking into the radio clipped to her jacket, confident friendly expression."),
    "cut-riya-grin": ("story", "3:4", "cutout", ["portrait-riya"], f"{CUTOUT} {RIYA}, facing the viewer with a big cheeky grin and a thumbs up."),
    "cut-riya-shock": ("story", "3:4", "cutout", ["portrait-riya"], f"{CUTOUT} {RIYA}, startled: eyes wide, mouth open, both hands raised, glancing over her shoulder."),
    "cut-riya-wave": ("story", "3:4", "cutout", ["portrait-riya"], f"{CUTOUT} {RIYA}, waving happily at the viewer with a warm smile."),
    "cut-mishra": ("story", "3:4", "cutout", ["dispatch"], f"{CUTOUT} Mishra ji the dispatcher exactly as in the reference (moustache, headset with microphone, navy uniform with orange parcel badge), leaning into his microphone with one finger raised mid-sentence, a glass of chai in the other hand, animated expression."),
    "cut-nani": ("story", "3:4", "cutout", ["portrait-nani"], f"{CUTOUT} Nani exactly as in the reference (silver bun, round glasses, cream saree with red border, shawl), beaming, holding an old-fashioned phone receiver to her ear and a steel tumbler of chai."),
    "cut-drone": ("story", "1:1", "cutout", ["portrait-security"], f"The security drone from the reference facing the viewer head-on, hovering, siren flashing red and blue, stern red eye, tiny police cap, {GREEN}. Same stylised 3D render style."),

    # --- backgrounds for the cut-outs (no people)
    "bg-dispatch": ("story", "16:9", "plate", [], f"{WIDE} The Dispatch control room of an interplanetary delivery company on a space station at night: rows of glowing monitors showing delivery routes, a steaming chai kettle, a marigold garland, a hand-painted truck-art sign, a window full of stars. No people. {STYLE}"),
    "bg-dock": ("story", "16:9", "plate", [], f"{WIDE} Chandra-7 cargo dock at night: stacks of cardboard parcels, a conveyor belt, warm hanging lamps, hand-painted truck-art signs, and a big round porthole showing a blue ocean planet below. No people. {STYLE}"),
    "bg-tunnel": ("story", "16:9", "plate", [], f"{WIDE} Inside an octagonal space-station cargo tunnel, red warning lights flashing, hazard-striped crates, neon trim, strong depth towards a vanishing point. No people. {STYLE}"),
    "bg-kitchen": ("story", "16:9", "plate", [], f"{WIDE} Nani's cosy underwater coral cottage kitchen: a clay stove with litti-chokha cooking, steel utensils, round bubble windows with fish swimming outside, warm lamplight, a marigold garland. No people. {STYLE}"),

    # --- full illustrated shots
    "plate-parcel": ("story", "16:9", "plate", ["portrait-riya"], f"{WIDE} Close-up of a taped cardboard parcel on a cargo-dock counter with a shipping label reading 'TO: NANI, CORAL COLONY, NEELA' and a red FRAGILE stamp; mysterious teal light leaks from its seams, tiny sparkles float around it. Dramatic, moody. {STYLE}"),
    "plate-breach": ("story", "16:9", "plate", ["portrait-riya"], f"{WIDE} A giant crack in the glass sea dome at the end of a space-station tunnel, ocean water bursting in with bubbles everywhere; {RIYA} on {BOARD}, small in the foreground, bracing. Dramatic. {STYLE}"),
    "plate-deep": ("story", "16:9", "plate", ["portrait-riya", "keyart"], f"{WIDE} A deep dark ocean trench lit only by the glowing lure of a giant anglerfish in the distance; {RIYA} on {BOARD} in the foreground, glancing back nervously, her parcel glowing teal. {STYLE}"),
    "plate-doorstep": ("story", "16:9", "plate", ["portrait-riya", "portrait-nani"], f"{WIDE} Underwater, at the round wooden door of Nani's coral cottage with a marigold garland above it and a painted sign reading 'NANI KA GHAR': {RIYA} hands the glowing parcel to Nani (as in the reference), who is overjoyed. Warm light. {STYLE}"),
    "plate-egg": ("story", "16:9", "plate", ["portrait-riya", "portrait-nani"], f"{WIDE} Close-up: an opened cardboard box revealing a glowing teal anglerfish egg, its light on the amazed faces of Nani and Riya leaning in from either side. {STYLE}"),
    "plate-hatch": ("story", "16:9", "plate", ["portrait-nani"], f"{WIDE} A tiny, very cute baby anglerfish with a little glowing lure hatching out of a glowing egg, eggshell pieces and sparkles, Nani clapping with delight behind it. {STYLE}"),
    "plate-mother": ("story", "16:9", "plate", ["portrait-riya", "keyart"], f"{WIDE} The giant mother anglerfish, gentle and teary-eyed with joy, peeking in through the round doorway of the coral cottage as her baby swims up to her nose; {RIYA} laughing with relief. {STYLE}"),
    "plate-dinner": ("story", "16:9", "plate", ["portrait-riya", "portrait-nani", "dispatch"], f"{WIDE} Warm finale inside the coral cottage: Nani and {RIYA} eating litti-chokha and drinking chai at a low table, the baby anglerfish floating happily beside them, the mother anglerfish's huge happy face at the round window, and Mishra ji waving from a video call on a tablet. {STYLE}"),
}


def reference(name):
    path = ART / f"{name}.webp"
    return {"inlineData": {"mimeType": "image/webp", "data": base64.b64encode(path.read_bytes()).decode()}}


def generate(aspect, prompt, refs):
    response = gemini.request(f"models/{MODEL}:generateContent", {
        "contents": [{"parts": [*map(reference, refs), {"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}},
    })
    _, data = gemini.inline_data(response)
    return Image.open(io.BytesIO(data)).convert("RGB")


def save(path, kind, image):
    if kind == "plate":
        image.thumbnail((1600, 1600))
        image.save(path, quality=80)
        return
    cutout = green_to_alpha(image)
    cutout.thumbnail((640, 640) if kind == "sprite" else (900, 900), Image.LANCZOS)
    cutout.save(path, quality=88)


def make(name):
    folder, aspect, kind, refs, prompt = ASSETS[name]
    path = ART / folder / f"{name}.webp"
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"{name}: generating")
    save(path, kind, generate(aspect, " ".join(prompt.split()), refs))
    print(f"{name}: done")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    todo = [n for n in (args.names or ASSETS)
            if args.names or args.force or not (ART / ASSETS[n][0] / f"{n}.webp").exists()]
    # Anything that uses another generated image as a reference waits for it.
    first = [n for n in todo if not any("/" in r for r in ASSETS[n][3])]
    later = [n for n in todo if n not in first]
    for batch in (first, later):
        with ThreadPoolExecutor(args.workers) as pool:
            list(pool.map(make, batch))


if __name__ == "__main__":
    main()
