"""Turn images made elsewhere (e.g. by Codex / ChatGPT) into game art.

Name each file after its asset in gen_story_art.py or gen_images.py
(bg-office.png, keyart.png, ...) or after a sheet in SHEETS below, and point
this at the folder. Green-screen or transparent backgrounds both work. Each
image is keyed, sized and saved exactly as the Gemini generators would.
See art-requests/README.md for the brief these files come from.

    python tools/import_art.py art-requests/out            # new or changed files only
    python tools/import_art.py art-requests/out --force    # everything again
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_images  # noqa: E402
import gen_story_art  # noqa: E402

GREEN = (0, 255, 0)
# Several assets drawn in one image to save generations: a grid of (columns, rows), read left to right,
# top to bottom. None skips a cell (art that has since been replaced by another sheet).
SHEETS = {
    "sheet-bholu-1": ((2, 2), ["sprite-ride", "sprite-left", "sprite-right", "sprite-jump"]),
    "sheet-bholu-2": ((2, 2), ["sprite-slide", "sprite-hit", "sprite-cheer", None]),
    "sheet-mamu": ((3, 1), ["cut-mamu", "cut-mamu-laugh", "chaser-mamu"]),
    "sheet-bholu-faces": ((2, 2), ["cut-bholu-talk", "cut-bholu-grin", "cut-bholu-shock", "cut-bholu-wave"]),
    "sheet-elders": ((2, 1), ["cut-nani", "cut-mishra"]),
}
# Radio / subtitle portraits cropped from a cut-out instead of drawn separately.
PORTRAITS = {"cut-mamu": "portrait-mamu", "cut-bholu-talk": "portrait-bholu", "cut-nani": "portrait-nani", "cut-mishra": "dispatch"}


def on_green(image):
    """Flatten any transparency onto the green screen the keyer expects."""
    image = image.convert("RGBA")
    flat = Image.new("RGBA", image.size, GREEN + (255,))
    flat.alpha_composite(image)
    return flat.convert("RGB")


def solid_mask(image):
    """True wherever the image isn't green screen."""
    px = np.asarray(image).astype(int)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    return ~((g > 150) & (g > r + 60) & (g > b + 60))


def cuts(coverage, parts):
    """Where to split a sheet into `parts` along one axis: the emptiest line near each even split
    (figures are rarely exactly centred in their cells). coverage: solid pixels per line."""
    size = len(coverage)
    lines = [0]
    for k in range(1, parts):
        nominal = round(k * size / parts)
        window = int(size / parts * 0.2)
        candidates = range(nominal - window, nominal + window)
        lines.append(min(candidates, key=lambda x: (coverage[x], abs(x - nominal))))
    return lines + [size]


def drop_strays(cell):
    """Paint out bits of a neighbouring figure that a sheet cut left on the cell's edge.
    Loose pieces that don't touch the edge (dust puffs, sparks) are kept."""
    labels, count = ndimage.label(solid_mask(cell))
    if count < 2:
        return cell
    sizes = np.bincount(labels.ravel())[1:]
    edges = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    stray = [i + 1 for i, size in enumerate(sizes) if i + 1 in edges and size < sizes.max() * 0.15]
    px = np.asarray(cell).copy()
    px[np.isin(labels, stray)] = GREEN
    return Image.fromarray(px)


def subject_box(image, margin=0.04):
    """Bounding box of everything that isn't green screen, plus a margin."""
    ys, xs = np.nonzero(solid_mask(image))
    if not len(xs):
        return (0, 0, *image.size)
    pad = int(max(image.size) * margin)
    return (max(0, xs.min() - pad), max(0, ys.min() - pad),
            min(image.width, xs.max() + pad), min(image.height, ys.max() + pad))


def pad_to(image, aspect):
    """Pad with green to a width/height aspect, keeping the subject bottom-centred."""
    w, h = image.size
    if w / h < aspect:
        size = (round(h * aspect), h)
    else:
        size = (w, round(w / aspect))
    canvas = Image.new("RGB", size, GREEN)
    canvas.paste(image, ((size[0] - w) // 2, size[1] - h))
    return canvas


def save_asset(name, image):
    if name in gen_story_art.ASSETS:
        folder, aspect, kind, _, _ = gen_story_art.ASSETS[name]
        if kind in ("sprite", "cutout"):
            image = image.crop(subject_box(image))
            a, b = map(int, aspect.split(":"))
            image = pad_to(image, a / b)
        gen_story_art.save(gen_story_art.ART / folder / f"{name}.webp", kind, image)
    elif name in gen_images.ASSETS:
        gen_images.save(name, gen_images.ASSETS[name][2], image)
    else:
        print(f"  skipped {name}: not a known asset")
        return
    print(f"  {name}: {image.size[0]}x{image.size[1]}")


def portrait_from_cutout(cutout):
    """Head-and-shoulders radio portrait from a waist-up cut-out, on a warm backdrop."""
    x0, y0, x1, _ = subject_box(cutout, margin=0)
    side = int((x1 - x0) * 0.8)
    cx = (x0 + x1) // 2
    top = y0 - side // 12
    padded = ImageOps.expand(cutout, border=side, fill=GREEN)  # the square may run past the cut-out's edges
    left = cx - side // 2 + side  # in padded coordinates
    head = gen_images.green_to_alpha(padded.crop((left, top + side, left + side, top + 2 * side)))
    back = Image.new("RGBA", (side, side))
    draw = ImageDraw.Draw(back)
    for y in range(side):  # saffron to rani pink, like the UI
        t = y / side
        draw.line([(0, y), (side, y)], fill=(255, int(150 - 90 * t), int(40 + 80 * t), 255))
    back = back.filter(ImageFilter.GaussianBlur(4))
    back.alpha_composite(head, ((side - head.width) // 2, side - head.height))
    return back.convert("RGB")


def main():
    folder = Path(sys.argv[1])
    force = "--force" in sys.argv
    # Files already imported unchanged are skipped, so re-running doesn't redo (and
    # switch off the lip-sync of) cut-outs that haven't been redrawn.
    done_file = folder / ".imported.json"
    done = json.loads(done_file.read_text()) if done_file.exists() else {}
    for file in sorted(folder.iterdir()):
        if file.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        digest = hashlib.sha1(file.read_bytes()).hexdigest()
        if done.get(file.name) == digest and not force:
            print(f"{file.name}: unchanged, skipped")
            continue
        done[file.name] = digest
        print(file.name)
        image = on_green(Image.open(file))
        if file.stem in SHEETS:
            (cols, rows), names = SHEETS[file.stem]
            solid = solid_mask(image)
            xs = cuts(solid.sum(0), cols)
            for i, name in enumerate(names):
                c, r = i % cols, i // cols
                ys = cuts(solid[:, xs[c]:xs[c + 1]].sum(1), rows)  # rows may split at different heights per column
                cell = drop_strays(image.crop((xs[c], ys[r], xs[c + 1], ys[r + 1])))
                if name is None:
                    continue
                save_asset(name, cell)
                portrait = PORTRAITS.get(name)
                if portrait and not (folder / f"{portrait}.png").exists():
                    save_asset(portrait, portrait_from_cutout(cell.crop(subject_box(cell))))
        else:
            save_asset(file.stem, image)
        done_file.write_text(json.dumps(done, indent=1))


if __name__ == "__main__":
    main()
