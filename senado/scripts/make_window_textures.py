"""Greyscale detail maps for window panes, multiplied by each window material's colour.

louvre.png   one shutter leaf (u 0..1) x 1 m (v 0..1): stiles at both edges, 7 cm louvre slats.
glazing.png  one casement leaf (u 0..1) x 1 m (v 0..1): light frame bars, 2 x 2 dark glass panes.
facade_generic.png  one bay (3.0 m, u 0..1) x one storey (3.2 m, v 0..1) of an ordinary Macau block: white wall,
             a 1.7 x 1.6 m window with a centre mullion and a sill, and a slab band at the top of the storey.
             Used on the buildings without a facade spec (model.js GRID); multiplied by each building's wall colour.

viewer/model.js gives panes u = leaf count across the opening (two leaves per window) and v = metres from
the opening's bottom, so both maps tile without stretching. Rows are stored bottom-up (glTF convention, v = 0 on the
first row); the viewer loads them with flipY = false and the GLB exporter embeds the files unchanged. Run from the repo root:
    python3 senado/scripts/make_window_textures.py
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "viewer" / "assets"
W, H = 128, 256          # px per leaf x 1 m
SLAT = 0.07              # m, louvre pitch
STILE = 0.11             # leaf width share of each stile
BAR = 0.07               # glazing bar width share (vertical bars), 3 cm (horizontal bars)


def louvre():
    im = Image.new("L", (W, H))
    px = im.load()
    pitch = SLAT * H
    for y in range(H):
        t = (y % pitch) / pitch                  # 0 at the top of a slat, 1 at its lower edge
        slat = 255 if t < 0.15 else int(250 - 95 * t)
        if t > 0.9:
            slat = 110                           # shadow line under each slat
        for x in range(W):
            u = x / (W - 1)
            v = 238 if u < STILE or u > 1 - STILE else slat
            if u < 0.015 or u > 0.985:
                v = 120                          # gap between the leaves and against the frame
            px[x, y] = v
    im.transpose(Image.FLIP_TOP_BOTTOM).convert("RGB").save(OUT / "louvre.png", optimize=True)


def glazing():
    im = Image.new("L", (W, H))
    px = im.load()
    rows = 2                                     # panes per metre; two panes across each leaf
    for y in range(H):
        v_m = y / H
        in_hbar = (v_m * rows) % 1 < 0.09
        for x in range(W):
            u = x / (W - 1)
            if u < BAR or u > 1 - BAR or in_hbar or abs(u - 0.5) < BAR * 0.4:
                val = 235
                if u < 0.012 or u > 0.988:
                    val = 150                    # meeting line between the two leaves
            else:
                # dark glass with a soft vertical sheen so panes do not read as flat black
                val = int(48 + 30 * (1 - abs((u - 0.5) * 2)) + 12 * ((v_m * rows) % 1))
            px[x, y] = val
    im.transpose(Image.FLIP_TOP_BOTTOM).convert("RGB").save(OUT / "glazing.png", optimize=True)


def facade_generic():
    S = 128                                      # px per bay and per storey
    im = Image.new("L", (S, S))
    px = im.load()
    for y in range(S):
        v = (y + 0.5) / S                        # 0 at the floor, 1 at the top of the storey
        for x in range(S):
            u = (x + 0.5) / S
            val = 255
            if v > 0.94:
                val = 214                        # slab edge / string course
            elif 0.28 <= v <= 0.78 and 0.215 <= u <= 0.785:
                if u < 0.235 or u > 0.765 or v < 0.3 or v > 0.76 or abs(u - 0.5) < 0.012:
                    val = 176                    # aluminium frame and mullion
                else:
                    val = int(58 + 26 * (v - 0.3) / 0.46)   # dark glass, a little lighter towards the head
            elif 0.255 <= v < 0.28 and 0.19 <= u <= 0.81:
                val = 228                        # sill
            px[x, y] = val
    im.transpose(Image.FLIP_TOP_BOTTOM).convert("RGB").save(OUT / "facade_generic.png", optimize=True)


if __name__ == "__main__":
    louvre()
    glazing()
    facade_generic()
    for n in ("louvre.png", "glazing.png", "facade_generic.png"):
        p = OUT / n
        print(p.relative_to(Path.cwd()) if p.is_relative_to(Path.cwd()) else p, p.stat().st_size, "bytes")
