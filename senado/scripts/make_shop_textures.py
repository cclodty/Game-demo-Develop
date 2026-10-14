"""Shopfront atlas for the ground floors (v7): what you see through the glass of a lit shop.

shops.png  1024 x 640, 4 x 2 cells of 256 x 320 (one 3.0 m x 3.75 m shopfront each). Each cell is a glazed
           front (dark bronze frame, glass door, transom) over a lit interior of one kind of shop found around
           Largo do Senado (photos #105, #108, #133, #136, #175, #188): cosmetics, pharmacy, jewellery, almond
           cake bakery, fashion, café, beef jerky, shoes. The viewer uses the same image as base colour and
           emissive map, so interiors stay lit inside the shaded arcades.

signs.png  RGBA atlas of the shop signs in data/shops.json, each drawn at its size in metres (default 160 px/m)
           and shelf-packed; letters stand on a transparent ground (alpha-masked in the viewer and the GLB).
           data/sign_atlas.json gives each sign's rectangle as [u0, v0, u1, v1] plus its size; build_data.py merges
           it into senado_massing.json. The brand signs are for the showcase only (see the note in shops.json).
           The lettering on the landmark fronts (landmarks.json "inscriptions", v8) goes into the same atlas.

Cells are drawn at twice the size and downsampled. Rows are stored bottom-up (glTF convention, v = 0 on the
first row) like the other detail maps; the viewer loads them with flipY = false. Run from the repo root, then
rerun build_data.py:
    python3 senado/scripts/make_shop_textures.py
"""
import json
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "viewer" / "assets"
CW, CH = 256, 320          # cell in the atlas
S = 2                      # supersampling
W, H = CW * S, CH * S
COLS, ROWS = 4, 2

# order = atlas index (row-major from the bottom-left cell, matching SHOP_KINDS in viewer/model.js)
KINDS = ["cosmetics", "pharmacy", "jewellery", "bakery", "fashion", "cafe", "jerky", "shoes"]

THEME = {
    "cosmetics": dict(wall=(246, 240, 242), side=(232, 222, 226), floor=(236, 232, 230), ceil=(250, 248, 248),
                      goods=[(232, 80, 140), (250, 250, 250), (200, 40, 60), (90, 140, 210), (240, 190, 200), (60, 60, 70)]),
    "pharmacy": dict(wall=(244, 246, 244), side=(226, 232, 228), floor=(226, 228, 226), ceil=(250, 252, 250),
                     goods=[(40, 150, 90), (250, 250, 250), (60, 110, 200), (230, 70, 60), (250, 210, 60), (200, 220, 230)]),
    "jewellery": dict(wall=(150, 96, 60), side=(120, 72, 44), floor=(90, 60, 44), ceil=(238, 220, 190),
                      goods=[(250, 214, 120), (255, 236, 170), (200, 30, 40), (240, 240, 240)]),
    "bakery": dict(wall=(170, 50, 40), side=(140, 38, 30), floor=(150, 120, 90), ceil=(250, 230, 200),
                   goods=[(230, 180, 60), (200, 40, 40), (250, 240, 220), (160, 100, 50), (240, 200, 120)]),
    "fashion": dict(wall=(236, 232, 226), side=(214, 208, 200), floor=(200, 186, 168), ceil=(248, 246, 242),
                    goods=[(40, 40, 46), (200, 196, 190), (150, 60, 60), (70, 90, 130), (230, 220, 200), (120, 140, 110)]),
    "cafe": dict(wall=(92, 64, 44), side=(70, 48, 34), floor=(110, 80, 58), ceil=(60, 44, 34),
                 goods=[(40, 110, 80), (230, 220, 200), (180, 140, 90), (250, 250, 240)]),
    "jerky": dict(wall=(196, 40, 36), side=(160, 30, 28), floor=(170, 140, 120), ceil=(250, 236, 220),
                  goods=[(120, 30, 24), (150, 44, 30), (100, 24, 20), (230, 200, 120)]),
    "shoes": dict(wall=(240, 242, 244), side=(220, 224, 228), floor=(180, 184, 188), ceil=(250, 250, 252),
                  goods=[(30, 30, 34), (250, 250, 250), (220, 60, 50), (60, 120, 210), (240, 200, 60), (120, 120, 126)]),
}

FRAME = (52, 44, 38)        # dark bronze aluminium


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def interior(kind, rng):
    th = THEME[kind]
    im = Image.new("RGB", (W, H), th["wall"])
    d = ImageDraw.Draw(im)
    # one-point perspective box: back wall in the middle, side walls, ceiling and floor around it
    bx0, bx1, by0, by1 = int(W * 0.12), int(W * 0.88), int(H * 0.2), int(H * 0.78)
    d.polygon([(0, 0), (W, 0), (bx1, by0), (bx0, by0)], fill=th["ceil"])
    d.polygon([(0, H), (W, H), (bx1, by1), (bx0, by1)], fill=th["floor"])
    d.polygon([(0, 0), (bx0, by0), (bx0, by1), (0, H)], fill=th["side"])
    d.polygon([(W, 0), (bx1, by0), (bx1, by1), (W, H)], fill=shade(th["side"], 0.95))
    # floor tiles
    for k in range(1, 7):
        t = k / 7
        y = int(by1 + (H - by1) * t * t)
        d.line([(int(bx0 * (1 - t * t)), y), (int(bx1 + (W - bx1) * t * t), y)], fill=shade(th["floor"], 0.9), width=S)
    # shelves on the back wall, filled with goods
    rows = 4 if kind not in ("cafe", "fashion") else 3
    for r in range(rows):
        y0 = by0 + 12 * S + r * (by1 - by0 - 30 * S) // rows
        y1 = y0 + (by1 - by0 - 30 * S) // rows - 6 * S
        d.rectangle([bx0 + 4 * S, y1, bx1 - 4 * S, y1 + 3 * S], fill=shade(th["side"], 0.8))
        x = bx0 + 6 * S
        while x < bx1 - 10 * S:
            w = rng.randint(4, 11) * S
            h = rng.randint(int((y1 - y0) * 0.45), int((y1 - y0) * 0.9))
            c = rng.choice(th["goods"])
            if kind == "fashion":
                # folded stacks and hanging garments
                d.rectangle([x, y1 - h, x + w, y1], fill=c)
            elif kind == "jewellery":
                d.ellipse([x, y1 - 5 * S, x + 4 * S, y1 - S], fill=c)
                w = 6 * S
            else:
                d.rectangle([x, y1 - h, x + w, y1], fill=c)
                d.line([(x, y1 - h), (x + w, y1 - h)], fill=shade(c, 1.15), width=S)
            x += w + rng.randint(1, 3) * S
    # theme pieces in front of the back wall
    if kind == "jewellery":
        for k in range(3):
            x0 = int(W * (0.08 + k * 0.3)); x1 = x0 + int(W * 0.26)
            d.rectangle([x0, int(H * 0.62), x1, int(H * 0.86)], fill=(110, 70, 46))
            d.rectangle([x0 + 3 * S, int(H * 0.56), x1 - 3 * S, int(H * 0.64)], fill=(255, 244, 214))
            for _ in range(10):
                gx = rng.randint(x0 + 6 * S, x1 - 6 * S)
                d.ellipse([gx, int(H * 0.6), gx + 3 * S, int(H * 0.6) + 3 * S], fill=(250, 200, 90))
    elif kind in ("cosmetics", "pharmacy", "shoes"):
        for k in range(2):
            x0 = int(W * (0.18 + k * 0.38)); x1 = x0 + int(W * 0.26)
            d.rectangle([x0, int(H * 0.66), x1, int(H * 0.84)], fill=shade(th["wall"], 0.93))
            d.rectangle([x0, int(H * 0.66), x1, int(H * 0.675)], fill=rng.choice(th["goods"]))
    elif kind == "bakery":
        # counter stacked with gift boxes, red banner on the back wall
        d.rectangle([int(W * 0.1), int(H * 0.64), int(W * 0.9), int(H * 0.86)], fill=(120, 70, 40))
        for k in range(18):
            x0 = int(W * 0.12) + k * int(W * 0.043)
            hgt = rng.randint(8, 22) * S
            d.rectangle([x0, int(H * 0.64) - hgt, x0 + int(W * 0.038), int(H * 0.64)], fill=rng.choice(th["goods"]))
    elif kind == "fashion":
        for k in range(2):
            cx = int(W * (0.3 + k * 0.4))
            d.ellipse([cx - 6 * S, int(H * 0.36), cx + 6 * S, int(H * 0.36) + 12 * S], fill=(230, 222, 214))
            d.polygon([(cx - 14 * S, int(H * 0.42)), (cx + 14 * S, int(H * 0.42)), (cx + 18 * S, int(H * 0.72)), (cx - 18 * S, int(H * 0.72))],
                      fill=rng.choice(th["goods"]))
            d.rectangle([cx - S, int(H * 0.72), cx + S, int(H * 0.84)], fill=(80, 80, 80))
        d.line([(int(W * 0.08), int(H * 0.3)), (int(W * 0.92), int(H * 0.3))], fill=(70, 70, 70), width=2 * S)
    elif kind == "cafe":
        d.rectangle([int(W * 0.08), int(H * 0.6), int(W * 0.7), int(H * 0.86)], fill=(60, 40, 30))
        d.rectangle([int(W * 0.08), int(H * 0.6), int(W * 0.7), int(H * 0.62)], fill=(200, 190, 170))
        d.rectangle([int(W * 0.22), int(H * 0.24), int(W * 0.78), int(H * 0.4)], fill=(30, 34, 32))   # menu board
        for k in range(5):
            y = int(H * 0.27) + k * 5 * S
            d.line([(int(W * 0.26), y), (int(W * 0.26) + rng.randint(30, 100) * S, y)], fill=(230, 230, 220), width=S)
        for k in range(3):
            cx = int(W * (0.25 + k * 0.25))
            d.line([(cx, 0), (cx, int(H * 0.14))], fill=(30, 30, 30), width=S)
            d.ellipse([cx - 8 * S, int(H * 0.13), cx + 8 * S, int(H * 0.17)], fill=(255, 220, 150))
    elif kind == "jerky":
        # glass counter with sheets of jerky, more sheets hung on the wall
        d.rectangle([int(W * 0.08), int(H * 0.62), int(W * 0.92), int(H * 0.86)], fill=(220, 214, 200))
        for k in range(12):
            x0 = int(W * 0.1) + k * int(W * 0.068)
            d.rectangle([x0, int(H * 0.64), x0 + int(W * 0.06), int(H * 0.7)], fill=rng.choice(th["goods"][:3]))
        for k in range(8):
            x0 = int(W * 0.16) + k * int(W * 0.09)
            d.rectangle([x0, int(H * 0.26), x0 + int(W * 0.07), int(H * 0.4)], fill=rng.choice(th["goods"][:3]))
    # ceiling lights with a glow
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    n = 3 if kind != "cafe" else 0
    for k in range(n):
        cx = int(W * (0.22 + k * 0.28))
        g.rectangle([cx - 14 * S, int(H * 0.05), cx + 14 * S, int(H * 0.08)], fill=(255, 250, 235))
    im = add(im, glow.filter(ImageFilter.GaussianBlur(10 * S)), 0.9)
    im = add(im, glow, 1.0)
    return im.filter(ImageFilter.GaussianBlur(0.8 * S))


def add(a, b, k):
    return ImageChops.add(a, Image.eval(b, lambda v: int(v * k)))


def front(im, door_left, rng):
    """Glazing over the interior: bronze frame, transom, a door, glass tint and a reflection."""
    d = ImageDraw.Draw(im, "RGBA")
    # glass tint and a soft diagonal reflection
    d.rectangle([0, 0, W, H], fill=(40, 60, 70, 34))
    refl = Image.new("L", (W, H), 0)
    rd = ImageDraw.Draw(refl)
    off = rng.randint(-40, 40) * S
    rd.polygon([(int(W * 0.15) + off, 0), (int(W * 0.42) + off, 0), (int(W * 0.05) + off, H), (int(-W * 0.22) + off, H)], fill=60)
    refl = refl.filter(ImageFilter.GaussianBlur(14 * S))
    im.paste(Image.new("RGB", (W, H), (235, 242, 248)), (0, 0), refl)
    d = ImageDraw.Draw(im)
    f = 7 * S
    transom = int(H * 0.17)
    door_w = int(W * 0.36)
    dx0 = f if door_left else W - f - door_w
    dx1 = dx0 + door_w
    # frame members
    d.rectangle([0, 0, W, f], fill=FRAME)
    d.rectangle([0, H - 2 * f, W, H], fill=FRAME)                   # kick plate
    d.rectangle([0, 0, f, H], fill=FRAME)
    d.rectangle([W - f, 0, W, H], fill=FRAME)
    d.rectangle([0, transom - f // 2, W, transom + f // 2], fill=FRAME)
    xm = dx1 if door_left else dx0
    d.rectangle([xm - f // 2, transom, xm + f // 2, H], fill=FRAME)
    # the door: its own frame, a push bar, a little darker (seen deeper into the shop)
    d.rectangle([dx0 + f, transom + f, dx1 - f, H - 2 * f], outline=shade(FRAME, 1.3), width=3 * S)
    by = int(H * 0.58)
    d.rectangle([dx0 + 3 * f, by, dx1 - 3 * f, by + 2 * S], fill=(190, 190, 186))
    return im


def save(im, name):
    im.transpose(Image.FLIP_TOP_BOTTOM).save(OUT / name, optimize=True)
    print(OUT / name, im.size, im.mode)


def shops():
    atlas = Image.new("RGB", (CW * COLS, CH * ROWS))
    for k, kind in enumerate(KINDS):
        rng = random.Random(100 + k)
        cell = front(interior(kind, rng), door_left=k % 2 == 0, rng=rng).resize((CW, CH), Image.LANCZOS)
        col, row = k % COLS, k // COLS
        # row 0 is the bottom row once the atlas is flipped for storage
        atlas.paste(cell, (col * CW, (ROWS - 1 - row) * CH))
    save(atlas, "shops.png")


# ---------- signs ----------

FONTS = {
    "sans": "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf",
    "sans-bold": "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
    "serif": "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "serif-bold": "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "cjk": "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
}
PPM = 160            # pixels per metre in the atlas
ATLAS_W = 2048
GUTTER = 6           # px between signs; colours are bled into it so mip levels do not pick up the neighbours


def font(name, px):
    return ImageFont.truetype(FONTS[name], max(4, int(px)))


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def run_width(run, px, track):
    """Advance of a run including the tracking after each character."""
    f = font(run["font"], px)
    return sum(f.getlength(ch) + track * px for ch in run["t"])


def draw_line(d, line, x0, x1, ycen, px, fg):
    """One line of runs centred between x0 and x1, shrunk to fit."""
    runs = line.get("runs") or [{"t": line["t"], "font": line.get("font", "sans-bold")}]
    track = line.get("track", 0)

    def width(px):    # the last character's tracking is not part of the line
        return sum(run_width(r, px, r.get("track", track)) for r in runs) - runs[-1].get("track", track) * px
    total = width(px)
    if total > x1 - x0:
        px *= (x1 - x0) / total
        total = width(px)
    x = (x0 + x1 - total) / 2
    for r in runs:
        f = font(r["font"], px)
        tr = r.get("track", track) * px
        col = hexc(r.get("color", fg))
        # vertical centre on the cap height of a reference glyph so mixed fonts share a baseline
        ref = "中" if r["font"] == "cjk" else "H"
        top, bot = f.getbbox(ref)[1], f.getbbox(ref)[3]
        y = ycen - (top + bot) / 2
        sw = int(line.get("stroke", 0) * px)          # thicker strokes for the CJK sans at a distance
        for ch in r["t"]:
            d.text((x, y), ch, font=f, fill=col, stroke_width=sw, stroke_fill=col)
            x += f.getlength(ch) + tr


def text_sign(spec, W, H):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    fg = spec.get("fg", "#000000")
    if spec.get("bg"):
        d.rectangle([0, 0, W, H], fill=hexc(spec["bg"]))
    if spec.get("border"):
        b = max(2, H // 14)
        d.rectangle([b, b, W - b - 1, H - b - 1], outline=hexc(spec["border"]), width=b)
    pad = H * spec.get("pad", 0.12 if spec.get("bg") else 0.02)
    lines = spec["lines"]
    sizes = [ln["size"] * H for ln in lines]
    gap = H * 0.06
    total = sum(sizes) + gap * (len(lines) - 1)
    y = (H - total) / 2
    for ln, px in zip(lines, sizes):
        draw_line(d, ln, pad, W - pad, y + px / 2, px, fg)
        y += px + gap
    if spec.get("outline"):
        # thin darker edge so white letters read against a pale band
        a = im.split()[3]
        edge = a.filter(ImageFilter.MaxFilter(2 * max(1, int(H * spec.get("outlineW", 0.02))) + 1))
        under = Image.new("RGBA", (W, H), hexc(spec["outline"]))
        under.putalpha(edge)
        im = Image.alpha_composite(under, im)
    return im


def roundels(spec, W, H):
    """Characters in white roundels (鉅記手信 on the pink corner, photo #105)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    n = len(spec["text"])
    step = W / n
    r = min(H, step) * 0.48
    f = font("cjk", r * 1.35)
    for k, ch in enumerate(spec["text"]):
        cx, cy = step * (k + 0.5), H / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hexc(spec["bg"]), outline=hexc(spec["fg"]), width=max(2, int(r * 0.07)))
        bb = f.getbbox(ch)
        d.text((cx - (bb[0] + bb[2]) / 2, cy - (bb[1] + bb[3]) / 2), ch, font=f, fill=hexc(spec["fg"]))
    return im


def sasa(spec, W, H):
    """Sasa banner (photos #133, #135): magenta, a pale face in profile, white 'sasa 莎莎'."""
    im = Image.new("RGBA", (W, H), hexc("#d4096f"))
    d = ImageDraw.Draw(im)
    for y in range(H):                               # soft vertical shading
        k = 0.85 + 0.25 * y / H
        d.line([(0, y), (W, y)], fill=tuple(min(255, int(c * k)) for c in (212, 9, 111)) + (255,))
    cx, cy, R = W * 0.5, H * 0.56, W * 0.3
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=hexc("#f8f4f6"))
    head = [(cx - R * 0.3, cy + R * 0.75), (cx - R * 0.45, cy + R * 0.1), (cx - R * 0.2, cy - R * 0.55), (cx + R * 0.25, cy - R * 0.6),
            (cx + R * 0.45, cy - R * 0.2), (cx + R * 0.5, cy + R * 0.05), (cx + R * 0.38, cy + R * 0.12), (cx + R * 0.42, cy + R * 0.32),
            (cx + R * 0.25, cy + R * 0.42), (cx + R * 0.2, cy + R * 0.75)]
    d.polygon(head, fill=hexc("#7fd3d2"))
    d.text((W * 0.42, H * 0.24), "sasa", font=font("sans-bold", W * 0.26), fill=hexc("#ffffff"), anchor="mm")
    d.text((W * 0.83, H * 0.245), "莎莎", font=font("cjk", W * 0.11), fill=hexc("#ffffff"), anchor="mm")
    d.text((W * 0.5, H * 0.84), "making life beautiful", font=font("sans", W * 0.06), fill=hexc("#ffffff"), anchor="mm")
    return im


def tfs(spec, W, H):
    """TFS 時尚廣場 banner (photo #135): charcoal, white letters."""
    im = Image.new("RGBA", (W, H), hexc("#2c2d30"))
    d = ImageDraw.Draw(im)
    d.rectangle([W * 0.06, H * 0.36, W * 0.94, H * 0.37], fill=hexc("#8a8b8f"))
    d.text((W * 0.5, H * 0.3), "時尚廣場", font=font("cjk", W * 0.15), fill=hexc("#ffffff"), anchor="mm")
    d.text((W * 0.5, H * 0.5), "TFS", font=font("sans-bold", W * 0.3), fill=hexc("#ffffff"), anchor="mm")
    return im


def watch(spec, W, H):
    """Swatch window graphic (photo #174): a large watch on a blue ground."""
    im = Image.new("RGBA", (W, H), hexc(spec["bg"]))
    d = ImageDraw.Draw(im)
    cx, cy, R = W * 0.5, H * 0.55, W * 0.36
    d.rectangle([cx - R * 0.55, cy - R * 2.6, cx + R * 0.55, cy + R * 2.6], fill=hexc(spec["strap"]))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=hexc("#1c1c1e"))
    d.ellipse([cx - R * 0.86, cy - R * 0.86, cx + R * 0.86, cy + R * 0.86], fill=hexc("#f5f5f2"))
    for k in range(12):
        a = k * math.pi / 6
        r0, r1 = R * 0.7, R * 0.8
        d.line([(cx + r0 * math.sin(a), cy - r0 * math.cos(a)), (cx + r1 * math.sin(a), cy - r1 * math.cos(a))], fill=hexc("#1c1c1e"), width=max(2, int(W * 0.012)))
    d.line([(cx, cy), (cx + R * 0.45, cy - R * 0.3)], fill=hexc("#1c1c1e"), width=max(2, int(W * 0.02)))
    d.line([(cx, cy), (cx - R * 0.1, cy - R * 0.62)], fill=hexc("#1c1c1e"), width=max(2, int(W * 0.015)))
    d.line([(cx, cy), (cx - R * 0.5, cy + R * 0.4)], fill=hexc("#e2231a"), width=max(1, int(W * 0.008)))
    d.text((W * 0.5, H * 0.12), "swatch", font=font("sans-bold", W * 0.2), fill=hexc("#ffffff"), anchor="mm")
    return im


def swatch(spec, W, H):
    """'swatch' in white with the red box and white cross, on a grey panel (photos #174, #188)."""
    im = Image.new("RGBA", (W, H), hexc(spec["bg"]))
    d = ImageDraw.Draw(im)
    f = font("sans-bold", H * 0.7)
    tw = f.getlength("swatch")
    box = H * 0.56
    x = (W - tw - box * 1.25) / 2
    d.text((x, H * 0.5), "swatch", font=f, fill=hexc(spec["fg"]), anchor="lm")
    bx, by = x + tw + box * 0.25, H * 0.5 - box / 2
    d.rectangle([bx, by, bx + box, by + box], fill=hexc("#e2231a"))
    t, l = box * 0.18, box * 0.62
    c = (bx + box / 2, by + box / 2)
    d.rectangle([c[0] - t / 2, c[1] - l / 2, c[0] + t / 2, c[1] + l / 2], fill=hexc("#ffffff"))
    d.rectangle([c[0] - l / 2, c[1] - t / 2, c[0] + l / 2, c[1] + t / 2], fill=hexc("#ffffff"))
    return im


def starbucks(spec, W, H):
    """Green fascia with a round emblem (simplified: rings and a star) and the name."""
    im = Image.new("RGBA", (W, H), hexc(spec["bg"]))
    d = ImageDraw.Draw(im)
    r = H * 0.4
    cx, cy = H * 0.55, H / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hexc("#ffffff"))
    d.ellipse([cx - r * 0.82, cy - r * 0.82, cx + r * 0.82, cy + r * 0.82], fill=hexc(spec["bg"]))
    d.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5], fill=hexc("#ffffff"))
    star = [(cx + r * 0.32 * (1 if k % 2 == 0 else 0.45) * math.sin(k * math.pi / 5),
             cy - r * 0.32 * (1 if k % 2 == 0 else 0.45) * math.cos(k * math.pi / 5)) for k in range(10)]
    d.polygon(star, fill=hexc(spec["bg"]))
    draw_line(d, {"t": "STARBUCKS", "font": "serif-bold", "track": 0.08}, H * 1.15, W - H * 0.2, H / 2, H * 0.56, spec["fg"])
    return im


def drape(spec, W, H):
    """Swarovski window drape (photo #188): purple fabric folds and a small swan mark."""
    im = Image.new("RGBA", (W, H), hexc(spec["bg"]))
    d = ImageDraw.Draw(im)
    base = hexc(spec["bg"])
    for x in range(W):
        k = 0.82 + 0.22 * (0.5 + 0.5 * math.sin(x / W * math.pi * 7))
        d.line([(x, 0), (x, H)], fill=tuple(min(255, int(c * k)) for c in base[:3]) + (255,))
    d.text((W * 0.5, H * 0.55), "SWAROVSKI", font=font("serif", W * 0.11), fill=hexc(spec["fg"]), anchor="mm")
    return im


DRAW = {"text": text_sign, "roundels": roundels, "sasa": sasa, "tfs": tfs, "watch": watch, "swatch": swatch,
        "starbucks": starbucks, "drape": drape}


def bleed(im):
    """Spread the colours of opaque pixels into the transparent ones (alpha unchanged), so filtering and mip
    levels do not darken the letter edges."""
    rgb, a = im.convert("RGB"), im.split()[3]
    if a.getextrema()[0] == 255:
        return im
    out = Image.new("RGB", im.size, (0, 0, 0))
    filled = Image.new("L", im.size, 0)
    for r in (2, 6, 16, 48):
        pa = a.filter(ImageFilter.GaussianBlur(r))
        prem = Image.composite(rgb, Image.new("RGB", im.size, (0, 0, 0)), a).filter(ImageFilter.GaussianBlur(r))
        # un-premultiply where the blurred alpha has some coverage
        px, pp, pf = prem.load(), pa.load(), filled.load()
        po = out.load()
        for y in range(im.size[1]):
            for x in range(im.size[0]):
                if pf[x, y] or pp[x, y] < 3:
                    continue
                k = 255 / pp[x, y]
                c = px[x, y]
                po[x, y] = (min(255, int(c[0] * k)), min(255, int(c[1] * k)), min(255, int(c[2] * k)))
                pf[x, y] = 255
    out = Image.composite(rgb, out, a.point(lambda v: 255 if v > 0 else 0))
    res = out.convert("RGBA")
    res.putalpha(a)
    return res


def signs():
    data = json.loads((ROOT / "data" / "shops.json").read_text())
    lettering = json.loads((ROOT / "data" / "landmarks.json").read_text()).get("inscriptions", {})
    specs = {**data["signs"], **{k: v for k, v in lettering.items() if not k.startswith("_")}}
    items = []
    for sid, spec in specs.items():
        ppm = spec.get("ppm", PPM)
        W, H = max(8, round(spec["w"] * ppm)), max(8, round(spec["h"] * ppm))
        if W > ATLAS_W - 2 * GUTTER:
            W, H = ATLAS_W - 2 * GUTTER, round(H * (ATLAS_W - 2 * GUTTER) / W)
        big = DRAW[spec["draw"]](spec, W * S, H * S)
        items.append((sid, bleed(big.resize((W, H), Image.LANCZOS))))
    # shelf packing, tallest first
    items.sort(key=lambda it: (-it[1].size[1], it[0]))
    x = y = shelf = 0
    placed = []
    for sid, im in items:
        w, h = im.size
        if x + w + GUTTER > ATLAS_W:
            x, y, shelf = 0, y + shelf, 0
        placed.append((sid, im, x + GUTTER, y + GUTTER))
        x += w + 2 * GUTTER
        shelf = max(shelf, h + 2 * GUTTER)
    AH = 1 << math.ceil(math.log2(y + shelf))
    atlas = Image.new("RGBA", (ATLAS_W, AH), (0, 0, 0, 0))
    rects = {}
    for sid, im, px, py in placed:
        w, h = im.size
        # copy the edge pixels into the gutter (clamp-to-edge inside the atlas); letters on a clear ground keep
        # a clear gutter, with the colours bled into it
        ext = im.resize((w + 2 * GUTTER, h + 2 * GUTTER), Image.NEAREST)
        if im.split()[3].getextrema()[0] < 255:
            ext.putalpha(0)
        ext.paste(im, (GUTTER, GUTTER))
        atlas.paste(ext, (px - GUTTER, py - GUTTER))
        spec = specs[sid]
        # stored bottom-up: an image row y lands at v = 1 - y / AH
        rects[sid] = {"uv": [round(px / ATLAS_W, 6), round(1 - (py + h) / AH, 6), round((px + w) / ATLAS_W, 6), round(1 - py / AH, 6)],
                      "w": spec["w"], "h": spec["h"], **({"fill": spec["fill"]} if "fill" in spec else {})}
    save(atlas, "signs.png")
    out = ROOT / "data" / "sign_atlas.json"
    out.write_text(json.dumps({"_doc": "generated by scripts/make_shop_textures.py from data/shops.json; uv = [u0, v0, u1, v1] in viewer/assets/signs.png (stored bottom-up)",
                               "size": [ATLAS_W, AH], "signs": rects}, ensure_ascii=False, indent=1))
    print(out, len(rects), "signs")


if __name__ == "__main__":
    shops()
    signs()
