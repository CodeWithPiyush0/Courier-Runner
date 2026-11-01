"""Draw the HUD / power-up icons locally as truck-art stickers (no API needed).

Each icon is drawn big with PIL shapes, given a dark outline and a thick white
sticker border, then shrunk to 256 px. A stand-in for the Gemini icons in
gen_images.py; rerun `npm run art` later to replace them.

    python tools/draw_icons.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ART = Path(__file__).resolve().parent.parent / "public" / "art"
S = 1024  # drawing size
INK = (40, 22, 48, 255)
SAFFRON, MARIGOLD, TEAL, PINK, CREAM = (255, 140, 26), (255, 190, 40), (0, 133, 128), (226, 40, 120), (255, 244, 220)
FONT = "C:/Windows/Fonts/Nirmala.ttc"  # has the ₹ sign and Devanagari


def canvas():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def shade(d, box, light, dark, steps=24, ellipse=True):
    """Fake a soft top-left light: stack shrinking shapes from dark to light."""
    x0, y0, x1, y1 = box
    for i in range(steps):
        t = i / (steps - 1)
        c = tuple(int(dark[k] + (light[k] - dark[k]) * t) for k in range(3)) + (255,)
        inset = t * (x1 - x0) * 0.18
        b = (x0 + inset * 0.6, y0 + inset * 0.6, x1 - inset * 1.4, y1 - inset * 1.4)
        (d.ellipse if ellipse else d.rounded_rectangle)(b, fill=c, **({} if ellipse else {"radius": 40}))


def layer(color, mask):
    img = Image.new("RGBA", (S, S), color)
    img.putalpha(mask)
    return img


def finish(art):
    alpha = art.split()[3]
    outline = alpha.filter(ImageFilter.MaxFilter(19))
    border = outline.filter(ImageFilter.MaxFilter(45))
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.alpha_composite(layer((20, 10, 30, 255), border.point(lambda v: int(v * 0.35)).filter(ImageFilter.GaussianBlur(14))).transform(
        (S, S), Image.AFFINE, (1, 0, -8, 0, 1, -16)))
    out.alpha_composite(layer((255, 255, 255, 255), border))
    out.alpha_composite(layer(INK, outline))
    out.alpha_composite(art)
    return out.resize((256, 256), Image.LANCZOS)


def coin():
    img, d = canvas()
    box = (172, 172, 852, 852)
    d.ellipse(box, fill=(176, 104, 10, 255))
    shade(d, (196, 196, 828, 828), (255, 226, 110), (214, 140, 16))
    d.ellipse((276, 276, 748, 748), outline=(184, 112, 12, 255), width=18)
    for i in range(24):  # rim dots, truck-art style
        a = i / 24 * math.tau
        cx, cy = 512 + 296 * math.cos(a), 512 + 296 * math.sin(a)
        d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), fill=(255, 244, 200, 255))
    font = ImageFont.truetype(FONT, 380, index=1)
    d.text((512, 520), "₹", font=font, fill=(150, 80, 6, 255), anchor="mm")
    d.text((500, 505), "₹", font=font, fill=(255, 248, 210, 255), anchor="mm")
    return img


def upi():
    img, d = canvas()
    d.rounded_rectangle((292, 120, 732, 904), radius=70, fill=(36, 28, 60, 255))
    d.rounded_rectangle((322, 200, 702, 800), radius=24, fill=CREAM + (255,))
    d.rounded_rectangle((452, 150, 572, 170), radius=10, fill=(90, 80, 120, 255))
    d.ellipse((482, 830, 542, 890), outline=(90, 80, 120, 255), width=10)
    # QR code
    random.seed(3)
    q0, cell = 372, 20
    for y in range(14):
        for x in range(14):
            if random.random() < 0.5:
                d.rectangle((q0 + x * cell, 300 + y * cell, q0 + x * cell + cell - 2, 300 + y * cell + cell - 2), fill=INK)
    for fx, fy in ((q0, 300), (q0 + 9 * cell, 300), (q0, 300 + 9 * cell)):
        d.rectangle((fx, fy, fx + 5 * cell, fy + 5 * cell), fill=CREAM + (255,))
        d.rectangle((fx, fy, fx + 5 * cell - 2, fy + 5 * cell - 2), outline=INK, width=cell)
        d.rectangle((fx + 2 * cell - 6, fy + 2 * cell - 6, fx + 3 * cell + 4, fy + 3 * cell + 4), fill=INK)
    d.rounded_rectangle((352, 640, 672, 740), radius=20, fill=TEAL + (255,))
    font = ImageFont.truetype(FONT, 76, index=1)
    d.text((512, 690), "PAID", font=font, fill=(255, 255, 255, 255), anchor="mm")
    # rupee sparks
    small = ImageFont.truetype(FONT, 150, index=1)
    for x, y, c in ((190, 300, MARIGOLD), (830, 240, SAFFRON), (840, 620, PINK)):
        d.text((x, y), "₹", font=small, fill=c + (255,), anchor="mm")
    return img


def helmet():
    img, d = canvas()
    d.pieslice((170, 160, 854, 864), 180, 360, fill=(170, 20, 30, 255))
    shade(d, (190, 180, 834, 844), (255, 90, 80), (190, 24, 34), steps=18)
    d.rounded_rectangle((300, 380, 724, 470), radius=40, fill=(40, 50, 80, 255))  # visor
    d.rounded_rectangle((330, 395, 520, 425), radius=14, fill=(140, 170, 220, 200))
    d.rectangle((420, 175, 604, 360), fill=MARIGOLD + (255,))  # centre stripe
    d.rectangle((150, 513, 874, 900), fill=(0, 0, 0, 0))
    d.rounded_rectangle((150, 480, 874, 560), radius=36, fill=(140, 16, 26, 255))  # rim
    d.arc((210, 400, 814, 760), 0, 180, fill=INK, width=22)  # chin strap
    d.ellipse((482, 730, 542, 790), fill=(200, 200, 210, 255), outline=INK, width=8)  # buckle
    for x, y in ((300, 300), (724, 300)):  # sticker dots
        d.ellipse((x - 30, y - 30, x + 30, y + 30), fill=CREAM + (255,))
    return img


def chai():
    img, d = canvas()
    # steam
    for x in (430, 520, 610):
        d.arc((x - 50, 110, x + 50, 260), 100, 260, fill=(255, 255, 255, 230), width=26)
        d.arc((x - 50, 230, x + 50, 380), 280, 80, fill=(255, 255, 255, 230), width=26)
    # cutting-chai glass: a tapered, ridged tumbler
    glass = [(300, 400), (724, 400), (672, 880), (352, 880)]
    d.polygon(glass, fill=(255, 255, 255, 120))
    d.polygon([(318, 470), (706, 470), (668, 860), (356, 860)], fill=(196, 120, 50, 255))
    d.polygon([(318, 470), (706, 470), (700, 520), (324, 520)], fill=(232, 176, 110, 255))  # froth
    for i in range(6):  # ridges
        x = 360 + i * 62
        d.line((x, 420, x + (512 - x) * 0.12, 870), fill=(255, 255, 255, 110), width=12)
    d.line((300, 400, 724, 400), fill=(255, 255, 255, 255), width=16)
    d.polygon([(330, 420), (370, 420), (400, 850), (372, 850)], fill=(255, 255, 255, 140))  # shine
    return img


def battery():
    img, d = canvas()
    d.rounded_rectangle((300, 150, 724, 900), radius=60, fill=(30, 40, 50, 255))
    d.rounded_rectangle((430, 100, 594, 170), radius=20, fill=(30, 40, 50, 255))
    d.rounded_rectangle((340, 190, 684, 860), radius=34, fill=(20, 26, 34, 255))
    for i in range(4):  # charge bars, full
        y = 220 + i * 160
        shade(d, (366, y, 658, y + 132), (150, 255, 120), (40, 170, 70), steps=10, ellipse=False)
    bolt = [(560, 250), (400, 560), (500, 560), (450, 800), (630, 460), (526, 460)]
    d.polygon([(x + 10, y + 10) for x, y in bolt], fill=(20, 60, 30, 200))
    d.polygon(bolt, fill=(255, 236, 90, 255), outline=INK)
    return img


ICONS = {"icon-coin": coin, "icon-magnet": upi, "icon-shield": helmet, "icon-boost": chai, "icon-battery": battery}


def main():
    for name, draw in ICONS.items():
        finish(draw()).save(ART / f"{name}.webp", quality=92)
        print(name)


if __name__ == "__main__":
    main()
