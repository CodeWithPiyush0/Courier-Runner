"""Re-render the painted art at 2K for crisp results on high-resolution screens.

Each image is sent to Gemini as its own reference and redrawn identically at
higher resolution, so nothing about the design changes. Transparent images
(sprites, cut-outs) are put on a green screen for the redraw and keyed out
again afterwards. Already-upscaled files are skipped (tracked in .upscaled).

    python tools/upscale_art.py                      # everything not yet done
    python tools/upscale_art.py story/cut-nani.webp  # just these (paths under public/art/)
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
from gen_images import green_to_alpha  # noqa: E402

sys.stdout.reconfigure(line_buffering=True)

MODEL = "gemini-3-pro-image"
ART = gemini.ROOT / "public" / "art"
DONE = ART / ".upscaled"
ASPECTS = {"1:1": 1, "2:3": 2 / 3, "3:2": 3 / 2, "3:4": 3 / 4, "4:3": 4 / 3, "4:5": 4 / 5, "5:4": 5 / 4,
           "9:16": 9 / 16, "16:9": 16 / 9, "21:9": 21 / 9}
# Longest side kept for each kind of picture.
MAX_SIZE = {"sprite": 1100, "cutout": 1400, "plate": 2400, "portrait": 512}
PROMPT = ("Redraw this exact image at high resolution with crisp, sharp detail. Keep everything identical: the "
          "characters, pose, framing, proportions, colours, lighting{bg}. Do not add, remove or move anything.")


def targets():
    files = [p for p in (ART / "sprites").glob("*.webp") if p.stem != "camera-guide"]
    files += sorted((ART / "story").glob("*.webp"))
    files += [ART / f"{n}.webp" for n in ("portrait-bholu", "portrait-nani", "portrait-security", "dispatch")]
    return [p for p in files if "-mouth" not in p.stem]


def kind_of(path):
    if path.parent.name == "sprites":
        return "sprite"
    if path.stem.startswith("cut-"):
        return "cutout"
    if path.stem.startswith(("portrait", "dispatch")):
        return "portrait"
    return "plate"


def redraw(path):
    kind = kind_of(path)
    source = Image.open(path).convert("RGBA")
    transparent = kind in ("sprite", "cutout")
    if transparent:  # back onto a green screen, with a margin
        canvas = Image.new("RGBA", (int(source.width * 1.2), int(source.height * 1.1)), (0, 255, 0, 255))
        canvas.alpha_composite(source, ((canvas.width - source.width) // 2, (canvas.height - source.height) // 2))
        source = canvas
    aspect = min(ASPECTS, key=lambda a: abs(ASPECTS[a] - source.width / source.height))
    buffer = io.BytesIO()
    source.convert("RGB").save(buffer, "PNG")
    response = gemini.request(f"models/{MODEL}:generateContent", {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(buffer.getvalue()).decode()}},
            {"text": PROMPT.format(bg=" and the flat pure green (#00FF00) background" if transparent else "")},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}},
    })
    _, data = gemini.inline_data(response)
    image = Image.open(io.BytesIO(data)).convert("RGB")
    if transparent:
        image = green_to_alpha(image)
    image.thumbnail((MAX_SIZE[kind],) * 2, Image.LANCZOS)
    image.save(path, quality=88 if transparent else 84)
    print(f"{path.relative_to(ART)}: {image.size[0]}x{image.size[1]}")
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    done = set(DONE.read_text().split()) if DONE.exists() else set()
    todo = [ART / p for p in args.paths] if args.paths else [p for p in targets() if str(p.relative_to(ART)) not in done]
    print(f"{len(todo)} to redraw")
    with ThreadPoolExecutor(args.workers) as pool:
        for path in pool.map(redraw, todo):
            done.add(str(path.relative_to(ART)).replace("\\", "/"))
            DONE.write_text("\n".join(sorted(done)))


if __name__ == "__main__":
    main()
