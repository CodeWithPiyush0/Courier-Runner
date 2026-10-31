"""Generate the game's 2D art with Gemini image models.

Writes web-ready files to public/art/. Existing files are skipped unless named
or --force is given, so you can regenerate one piece at a time:

    python tools/gen_images.py                  # everything missing
    python tools/gen_images.py dispatch keyart  # just these (always redone)
    python tools/gen_images.py --force          # redo all
"""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)  # show progress live when piped to a log

OUT = gemini.ROOT / "public" / "art"
PRO = "gemini-3-pro-image"
FAST = "gemini-3.1-flash-image"

STYLE = (
    "Stylised low-poly 3D render, flat-shaded faceted polygons, clean shapes, soft rim lighting. "
    "Cool sci-fi palette of deep navy, electric cyan and magenta with warm coral-orange accents. "
    "Playful, slightly funny mood. No text, no letters, no logos, no watermark."
)
ICON = (
    "A single video-game power-up icon, centred, filling about 70% of the frame, glowing neon edges, "
    "faceted low-poly 3D, on a pure solid black background with nothing else. No text, no letters."
)

# name: (model, aspect ratio, kind, prompt). kind decides the post-processing.
ASSETS = {
    "keyart": (PRO, "16:9", "cover", f"""Video game key art. A space courier in a white suit and a round helmet
with a glowing cyan visor rides a sleek hoverboard, an orange parcel with tape strapped to their back, bursting
out of a neon-lit octagonal space-station tunnel. Behind them a small red-eyed security drone gives chase.
The lower part of the scene breaks into a deep teal ocean with pink coral, kelp and bubbles, where a giant
anglerfish with a glowing lure opens its toothy jaws. Dynamic, wide shot, lots of motion. {STYLE}"""),
    "keyart-tall": (PRO, "9:16", "cover", f"""Vertical phone wallpaper video game key art. A space courier in a
white suit and a round helmet with a glowing cyan visor rides a sleek hoverboard, an orange parcel strapped to
their back, diving down from a neon octagonal space-station tunnel at the top into a deep teal ocean at the
bottom with pink coral, kelp, bubbles and a giant anglerfish with a glowing lure below. A small red-eyed
security drone chases from above. {STYLE}"""),
    "dispatch": (PRO, "1:1", "portrait", f"""Head-and-shoulders character portrait of 'Dispatch', a cheerful,
slightly frazzled middle-aged Indian mission-control operator with a thick moustache and a raised eyebrow,
wearing a radio headset with a microphone and a navy uniform with an orange parcel badge, holding a small
glass of chai. Behind him glowing control-room monitors of a space station. Friendly comedic expression,
looking at the viewer, centred. {STYLE}"""),
    "icon-magnet": (FAST, "1:1", "icon", f"{ICON} A horseshoe magnet, red with bright white tips, sparks."),
    "icon-shield": (FAST, "1:1", "icon", f"{ICON} A hexagonal cyan energy shield bubble."),
    "icon-boost": (FAST, "1:1", "icon", f"{ICON} A bright yellow double chevron arrow with a rocket flame."),
    "icon-oxygen": (FAST, "1:1", "icon", f"{ICON} A cluster of three shiny light-blue air bubbles."),
    "icon-coin": (FAST, "1:1", "icon", f"{ICON} A faceted mint-green crystal gem, octahedron shaped."),
    "emblem": (PRO, "1:1", "icon", f"""A video game emblem: an orange cardboard parcel with small cyan
glowing wings and a speed trail, riding a tiny hoverboard, bold and simple silhouette, faceted low-poly 3D,
centred on a pure solid black background with nothing else. No text, no letters."""),
}


def generate(model, aspect, prompt):
    response = gemini.request(f"models/{model}:generateContent", {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}},
    })
    _, data = gemini.inline_data(response)
    return Image.open(io.BytesIO(data)).convert("RGB")


def black_to_alpha(image):
    """Glowing art on black -> transparent PNG-style RGBA (like a 'screen' blend baked in)."""
    rgba = []
    pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
    for r, g, b in pixels:
        a = max(r, g, b)
        a = 0 if a < 14 else min(255, int((a - 14) * 255 / 200))
        if a == 0:
            rgba.append((0, 0, 0, 0))
        else:
            scale = 255 / max(r, g, b)
            rgba.append((min(255, int(r * scale)), min(255, int(g * scale)), min(255, int(b * scale)), a))
    out = Image.new("RGBA", image.size)
    out.putdata(rgba)
    return out


def save(name, kind, image):
    if kind == "cover":
        image.thumbnail((1920, 1920))
        image.save(OUT / f"{name}.webp", quality=80)
    elif kind == "portrait":
        image.resize((384, 384), Image.LANCZOS).save(OUT / f"{name}.webp", quality=85)
    else:
        icon = black_to_alpha(image.resize((256, 256), Image.LANCZOS))
        icon.save(OUT / f"{name}.webp", quality=90)
        if name == "emblem":
            icon.resize((64, 64), Image.LANCZOS).save(OUT / "favicon.png")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    for name in args.names or ASSETS:
        model, aspect, kind, prompt = ASSETS[name]
        if not (args.names or args.force) and (OUT / f"{name}.webp").exists():
            continue
        print(f"{name} ({model}, {aspect})")
        image = generate(model, aspect, " ".join(prompt.split()))
        save(name, kind, image)
    print("done:", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
