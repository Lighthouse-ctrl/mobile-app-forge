#!/usr/bin/env python
"""Generate Android icon/splash sources for @capacitor/assets from one square icon."""
import argparse
import os
from PIL import Image, ImageDraw


def hex2rgb(s):
    s = s.strip().lstrip('#')
    if len(s) == 3:
        s = ''.join(c * 2 for c in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def diagonal_gradient(size, c1, c2):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x / max(1, size - 1) + y / max(1, size - 1)) / 2
            px[x, y] = tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img


def rounded(img, radius_ratio=0.22):
    w, h = img.size
    scale = 4
    mask = Image.new('L', (w * scale, h * scale), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, w * scale - 1, h * scale - 1],
        radius=int(min(w, h) * radius_ratio * scale),
        fill=255,
    )
    mask = mask.resize((w, h), Image.LANCZOS)
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out


def square(img):
    w, h = img.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--icon', required=True)
    ap.add_argument('--out', default='assets')
    ap.add_argument('--bg', default='#EEF5FC')
    ap.add_argument('--bg2', default='#CAE7FA')
    ap.add_argument('--splash-bg', default='')
    ap.add_argument('--dark-bg', default='')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    src = square(Image.open(args.icon).convert('RGBA'))

    icon_only = rounded(src.resize((1024, 1024), Image.LANCZOS))
    icon_only.save(os.path.join(args.out, 'icon-only.png'))

    fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    inner = src.resize((635, 635), Image.LANCZOS)
    fg.paste(inner, ((1024 - 635) // 2, (1024 - 635) // 2), inner)
    fg.save(os.path.join(args.out, 'icon-foreground.png'))

    diagonal_gradient(1024, hex2rgb(args.bg), hex2rgb(args.bg2)).save(
        os.path.join(args.out, 'icon-background.png'))

    splash_bg = hex2rgb(args.splash_bg or args.bg)
    mark = rounded(src.resize((700, 700), Image.LANCZOS))
    canvas = Image.new('RGB', (2732, 2732), splash_bg)
    canvas.paste(mark, ((2732 - 700) // 2, (2732 - 700) // 2), mark)
    canvas.save(os.path.join(args.out, 'splash.png'))

    dark = hex2rgb(args.dark_bg) if args.dark_bg else splash_bg
    canvas2 = Image.new('RGB', (2732, 2732), dark)
    canvas2.paste(mark, ((2732 - 700) // 2, (2732 - 700) // 2), mark)
    canvas2.save(os.path.join(args.out, 'splash-dark.png'))

    print('wrote icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png ->', args.out)
    print('next: npx capacitor-assets generate --android')


if __name__ == '__main__':
    main()
