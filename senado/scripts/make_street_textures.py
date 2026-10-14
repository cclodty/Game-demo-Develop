"""Greyscale detail maps for the street surfaces, multiplied by each material's colour (see viewer/model.js STREET).

asphalt.png  4 m tile: fine aggregate grain with soft patches; used by the asphalt and concrete roadways.
paving.png   2 m tile: 0.4 m pavement slabs with mortar joints and a slight tone per slab (pavements, kerb band).
setts.png    1.5 m tile: small square setts, the plain calçada of the side streets (footways, setts roadways).
railing.png  2 m x 1 m RGBA: kerbside railing as on Av. de Almeida Ribeiro (#263): posts, top and bottom rails,
             vertical bars; alpha masks the gaps (alphaTest in the viewer, alphaMode MASK in the GLB).

All maps tile seamlessly. Rows are stored bottom-up (glTF convention, v = 0 on the first row), like
make_window_textures.py; the viewer loads them with flipY = false. Run from the repo root:
    python3 senado/scripts/make_street_textures.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "viewer" / "assets"


def tile_noise(size, cells, rng):
    """Seamless value noise: random grid of `cells` x `cells`, bilinear, wrapped."""
    g = [[rng.random() for _ in range(cells)] for _ in range(cells)]
    im = Image.new("L", (size, size))
    px = im.load()
    for y in range(size):
        fy = y / size * cells
        j0, ty = int(fy) % cells, fy - int(fy)
        j1 = (j0 + 1) % cells
        sy = ty * ty * (3 - 2 * ty)
        for x in range(size):
            fx = x / size * cells
            i0, tx = int(fx) % cells, fx - int(fx)
            i1 = (i0 + 1) % cells
            sx = tx * tx * (3 - 2 * tx)
            a = g[j0][i0] * (1 - sx) + g[j0][i1] * sx
            b = g[j1][i0] * (1 - sx) + g[j1][i1] * sx
            px[x, y] = int(255 * (a * (1 - sy) + b * sy))
    return im


def save(im, name):
    im.transpose(Image.FLIP_TOP_BOTTOM).save(OUT / name, optimize=True)
    print(OUT / name, im.size, im.mode)


def asphalt():
    rng = random.Random(11)
    S = 256
    soft = tile_noise(S, 6, rng)
    mid = tile_noise(S, 24, rng)
    im = Image.new("L", (S, S))
    px, sp, mp = im.load(), soft.load(), mid.load()
    for y in range(S):
        for x in range(S):
            v = 214 + (sp[x, y] - 128) * 0.12 + (mp[x, y] - 128) * 0.08 + rng.gauss(0, 9)
            if rng.random() < 0.012:
                v += 30                                  # light aggregate stones
            px[x, y] = max(0, min(255, int(v)))
    save(im.convert("RGB"), "asphalt.png")


def paving():
    rng = random.Random(5)
    S, n = 256, 5                                        # 2 m tile, 5 x 5 slabs of 0.4 m
    cell = S / n
    soft = tile_noise(S, 8, rng).load()
    tone = [[rng.randint(-10, 10) for _ in range(n)] for _ in range(n)]
    im = Image.new("L", (S, S))
    px = im.load()
    for y in range(S):
        for x in range(S):
            i, j = int(x // cell), int(y // cell)
            fx, fy = x - i * cell, y - j * cell
            joint = min(fx, fy, cell - fx, cell - fy) < 1.2
            v = (150 if joint else 222 + tone[j][i]) + (soft[x, y] - 128) * 0.06 + rng.gauss(0, 4)
            px[x, y] = max(0, min(255, int(v)))
    save(im.filter(ImageFilter.GaussianBlur(0.4)).convert("RGB"), "paving.png")


def setts():
    rng = random.Random(9)
    S, n = 256, 25                                       # 1.5 m tile, 6 cm stones in staggered rows
    cell = S / n
    tone = {}
    im = Image.new("L", (S, S))
    px = im.load()
    for y in range(S):
        j = int(y // cell)
        shift = (cell / 2) * (j % 2)
        for x in range(S):
            xs = (x + shift) % S
            i = int(xs // cell)
            fx, fy = xs - i * cell, y - j * cell
            if (i, j) not in tone:
                tone[(i, j)] = rng.randint(-16, 16)
            edge = min(fx, fy, cell - fx, cell - fy)
            v = (120 if edge < 0.9 else 214 + tone[(i, j)] - max(0, 3 - edge) * 6) + rng.gauss(0, 4)
            px[x, y] = max(0, min(255, int(v)))
    save(im.filter(ImageFilter.GaussianBlur(0.5)).convert("RGB"), "setts.png")


def railing():
    W, H = 256, 128                                      # 2.0 m x 1.0 m
    im = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    px = im.load()
    m = W / 2.0                                          # px per metre
    for y in range(H):
        z = 1.0 - (y + 0.5) / H                          # metres above the pavement, top row = 1.0 m
        for x in range(W):
            s = (x + 0.5) / m
            # members are drawn a little heavier than life (bars 3 cm) so they survive mipmapping at a distance
            post = s < 0.035 or s > 2.0 - 0.035          # 7 cm post at each panel joint
            rail = 0.91 <= z <= 0.98 or 0.07 <= z <= 0.13 or 0.83 <= z <= 0.87
            bar = 0.13 < z < 0.83 and (s % 0.125) < 0.03
            ring = 0.87 < z < 0.91 and abs((s % 0.25) - 0.125) < 0.025   # small balls under the top rail
            if post or rail or bar or ring:
                shade = 255 if not post else 230
                px[x, y] = (shade, shade, shade, 255)
    save(im, "railing.png")


if __name__ == "__main__":
    asphalt()
    paving()
    setts()
    railing()
