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
    "Warm palette inspired by Indian truck art: saffron, marigold, deep teal, rani pink and cream on deep "
    "indigo. Playful, slightly funny mood. No text, no letters, no logos, no watermark."
)
STICKER = (
    "A single simple die-cut sticker icon in the style of hand-painted Indian truck art: one bold object, very "
    "little detail so it reads at tiny sizes, flat colours with a dark outline and a thick white sticker border, "
    "centred, filling about 75% of the frame, on a perfectly flat pure green (#00FF00) background with nothing "
    "else. No text, no letters, no decorative frame."
)
# The hero, described once so every image of her matches the 3D model.
RIYA = (
    "Riya, a 19-year-old young woman from Patna, Bihar, with warm brown skin, big expressive eyes, a small black "
    "bindi, a confident grin and a long thick black braid tied with a marigold-orange band. She wears an open "
    "saffron courier half-helmet with a teal stripe and stickers, flight goggles pushed up, a deep teal courier "
    "jacket with saffron reflective stripes and rolled sleeves, a rani-pink and yellow Madhubani-patterned "
    "dupatta scarf, indigo cargo pants and white sneakers. A taped cardboard parcel is strapped to her back, "
    "faint teal light glowing from its seams."
)
BOARD = "a hoverboard hand-painted like an Indian truck, saffron with pink and teal patterns"

# name: (model, aspect ratio, kind, prompt). kind decides the post-processing.
ASSETS = {
    "keyart": (PRO, "16:9", "cover", f"""Video game key art, real-world India today, not futuristic. {RIYA} She rides a
mint-green Indian scooter at full tilt through a crowded old Patna street at golden hour, weaving between an auto-rickshaw
and a cow, a traffic policeman with a white helmet and mirrored sunglasses chasing on a police motorbike, whistle
blowing. A concrete underpass mouth ahead, litchi trees in the far distance. Dynamic wide shot, Riya on the left third.
Gently stylised 3D render like a modern animated film, warm colours. No text, no logos."""),
    "keyart-tall": (PRO, "9:16", "cover", f"""Vertical phone wallpaper video game key art, real-world India today. {RIYA} She
rides a mint-green Indian scooter towards us through a crowded Patna street at golden hour, a traffic policeman on a police
motorbike chasing behind, autos and a cow around, litchi trees and a village house far away. Riya in the upper half.
Gently stylised 3D render like a modern animated film, warm colours. No text, no logos."""),
    "portrait-riya": (PRO, "1:1", "portrait", f"""Head-and-shoulders character portrait. {RIYA} She looks at the
viewer with a cheeky, determined grin, one hand giving a thumbs up. Background: a softly blurred station
tunnel with warm lights. Centred. {STYLE}"""),
    "portrait-nani": (PRO, "1:1", "portrait", f"""Head-and-shoulders character portrait of Nani, a cheerful
elderly grandmother from Bihar with silver hair in a bun, round glasses, a red bindi and a warm wrinkled smile,
wearing a cream saree with a red border and a woollen shawl, holding a steel tumbler of chai. Background: the
cosy inside of an underwater coral cottage with round bubble windows and fish outside. Centred. {STYLE}"""),
    "portrait-security": (PRO, "1:1", "portrait", f"""Character portrait of a stern little station security
drone: a round dark-metal body, one big red glowing eye, four small rotors, a red and blue siren on top and a
tiny police-style peaked cap perched on it. Comically serious expression. Background: a softly blurred
space-station tunnel. Centred. {STYLE}"""),
    "dispatch": (PRO, "1:1", "portrait", f"""Head-and-shoulders character portrait of 'Dispatch', a cheerful,
slightly frazzled middle-aged Indian mission-control operator with a thick moustache and a raised eyebrow,
wearing a radio headset with a microphone and a navy uniform with an orange parcel badge, holding a small
glass of chai. Behind him glowing control-room monitors of a space station. Friendly comedic expression,
looking at the viewer, centred. {STYLE}"""),
    "icon-magnet": (FAST, "1:1", "sticker", f"{STICKER} A phone showing a UPI QR code, with little rupee sparks."),
    "icon-shield": (FAST, "1:1", "sticker", f"{STICKER} A red scooter helmet with a dark visor."),
    "icon-boost": (FAST, "1:1", "sticker", f"{STICKER} A small glass of steaming cutting chai."),
    "icon-battery": (FAST, "1:1", "sticker", f"{STICKER} A green phone battery, fully charged, with a lightning bolt."),
    "icon-coin": (FAST, "1:1", "sticker", f"{STICKER} A shiny gold Indian rupee coin with the ₹ symbol."),
    "emblem": (PRO, "1:1", "sticker", f"""A die-cut sticker emblem in the style of hand-painted Indian truck
art: a taped cardboard parcel with small saffron wings riding a tiny painted hoverboard, a marigold garland
around it, bold dark outlines and a thick white sticker border, centred on a perfectly flat pure green (#00FF00)
background with nothing else. No text, no letters."""),
}


def generate(model, aspect, prompt):
    response = gemini.request(f"models/{model}:generateContent", {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}},
    })
    _, data = gemini.inline_data(response)
    return Image.open(io.BytesIO(data)).convert("RGB")


def green_to_alpha(image):
    """Sticker art on a flat green screen -> transparent RGBA, with soft edges and the green spill removed."""
    rgba = []
    pixels = image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()
    for r, g, b in pixels:
        greenness = g - max(r, b)
        if greenness > 90:
            rgba.append((0, 0, 0, 0))
            continue
        alpha = 255 if greenness < 40 else int(255 * (90 - greenness) / 50)
        if greenness > 0:
            g = max(r, b)  # despill the green fringe
        rgba.append((r, g, b, alpha))
    out = Image.new("RGBA", image.size)
    out.putdata(rgba)
    return out.crop(out.getbbox() or (0, 0, *out.size))


def square(image, size):
    """Fit a cut-out into a transparent size x size square, centred."""
    image.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def save(name, kind, image):
    if kind == "cover":
        image.thumbnail((1920, 1920))
        image.save(OUT / f"{name}.webp", quality=80)
    elif kind == "portrait":
        image.resize((384, 384), Image.LANCZOS).save(OUT / f"{name}.webp", quality=85)
    else:
        cutout = green_to_alpha(image)
        square(cutout.copy(), 256).save(OUT / f"{name}.webp", quality=90)
        if name == "emblem":
            square(cutout.copy(), 64).save(OUT / "favicon.png")
            for size in (192, 512):  # home-screen app icons on the game's indigo
                icon = Image.new("RGBA", (size, size), (18, 22, 51, 255))
                icon.alpha_composite(square(cutout.copy(), int(size * 0.84)), (int(size * 0.08),) * 2)
                icon.convert("RGB").save(OUT / f"app-icon-{size}.png")


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
