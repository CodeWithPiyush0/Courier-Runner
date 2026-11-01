"""Generate the painted obstacle sprites with Gemini.

Every obstacle on the track is a painted sprite in the cutscene art's 3D
animated-film style, seen the way the chase camera sees it (from behind and a
little above), so it reads instantly at speed. They are drawn on a magenta
screen (autos and banana carts are green, so a green screen would eat them)
and keyed out to public/art/props/<name>.webp.

    python tools/gen_props.py                # everything missing
    python tools/gen_props.py ob-cow         # just these (always redone)
    python tools/gen_props.py --force        # redo all
"""
import argparse
import base64
import io
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)

MODEL = "gemini-3.1-flash-image"
OUT = gemini.ROOT / "public" / "art" / "props"
STYLE_REF = gemini.ROOT / "public" / "art" / "story" / "bg-patna-street.webp"  # the approved cutscene look
SIZE = 640  # longest side of the saved sprite

STYLE = (
    "A single game prop for a 3D endless-runner, in the exact rendering style of the reference image: a stylised "
    "3D animated feature film (Pixar / DreamWorks style), chunky simplified shapes, soft rounded edges, bold clear "
    "silhouette, bright clean colours, soft daylight. Not photorealistic. The prop is shown whole and alone, centred, "
    "filling most of the frame, on a perfectly flat pure magenta (#FF00FF) background with nothing else: no ground, "
    "no shadow, no other objects. No magenta or pink on the prop itself. No text, letters or watermark."
)
BEHIND = "Seen from behind and a little above, as a camera following along the road sees it."

# name: (aspect, what it is). wall = crash into it, low = jump over, high = duck under.
PROPS = {
    # --- road: crash
    "ob-auto": ("4:5", f"The back of a classic Indian auto-rickshaw, green body with a yellow canvas roof, chunky and "
                f"toy-like, red tail lights, a 'HORN OK PLEASE' style painted panel without readable text. {BEHIND}"),
    "ob-cow": ("4:3", "A big friendly white Indian cow with short curved horns and a little bell, standing completely "
               "side-on across the road (its whole side facing us, head turned to look at the camera), unbothered. "
               "Clearly a cow at a glance."),
    "ob-cart": ("4:3", f"A wooden fruit handcart (thela) piled high with yellow bananas and green coconuts, two big "
                f"wooden wheels, seen from its back end. {BEHIND}"),
    "ob-barricade": ("4:3", "A yellow-and-black striped metal police barricade standing across the road, with two "
                     "red warning lamps on top, seen from the front."),
    # --- road: jump over (low, about knee high)
    "ob-bricks": ("16:9", "A low, wide pile of red bricks and sand dumped across the road for building work, knee "
                  "high, with a little red warning flag on a stick. Seen from a little above."),
    "ob-cones": ("16:9", "A low road-works block: three orange-and-white traffic cones in a row with a striped "
                 "red-and-white plank resting across them, knee high. Seen from the front, a little above."),
    # --- road: duck under (high, with a clear gap underneath)
    "ob-banner": ("1:1", "A big colourful cloth flex banner with bold marigold and paisley patterns (saffron, teal and "
                  "yellow, no readable text), tied between two tall bamboo poles. The banner fills only the TOP third "
                  "of the picture; below it there is completely empty space between the two poles, down to the "
                  "bottom of the picture."),
    "ob-boom": ("1:1", "A red-and-white striped railway-crossing boom barrier lowered across the road at head height, "
                "with a red warning light on its post. The striped pole runs across the TOP third of the picture; "
                "below it is completely empty space down to the bottom of the picture, apart from the thin post on "
                "the left."),
    # --- tunnel: crash
    "tn-junk": ("4:3", "A heap of junk blocking a drain tunnel: stuffed garbage sacks, a broken wooden crate, an old "
                "tyre and a dented blue plastic drum. Chunky and readable."),
    # --- tunnel: jump over
    "tn-pipe": ("16:9", "A fat rusty orange water pipe lying across the floor on two concrete blocks, knee high, with "
                "a big red valve wheel on top and a little water dripping. Seen from the front, a little above."),
    # --- tunnel: duck under
    "tn-wires": ("1:1", "A thick tangle of black electric cables and a yellow DANGER-striped junction box hanging "
                 "down from above, with a few blue sparks. Everything hangs in the TOP third of the picture; below it "
                 "is completely empty space down to the bottom of the picture."),
}


def style_reference():
    image = Image.open(STYLE_REF).convert("RGB")
    image.thumbnail((1024, 1024))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=88)
    return {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(buffer.getvalue()).decode()}}


def magenta_to_alpha(image):
    """Prop on a flat magenta screen -> transparent RGBA, trimmed, with the pink fringe removed."""
    px = np.asarray(image.convert("RGB")).astype(np.float32)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    magenta = np.minimum(r, b) - g  # how much more red+blue than green
    alpha = np.clip((110 - magenta) / 60, 0, 1)  # > 110: screen, < 50: prop
    fringe = (magenta > 0) & (alpha > 0)
    px[..., 0] = np.where(fringe, np.minimum(r, g + 40), r)  # despill
    px[..., 2] = np.where(fringe, np.minimum(b, g + 40), b)
    rgba = np.dstack([px, alpha * 255]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    return out.crop(out.getbbox() or (0, 0, *out.size))


def make(name):
    aspect, what = PROPS[name]
    print(f"{name}: generating")
    response = gemini.request(f"models/{MODEL}:generateContent", {
        "contents": [{"parts": [style_reference(), {"text": f"{STYLE}\n\nThe prop: {what}"}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "1K"}},
    })
    _, data = gemini.inline_data(response)
    sprite = magenta_to_alpha(Image.open(io.BytesIO(data)))
    sprite.thumbnail((SIZE, SIZE), Image.LANCZOS)
    sprite.save(OUT / f"{name}.webp", quality=90)
    print(f"{name}: {sprite.size[0]}x{sprite.size[1]}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    todo = args.names or [n for n in PROPS if args.force or not (OUT / f"{n}.webp").exists()]
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(make, todo))


if __name__ == "__main__":
    main()
