"""Generate the cast (Bholu, Nani, Mamu, Mishra ji) from family photos.

Two stages, both with Gemini:
1. A character design per person, from their photos in private/refs/ (made
   from private/faces/, which is never committed or deployed): a stylised 3D
   animated character *inspired by* them, familiar but not a portrait.
2. Every game picture of that character, drawn from the design so they stay
   consistent: cutscene cut-outs, Bholu's riding sprites (rear view), Mamu on
   his bike, and the menu key art. Radio portraits are cropped from cut-outs.

Designs and raw pictures are kept in tools/out/cast/; finished art goes to
public/art/ through tools/import_art.py (keying, trimming, sizing).

    python tools/gen_cast.py                    # everything missing
    python tools/gen_cast.py design-mamu        # just these (always redone)
    python tools/gen_cast.py --force            # redo all
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
import gen_story_art  # noqa: E402
import import_art  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)

MODEL = "gemini-3-pro-image"
ROOT = gemini.ROOT
PHOTOS = ROOT / "private" / "refs"
OUT = ROOT / "tools" / "out" / "cast"
ART = ROOT / "public" / "art"

STYLE = (
    "Stylised 3D animated feature-film character (Pixar / DreamWorks style): smooth soft shading, gently simplified "
    "and slightly exaggerated features, big expressive eyes, warm and friendly. Not photorealistic, no low-poly "
    "facets. Soft natural daylight."
)
LIKENESS = (
    "Base the character on the real person in the photo reference(s): keep their face shape, skin tone, hairstyle, "
    "facial hair, glasses (only if they wear them in the photos) and build, so family would find them familiar, but stylise and simplify every feature "
    "like an animated-film character so it is clearly a cartoon, not a portrait."
)
GREEN = "on a perfectly flat pure green (#00FF00) background with nothing else: no floor, no shadow, no other objects"
CUTOUT = f"Waist-up, front-facing character cut-out, {GREEN}. Mouth closed or only slightly open."
DESIGN = f"Character design sheet: one waist-up, front-facing view of the character, centred, {GREEN}."

BHOLU = ("Bholu, a cheerful young delivery rider from Bihar in his twenties, with NO glasses, short black hair, a light "
         "moustache and a short stubble beard like the photos: a saffron scooter helmet with a teal "
         "centre stripe and small stickers, a deep teal courier jacket with saffron reflective stripes over a white "
         "shirt, a red-and-white checked gamchha scarf round his neck")
NANI = ("Nani, a warm, smiling grandmother from Bihar in her seventies, in a soft pink cotton sari with the end over "
        "her head, glass bangles and a small red bindi")
MAMU = ("Mamu, a Bihar traffic policeman in his late forties: crisp white uniform shirt with shoulder flaps, khaki "
        "trousers, a white helmet marked TRAFFIC POLICE, a whistle on a yellow cord, a name tag reading MAMU, and his "
        "own glasses")
MISHRA = ("Mishra ji, the cheerful dispatcher of a small Patna courier office, around fifty: his white kurta with a "
          "cream gamchha over one shoulder, his dark sunglasses, a call-centre headset, a glass of chai in one hand")
SPRITE = ("Replace the rider in the LAST reference image completely with Bholu from the first reference, riding the same "
          "mint-green Indian scooter with the cardboard delivery box strapped behind the seat. Keep the last "
          "reference's exact camera angle, size and framing: a REAR VIEW from directly behind and a little above, "
          "the scooter heading away from us. We see only his back: the saffron helmet with its teal stripe, the "
          "back of his teal courier jacket with saffron reflective stripes, the red-and-white gamchha flapping back "
          f"towards us. Same rendering style as the reference, {GREEN}.")

# name: (kind, aspect, references, prompt). kind: design | cutout | sprite | cover | plate.
# References are photos ("photo:bholu-a"), designs ("design-bholu") or game art ("art:sprites/sprite-ride").
ASSETS = {
    # --- 1. designs
    "design-bholu": ("design", "3:4", ["photo:bholu-a", "photo:bholu-b", "photo:bholu-c"],
                     f"{DESIGN} The character: {BHOLU}. {LIKENESS} {STYLE}"),
    "design-nani": ("design", "3:4", ["photo:nani-a", "photo:nani-b"],
                    f"{DESIGN} The character: {NANI}. {LIKENESS} Base her on the elderly woman in the FIRST photo; the "
                    f"second photo is a younger relative, a family-resemblance reference only. {STYLE}"),
    "design-mamu": ("design", "3:4", ["photo:mamu-a"],
                    f"{DESIGN} The character: {MAMU}. {LIKENESS} {STYLE}"),
    "design-mishra": ("design", "3:4", ["photo:mishra-a"],
                      f"{DESIGN} The character: {MISHRA}. {LIKENESS} {STYLE}"),

    # --- 2. cutscene cut-outs (drawn from the designs)
    "cut-bholu-talk": ("cutout", "3:4", ["design-bholu"], f"{CUTOUT} The character in the reference, exactly: talking cheerfully, one hand raised as he explains. {STYLE}"),
    "cut-bholu-grin": ("cutout", "3:4", ["design-bholu"], f"{CUTOUT} The character in the reference, exactly: a big confident grin, thumbs up. {STYLE}"),
    "cut-bholu-shock": ("cutout", "3:4", ["design-bholu"], f"{CUTOUT} The character in the reference, exactly: shocked, eyes wide, both hands up. {STYLE}"),
    "cut-bholu-wave": ("cutout", "3:4", ["design-bholu"], f"{CUTOUT} The character in the reference, exactly: waving happily at the viewer. {STYLE}"),
    "cut-nani": ("cutout", "3:4", ["design-nani"], f"{CUTOUT} The character in the reference, exactly: holding an old landline phone receiver to her ear, smiling warmly. {STYLE}"),
    "cut-mishra": ("cutout", "3:4", ["design-mishra"], f"{CUTOUT} The character in the reference, exactly: raising one finger as if making a point, glass of chai in the other hand. {STYLE}"),
    "cut-mamu": ("cutout", "3:4", ["design-mamu"], f"{CUTOUT} The character in the reference, exactly, helmet on: pointing sternly at the viewer, whistle at his chest, comically serious. {STYLE}"),
    "cut-mamu-laugh": ("cutout", "3:4", ["design-mamu"], f"{CUTOUT} The character in the reference, exactly, but with his helmet off and tucked under one arm: laughing warmly, a kind uncle. {STYLE}"),

    # --- 2. gameplay sprites (rear view, the chase camera's angle)
    "sprite-ride": ("sprite", "3:4", ["design-bholu", "art:sprites/sprite-ride"], f"{SPRITE} Pose: riding steadily, both hands on the handlebars."),
    "sprite-left": ("sprite", "3:4", ["design-bholu", "art:sprites/sprite-left"], f"{SPRITE} Pose: leaning the scooter hard to the LEFT of the picture as he swerves."),
    "sprite-right": ("sprite", "3:4", ["design-bholu", "art:sprites/sprite-right"], f"{SPRITE} Pose: leaning the scooter hard to the RIGHT of the picture as he swerves."),
    "sprite-jump": ("sprite", "3:4", ["design-bholu", "art:sprites/sprite-jump"], f"{SPRITE} Pose: the scooter in the air hopping a pothole, both wheels off the ground, Bholu half standing on the footboard."),
    "sprite-slide": ("sprite", "3:4", ["design-bholu", "art:sprites/sprite-slide"], f"{SPRITE} Pose: ducking flat over the handlebars to pass under a barrier."),
    "sprite-hit": ("sprite", "3:4", ["design-bholu", "art:sprites/sprite-hit"], f"{SPRITE} Pose: wobbling after clipping something, one foot out, startled, a few dust puffs."),
    "sprite-cheer": ("sprite", "3:4", ["design-bholu", "art:sprites/sprite-cheer"], f"{SPRITE} Pose: stopped, one foot down, punching the air in celebration."),
    "chaser-mamu": ("sprite", "1:1", ["design-mamu", "art:sprites/chaser-mamu"],
                    f"Replace the rider in the LAST reference image with the traffic policeman from the first reference, on the "
                    f"same white police motorbike with a red-and-blue beacon on a pole and two white panniers. Keep the last "
                    f"reference's exact REAR-VIEW camera angle, size and framing: we see his back and the back of the bike. "
                    f"Same rendering style, {GREEN}."),

    # --- 2. the opening: a drone coming down out of the sky towards Bholu (plates for the 2.5D stage)
    "plate-aerial-high": ("plate", "16:9", ["art:story/bg-patna-street"],
                          "A drone shot from high in the sky above old Patna on a clear afternoon, in the exact style of the "
                          "reference: looking straight down the length of one long, busy, straight street that runs from the "
                          "bottom centre of the picture to the horizon, lined on both sides by colourful houses with black water "
                          "tanks on their flat roofs, trees and temple spires; the river Ganga and the long Gandhi Setu bridge on "
                          "the horizon, blue sky with soft clouds above. The street stays in the middle third of the picture. "
                          f"{STYLE} No text."),
    "plate-aerial-low": ("plate", "16:9", ["plate-aerial-high", "art:story/bg-patna-street"],
                         "The same street as the first reference, now from a drone much lower, just above the rooftops at the "
                         "near end of the street, looking down the street ahead: the road surface clearly visible in the lower "
                         "middle of the picture with auto-rickshaws, cycle-rickshaws and a cow walking on the road, shop signs "
                         "and bunting along the shopfronts, rooftops with water tanks on both sides. Everything at a natural, "
                         "consistent scale. The street stays in the middle third of the picture. Same style as the references. "
                         f"{STYLE} No text."),

    # --- 2. menu key art
    "keyart": ("cover", "16:9", ["design-bholu", "design-mamu", "art:story/bg-patna-street"],
               f"Video game key art in the style of the street reference. Bholu (the first reference) rides his mint-green "
               f"scooter with a cardboard parcel box towards the camera through a lively old Patna street, weaving between "
               f"an auto-rickshaw and a cow. Behind him, Mamu the traffic policeman (second reference) chases on a white "
               f"police motorbike, whistle in his mouth. Bholu on the left third, open sky at the top centre for the title. "
               f"{STYLE} No text, no logos."),
    "keyart-tall": ("cover", "9:16", ["design-bholu", "design-mamu", "art:story/bg-patna-street"],
                    f"Vertical phone-wallpaper key art in the style of the street reference: Bholu (first reference) rides his "
                    f"mint-green scooter towards the camera through a lively Patna street, Mamu the traffic policeman (second "
                    f"reference) chasing on his police motorbike behind him, autos and a cow around. Bholu in the middle, open "
                    f"sky at the top for the title. {STYLE} No text, no logos."),
}


def part(image, mime="image/png"):
    buffer = io.BytesIO()
    image.save(buffer, "PNG" if mime == "image/png" else "JPEG", quality=90)
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(buffer.getvalue()).decode()}}


def reference(ref):
    if ref.startswith("photo:"):
        return part(Image.open(PHOTOS / f"{ref[6:]}.jpg").convert("RGB"), "image/jpeg")
    if ref.startswith("art:"):  # game art with transparency goes on green, the way it was drawn
        return part(import_art.on_green(Image.open(ART / f"{ref[4:]}.webp")))
    return part(Image.open(OUT / f"{ref}.png").convert("RGB"))  # a design, or a picture made earlier in this run


def make(name):
    kind, aspect, refs, prompt = ASSETS[name]
    print(f"{name}: generating")
    response = gemini.request(f"models/{MODEL}:generateContent", {
        "contents": [{"parts": [*map(reference, refs), {"text": " ".join(prompt.split())}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}},
    })
    _, data = gemini.inline_data(response)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    image.save(OUT / f"{name}.png")
    if kind == "plate":
        gen_story_art.save(ART / "story" / f"{name}.webp", "plate", image)
    elif kind != "design":
        import_art.save_asset(name, image)
        portrait = import_art.PORTRAITS.get(name)
        if portrait:
            cell = import_art.on_green(image)
            import_art.save_asset(portrait, import_art.portrait_from_cutout(cell.crop(import_art.subject_box(cell))))
    print(f"{name}: done")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    todo = args.names or [n for n in ASSETS if args.force or not (OUT / f"{n}.png").exists()]
    # Designs first: everything else is drawn from them.
    for stage in (lambda n: ASSETS[n][0] == "design", lambda n: ASSETS[n][0] != "design"):
        batch = [n for n in todo if stage(n)]
        with ThreadPoolExecutor(4) as pool:
            list(pool.map(make, batch))


if __name__ == "__main__":
    main()
