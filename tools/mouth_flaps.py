"""Make the "mouth open" frames for lip-flapping in cutscenes.

For each cut-out, Gemini redraws the same picture with the mouth open mid-word
(in the character's own style: their teeth, lips, moustache). That frame is
aligned to the original, and only a soft-edged patch round the mouth and jaw is
kept. The game shows the patch while the voice is loud, so the face itself
never changes. Mouth positions below are fractions of each image (measured by
eye); re-measure if a cut-out is redrawn.

Gemini's frames are cached in tools/out/mouth-frames/ against the cut-out they
were made from, so re-running only calls the API for new or changed cut-outs.

Writes public/art/story/<name>-mouth.webp and mouths.json, and a before/after
preview to tools/out/mouths-preview.png.

    python tools/mouth_flaps.py
    python tools/mouth_flaps.py cut-nani      # just this one (frame redrawn)
"""
import argparse
import base64
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gemini  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STORY = ROOT / "public" / "art" / "story"
FRAMES = ROOT / "tools" / "out" / "mouth-frames"
MODEL = "gemini-3.1-flash-image"
GREEN = (0, 255, 0)

# name: (mouth centre x, centre y, mouth width), as fractions of the image.
MOUTHS = {
    "cut-riya-talk": (0.595, 0.357, 0.11),
    "cut-riya-grin": (0.572, 0.385, 0.12),
    "cut-riya-shock": (0.523, 0.381, 0.066),
    "cut-riya-wave": (0.58, 0.354, 0.11),
    "cut-mishra": (0.496, 0.347, 0.088),
    "cut-nani": (0.529, 0.353, 0.12),
    "cut-mamu": (0.49, 0.305, 0.095),
    "cut-mamu-laugh": (0.512, 0.27, 0.11),
}
PROMPT = (
    "Edit this picture. Change ONLY the mouth: open it naturally, as if caught in the middle of saying 'aah' while "
    "talking: the jaw drops a little and the teeth and tongue show, drawn in exactly the same style as the rest of "
    "the face. Everything else must stay exactly the same: the same face, eyes, eyebrows, expression, hair, "
    "clothes, pose, framing, size, colours, lighting and the flat green background."
)


def flat(image):
    """The cut-out on the flat green it was drawn on (what Gemini sees and returns)."""
    canvas = Image.new("RGBA", image.size, GREEN + (255,))
    canvas.alpha_composite(image)
    return canvas.convert("RGB")


def open_frame(name, image):
    """Gemini's open-mouth version of the cut-out (cached), resized to match it."""
    FRAMES.mkdir(parents=True, exist_ok=True)
    source = flat(image)
    buffer = io.BytesIO()
    source.save(buffer, "PNG")
    digest = hashlib.sha1(buffer.getvalue()).hexdigest()[:12]
    cached = FRAMES / f"{name}-{digest}.png"
    if not cached.exists():
        print(f"{name}: asking Gemini for the open mouth")
        w, h = image.size
        aspect = min(["3:4", "1:1", "4:3", "2:3", "4:5"], key=lambda a: abs(int(a.split(":")[0]) / int(a.split(":")[1]) - w / h))
        response = gemini.request(f"models/{MODEL}:generateContent", {
            "contents": [{"parts": [
                {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(buffer.getvalue()).decode()}},
                {"text": PROMPT},
            ]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "1K"}},
        })
        _, data = gemini.inline_data(response)
        Image.open(io.BytesIO(data)).convert("RGB").save(cached)
    return Image.open(cached).convert("RGB").resize(image.size, Image.LANCZOS)


def align(original, edited, box):
    """Shift `edited` so its face lines up with `original` (phase correlation on the face area)."""
    a = np.asarray(original.convert("L").crop(box), dtype=np.float32)
    b = np.asarray(edited.convert("L").crop(box), dtype=np.float32)
    window = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    fa, fb = np.fft.fft2((a - a.mean()) * window), np.fft.fft2((b - b.mean()) * window)
    cross = fa * np.conj(fb)
    peak = np.unravel_index(np.argmax(np.abs(np.fft.ifft2(cross / (np.abs(cross) + 1e-6)))), a.shape)
    dy, dx = [p - s if p > s // 2 else p for p, s in zip(peak, a.shape)]
    return edited.transform(edited.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.BICUBIC), (dx, dy)


def soft_ellipse(size, box, blur):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    return np.asarray(mask.filter(ImageFilter.GaussianBlur(blur)), dtype=np.float32) / 255


def make_patch(name, cx, cy, mw):
    image = Image.open(STORY / f"{name}.webp").convert("RGBA")
    w, h = image.size
    cx, cy, mw = cx * w, cy * h, mw * w
    face = (int(cx - mw * 2.2), int(cy - mw * 2.4), int(cx + mw * 2.2), int(cy + mw * 1.6))
    edited, shift = align(flat(image), open_frame(name, image), face)

    # Keep a soft patch from under the nose to below the chin.
    box = (int(cx - mw * 1.0), int(cy - mw * 0.45), int(cx + mw * 1.0), int(cy + mw * 1.15))
    rw, rh = box[2] - box[0], box[3] - box[1]
    lx, ly = cx - box[0], cy - box[1]
    keep = soft_ellipse((rw, rh), (lx - mw * 0.8, ly - mw * 0.32, lx + mw * 0.8, ly + mw * 1.0), mw * 0.1)
    rgb = np.asarray(edited.crop(box), dtype=np.float32)
    original = np.asarray(image.crop(box), dtype=np.float32)
    original_alpha = original[..., 3] / 255
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    screen = ((g > r + 50) & (g > b + 50))[..., None]  # green screen showing where the face moved
    rgb = np.where(screen, original[..., :3], rgb)
    patch = np.dstack([rgb, keep * original_alpha * 255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(patch, "RGBA").save(STORY / f"{name}-mouth.webp", quality=92)

    talking = image.copy()
    talking.alpha_composite(Image.fromarray(patch, "RGBA"), box[:2])
    pad = int(mw * 0.4)
    view = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    rect = {"x": box[0] / w, "y": box[1] / h, "w": rw / w, "h": rh / h}
    print(f"{name}: done (aligned by {shift})")
    return rect, image.crop(view), talking.crop(view)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    args = parser.parse_args()
    for name in args.names:  # named ones get a fresh frame
        for old in FRAMES.glob(f"{name}-*.png"):
            old.unlink()
    table_file = STORY / "mouths.json"
    table = json.loads(table_file.read_text()) if table_file.exists() else {}
    previews = []
    for name, spot in MOUTHS.items():
        if not (STORY / f"{name}.webp").exists():
            continue
        rect, closed, opened = make_patch(name, *spot)
        table[name] = rect
        previews.append((closed, opened))
    table_file.write_text(json.dumps(table, indent=1))
    size = 240
    sheet = Image.new("RGB", (size * 2 + 30, (size + 10) * len(previews)), (18, 22, 51))
    for i, pair in enumerate(previews):
        for j, im in enumerate(pair):
            tile = Image.new("RGBA", im.size, (18, 22, 51, 255))
            tile.alpha_composite(im)
            sheet.paste(tile.convert("RGB").resize((size, size)), (10 + j * (size + 10), i * (size + 10)))
    out = ROOT / "tools" / "out"
    out.mkdir(exist_ok=True)
    sheet.save(out / "mouths-preview.png")


if __name__ == "__main__":
    sys.exit(main())
