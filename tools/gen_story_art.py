"""Generate the 2.5D art: backgrounds and plates (and, originally, the characters).

The cast (Bholu, Nani, Mamu, Mishra ji) is now drawn from family photos by
tools/gen_cast.py; the character entries below remain as the table that
tools/import_art.py saves them by (folder, aspect, kind), and as a fallback.

Originally: Bholu's gameplay sprites (on his scooter), Mamu's sprite,
and the cutscene backgrounds, character cut-outs and full illustrated shots,
all at 2K.

Every character image is drawn from reference images (his portrait etc.) so he
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
SCOOTER = ("his scooter: a classic Indian two-wheeler scooter, mint green, a little dented, with a cardboard delivery "
           "box strapped behind the seat")
BHOLU = ("Bholu (exactly as in the reference: a young man with a saffron helmet with a teal stripe and stickers, a deep "
        "teal courier jacket with saffron reflective stripes, a red-and-white checked gamchha scarf, cargo pants)")
MAMU = ("Mamu, a burly Bihar traffic policeman in his forties: white helmet marked TRAFFIC POLICE, mirrored aviator "
        "sunglasses, thick moustache, crisp white-and-khaki uniform with a whistle on a cord")
REAL = ("Real-world India today, not futuristic. Warm golden-hour light, gently stylised 3D render like a modern "
        "animated film, rich colour, no text other than any named signs.")
# The last reference for every sprite is a crop of the game camera's view of the old placeholder model: it
# fixes the viewpoint (straight behind, a little above), not the style.
SPRITE = (f"Game sprite of {BHOLU} riding {SCOOTER}. Match the CAMERA ANGLE of the last reference image (ignore its "
          "style): a rear view from behind and a little above, the scooter pointing away from us with its back wheel "
          "at the bottom centre. The parcel box behind the seat faces us with a red FRAGILE stamp; his gamchha streams "
          f"back towards us. The whole rider and the whole scooter visible, filling about 85% of the frame height, {GREEN}. "
          "Same stylised 3D render style as the character reference, soft rim light.")
CUTOUT = f"Waist-up character cut-out, {GREEN}. Same stylised 3D render style as the references."
WIDE = ("Wide cinematic 16:9 shot. Keep the main subject in the centre third so it still reads when cropped to a "
        "tall phone screen.")
SPRITE_REFS = ["portrait-bholu", "sprites/sprite-ride", "sprites/camera-guide"]

# name: (folder, aspect, kind, refs, prompt). kind: sprite | cutout | plate | portrait.
ASSETS = {
    # --- Bholu in play (rear view). The ride pose is the reference for the others.
    "sprite-ride": ("sprites", "3:4", "sprite", ["portrait-bholu", "sprites/camera-guide"], f"{SPRITE} Pose: riding steadily, hands on the handlebars."),
    "sprite-left": ("sprites", "3:4", "sprite", SPRITE_REFS, f"{SPRITE} Pose: leaning the scooter hard to HIS LEFT (our left) as he swerves."),
    "sprite-right": ("sprites", "3:4", "sprite", SPRITE_REFS, f"{SPRITE} Pose: leaning the scooter hard to HIS RIGHT (our right) as he swerves."),
    "sprite-jump": ("sprites", "3:4", "sprite", SPRITE_REFS, f"{SPRITE} Pose: the scooter in the air hopping a pothole, both wheels off the ground, Bholu half standing."),
    "sprite-slide": ("sprites", "3:4", "sprite", SPRITE_REFS, f"{SPRITE} Pose: ducking flat over the handlebars to pass under a barrier."),
    "sprite-hit": ("sprites", "3:4", "sprite", SPRITE_REFS, f"{SPRITE} Pose: wobbling after clipping something, one foot out, startled, little dust puffs."),
    "sprite-cheer": ("sprites", "3:4", "sprite", SPRITE_REFS, f"{SPRITE} Pose: stopped, one foot down, punching the air in celebration."),
    # --- Mamu chasing (rear view, from behind him)
    "chaser-mamu": ("sprites", "1:1", "sprite", ["story/cut-mamu", "sprites/camera-guide"], f"Game sprite of {MAMU} (as in the first reference) riding a white police motorbike with a red-and-blue beacon. REAR VIEW, matching the camera angle of the last reference (ignore its style): we see his back as he chases someone ahead. Centred, {GREEN}. Same stylised 3D render style."),

    # --- cut-outs (front-facing)
    "cut-mishra": ("story", "3:4", "cutout", ["dispatch"], f"{CUTOUT} Mishra ji (as in the reference), the cheerful middle-aged dispatcher of a small Patna courier office: moustache, glasses, blue shirt, a call-centre headset, a glass of chai in hand, mid-sentence."),
    "cut-bholu-talk": ("story", "3:4", "cutout", ["portrait-bholu"], f"{CUTOUT} {BHOLU}, talking cheerfully, one hand raised as he explains, mouth only slightly open."),
    "cut-bholu-grin": ("story", "3:4", "cutout", ["portrait-bholu"], f"{CUTOUT} {BHOLU}, a big confident grin, thumbs up."),
    "cut-bholu-shock": ("story", "3:4", "cutout", ["portrait-bholu"], f"{CUTOUT} {BHOLU}, shocked, eyes wide, hands up."),
    "cut-bholu-wave": ("story", "3:4", "cutout", ["portrait-bholu"], f"{CUTOUT} {BHOLU}, waving happily at the viewer."),
    "cut-nani": ("story", "3:4", "cutout", ["portrait-nani"], f"{CUTOUT} Nani (as in the reference), a cheerful tiny Bihari grandmother in her seventies: silver hair in a bun, round glasses, red bindi, cream cotton sari with a red border, holding an old landline receiver, smiling warmly with her mouth closed."),
    "cut-mamu": ("story", "3:4", "cutout", [], f"{CUTOUT} {MAMU}, pointing sternly at the viewer, whistle at his lips, comically serious."),
    "cut-mamu-laugh": ("story", "3:4", "cutout", ["story/cut-mamu"], f"{CUTOUT} The same policeman as the reference, helmet off under his arm and sunglasses pushed up, laughing warmly: a kind uncle."),
    "portrait-mamu": (".", "1:1", "portrait", ["story/cut-mamu"], f"Head-and-shoulders portrait of the traffic policeman in the reference, stern but secretly kind, background a softly blurred Patna street at golden hour. {REAL}"),

    # --- backgrounds for the cut-outs (no people)
    "bg-office": ("story", "16:9", "plate", [], f"{WIDE} A small, busy courier dispatch office in Patna: a desk with an old computer and a headset, a ceiling fan, a big map of Bihar with pins, stacked parcels, a steaming glass of chai, a hand-painted sign 'DesiDash Couriers'. No people. {REAL}"),
    "bg-radio-shop": ("story", "16:9", "plate", [], f"{WIDE} A tiny old radio repair shop on Ashok Rajpath, Patna: shelves of vintage transistor radios, tools, a soldering iron, a hand-painted sign 'Laxmi Radio Repair'. No people. {REAL}"),
    "bg-patna-street": ("story", "16:9", "plate", [], f"{WIDE} A crowded old-city street in Patna: auto-rickshaws, cycle-rickshaws, a cow, shop signs in Hindi and English, tangled overhead wires, a traffic signal. No people in the foreground. {REAL}"),
    "bg-courtyard": ("story", "16:9", "plate", [], f"{WIDE} The courtyard of Nani's village house in Muzaffarpur: a charpai, a tulsi plant, marigold garlands for a birthday, litchi trees with red fruit beyond the wall. No people. {REAL}"),
    "bg-orchard": ("story", "16:9", "plate", [], f"{WIDE} A litchi orchard in Muzaffarpur: rows of trees heavy with red Shahi litchi, a dusty lane between them, evening light. No people. {REAL}"),

    # --- full illustrated shots
    "plate-radio": ("story", "16:9", "plate", [], f"{WIDE} Close-up of an open cardboard parcel holding a beautiful old 1970s transistor radio, its dial glowing as it plays; a shipping label reads 'TO: NANI, LITCHI BAGAN, MUZAFFARPUR' with a red FRAGILE stamp. {REAL}"),
    "plate-setu": ("story", "16:9", "plate", [], f"{WIDE} Mahatma Gandhi Setu over the river Ganga at sunset, completely jammed with trucks and buses; beside it a small ramp leads down into a dark service tunnel under the bridge. No people in the foreground. {REAL}"),
    "plate-haat": ("story", "16:9", "plate", [], f"{WIDE} Hajipur's banana market: carts piled high with green and yellow bananas, a cow, colourful awnings, a narrow gap between the carts; vendors only in the soft background. {REAL}"),
    # The ending shots are composed from the courtyard / orchard backgrounds and the cut-outs (see scenes.js).
}


def reference(name):
    path = ART / f"{name}.webp"
    return {"inlineData": {"mimeType": "image/webp", "data": base64.b64encode(path.read_bytes()).decode()}}


def generate(aspect, prompt, refs):
    response = gemini.request(f"models/{MODEL}:generateContent", {
        "contents": [{"parts": [*map(reference, refs), {"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}},
    })
    _, data = gemini.inline_data(response)
    return Image.open(io.BytesIO(data)).convert("RGB")


def save(path, kind, image):
    if kind == "plate":
        image.thumbnail((2400, 2400))
        image.save(path, quality=84)
        return
    if kind == "portrait":
        image.resize((512, 512), Image.LANCZOS).save(path, quality=86)
        return
    cutout = green_to_alpha(image)
    cutout.thumbnail((1100, 1100) if kind == "sprite" else (1400, 1400), Image.LANCZOS)
    cutout.save(path, quality=88)


def make(name):
    folder, aspect, kind, refs, prompt = ASSETS[name]
    path = (ART / folder / f"{name}.webp").resolve()
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
    # Anything that uses another image being made in this run as a reference waits for it.
    while todo:
        ready = [n for n in todo if not any(r.split("/")[-1] in todo for r in ASSETS[n][3])]
        with ThreadPoolExecutor(args.workers) as pool:
            list(pool.map(make, ready))
        todo = [n for n in todo if n not in ready]


if __name__ == "__main__":
    main()
