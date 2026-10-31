"""Make "mouth open" patches for lip-flapping, locally (no AI calls).

The lower lip and chin under each cut-out's mouth are pulled down a little,
the gap between the lips is painted as the inside of a mouth (teeth, a hint of
tongue), and only a soft-edged patch round the mouth is kept. Mouth positions
are given below as fractions of each image (measured by eye from the art);
re-measure them if a cut-out is redrawn.

Writes public/art/story/<name>-mouth.webp and mouths.json, and a before/after
preview to tools/out/mouths-preview.png.

    python tools/mouth_flaps.py
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
STORY = ROOT / "public" / "art" / "story"

# name: (mouth centre x, centre y, mouth width), as fractions of the image.
MOUTHS = {
    "cut-riya-talk": (0.665, 0.348, 0.11),
    "cut-riya-grin": (0.59, 0.31, 0.12),
    "cut-riya-shock": (0.57, 0.21, 0.07),
    "cut-riya-wave": (0.585, 0.38, 0.11),
    "cut-mishra": (0.515, 0.335, 0.12),
    "cut-nani": (0.53, 0.405, 0.17),
}
OPEN = 0.3  # how far the jaw drops, as a fraction of the mouth width
INSIDE = (52, 14, 20)
TEETH = (240, 232, 220)
TONGUE = (150, 52, 66)


def soft_ellipse(size, box, blur):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    return np.asarray(mask.filter(ImageFilter.GaussianBlur(blur)), dtype=np.float32) / 255


def make_patch(name, cx, cy, mw):
    image = Image.open(STORY / f"{name}.webp").convert("RGBA")
    w, h = image.size
    cx, cy, mw = cx * w, cy * h, mw * w
    # Region: a bit wider than the mouth, from the nose down to the chin.
    box = (int(cx - mw), int(cy - mw * 0.6), int(cx + mw), int(cy + mw * 1.2))
    region = np.asarray(image.crop(box), dtype=np.float32)
    rh, rw = region.shape[:2]
    lx, ly = cx - box[0], cy - box[1]  # mouth centre inside the region
    drop = OPEN * mw

    # Pull everything below the lip line down, most at the lips, fading towards
    # the chin and towards the mouth corners.
    ys, xs = np.mgrid[0:rh, 0:rw].astype(np.float32)
    across = np.clip(1 - np.abs(xs - lx) / (mw * 0.75), 0, 1) ** 0.6
    down = np.clip(1 - (ys - ly) / (rh - ly), 0, 1) * (ys > ly)
    source_y = np.clip(ys - drop * down * across, 0, rh - 1)
    y0 = np.floor(source_y).astype(int)
    y1 = np.minimum(y0 + 1, rh - 1)
    t = (source_y - y0)[..., None]
    xi = xs.astype(int)
    warped = region[y0, xi] * (1 - t) + region[y1, xi] * t

    # Paint the open mouth into the gap: dark inside, teeth along the top, tongue below.
    size = (rw, rh)
    gap = (lx - mw * 0.36, ly - drop * 0.08, lx + mw * 0.36, ly + drop * 0.95)
    inside = soft_ellipse(size, gap, max(1.5, mw * 0.03))[..., None]
    teeth = soft_ellipse(size, (gap[0] + mw * 0.06, gap[1], gap[2] - mw * 0.06, gap[1] + drop * 0.32), 1.2)[..., None]
    tongue = soft_ellipse(size, (lx - mw * 0.2, ly + drop * 0.5, lx + mw * 0.2, gap[3] + drop * 0.2), 2)[..., None]
    rgb = warped[..., :3]
    rgb = rgb * (1 - inside) + np.array(INSIDE) * inside
    rgb = rgb * (1 - teeth * inside * 0.85) + np.array(TEETH) * teeth * inside * 0.85
    rgb = rgb * (1 - tongue * inside * 0.7) + np.array(TONGUE) * tongue * inside * 0.7

    # Keep only a soft patch round the mouth and jaw.
    keep = soft_ellipse(size, (lx - mw * 0.85, ly - mw * 0.25, lx + mw * 0.85, rh - mw * 0.05), mw * 0.12)
    alpha = keep * (region[..., 3] / 255)
    patch = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(patch, "RGBA").save(STORY / f"{name}-mouth.webp", quality=92)
    rect = {"x": box[0] / w, "y": box[1] / h, "w": rw / w, "h": rh / h}
    talking = image.copy()
    talking.alpha_composite(Image.fromarray(patch, "RGBA"), box[:2])
    pad = int(mw * 0.4)
    view = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    return rect, image.crop(view), talking.crop(view)


def main():
    table = {}
    previews = []
    for name, spot in MOUTHS.items():
        rect, closed, opened = make_patch(name, *spot)
        table[name] = rect
        previews.append((closed, opened))
        print(f"{name}: done")
    (STORY / "mouths.json").write_text(json.dumps(table, indent=1))
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
