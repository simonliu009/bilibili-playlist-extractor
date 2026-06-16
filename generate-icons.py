#!/usr/bin/env python3
"""
Generate the extension icons from a Pillow drawing pipeline.

This script does not write bytecode caches and can be run directly:
  python3 generate-icons.py
"""

import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SIZES = (16, 48, 128)

BG_TOP = (255, 77, 125, 255)
BG_MID = (255, 138, 61, 255)
BG_BOTTOM = (255, 209, 61, 255)
PAGE_BACK = (47, 216, 255, 255)
PAGE_FRONT = (255, 255, 255, 255)
PINK = (255, 77, 125, 255)
LINE = (232, 238, 248, 255)
LINE_2 = (255, 209, 222, 255)
WHITE = (255, 255, 255, 255)
INK = (35, 32, 74, 255)
CYAN = (0, 229, 255, 255)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
]


def find_font(size):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def lerp(a, b, t):
    return int(round(a * (1 - t) + b * t))


def gradient_background(size):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        if t < 0.5:
            tt = t / 0.5
            rgb = (
                lerp(BG_TOP[0], BG_MID[0], tt),
                lerp(BG_TOP[1], BG_MID[1], tt),
                lerp(BG_TOP[2], BG_MID[2], tt),
            )
        else:
            tt = (t - 0.5) / 0.5
            rgb = (
                lerp(BG_MID[0], BG_BOTTOM[0], tt),
                lerp(BG_MID[1], BG_BOTTOM[1], tt),
                lerp(BG_MID[2], BG_BOTTOM[2], tt),
            )
        for x in range(size):
            px[x, y] = (*rgb, 255)
    return img


def rounded_box_layer(size, box, radius, fill):
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle(box, radius=radius, fill=fill)
    return layer


def draw_icon(size):
    scale = size / 128
    img = gradient_background(size)

    # Decorative bubbles
    draw = ImageDraw.Draw(img)
    draw.ellipse((102 * scale, 14 * scale, 118 * scale, 30 * scale), fill=(255, 255, 255, 46))
    draw.ellipse((18 * scale, 98 * scale, 36 * scale, 116 * scale), fill=(0, 229, 255, 56))

    # Pages with shadows
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((20 * scale, 38 * scale, 94 * scale, 122 * scale), radius=16 * scale, fill=(0, 0, 0, 72))
    sdraw.rounded_rectangle((42 * scale, 12 * scale, 116 * scale, 96 * scale), radius=16 * scale, fill=(0, 0, 0, 58))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, int(round(6 * scale)))))
    img = Image.alpha_composite(img, shadow)

    img = Image.alpha_composite(
        img, rounded_box_layer(size, (20 * scale, 38 * scale, 94 * scale, 122 * scale), 16 * scale, PAGE_BACK)
    )
    img = Image.alpha_composite(
        img, rounded_box_layer(size, (42 * scale, 12 * scale, 116 * scale, 96 * scale), 16 * scale, PAGE_FRONT)
    )

    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((42 * scale, 22 * scale, 82 * scale, 30 * scale), radius=4 * scale, fill=LINE_2)
    draw.rounded_rectangle((42 * scale, 38 * scale, 72 * scale, 46 * scale), radius=4 * scale, fill=LINE)
    draw.rounded_rectangle((42 * scale, 54 * scale, 76 * scale, 62 * scale), radius=4 * scale, fill=LINE)
    draw.rounded_rectangle((42 * scale, 70 * scale, 64 * scale, 78 * scale), radius=4 * scale, fill=LINE)
    draw.rounded_rectangle((76 * scale, 22 * scale, 90 * scale, 36 * scale), radius=4 * scale, fill=PINK)
    draw.polygon(
        [(80 * scale, 25.5 * scale), (86 * scale, 29.5 * scale), (80 * scale, 33.5 * scale)],
        fill=WHITE,
    )

    # Solid centered M. Use font metrics for accurate centering.
    font = find_font(max(12, int(round(88 * scale))))
    stroke = max(1, int(round(4 * scale)))
    bbox = draw.textbbox((0, 0), "M", font=font, stroke_width=stroke)
    x = (size - (bbox[2] - bbox[0])) / 2 - bbox[0]
    y = (size - (bbox[3] - bbox[1])) / 2 - bbox[1] - 2 * scale
    draw.text((x, y), "M", font=font, fill=WHITE, stroke_width=stroke, stroke_fill=INK)

    # Small accent diamonds
    draw.polygon(
        [(62 * scale, 96 * scale), (68 * scale, 90 * scale), (74 * scale, 96 * scale), (68 * scale, 102 * scale)],
        fill=PINK,
    )
    draw.polygon(
        [(74 * scale, 96 * scale), (78 * scale, 92 * scale), (82 * scale, 96 * scale), (78 * scale, 100 * scale)],
        fill=CYAN,
    )

    return img


def main():
    for size in SIZES:
        icon = draw_icon(size)
        icon.save(ROOT / f"icon{size}.png")
        print(f"Wrote icon{size}.png")


if __name__ == "__main__":
    main()
