"""Seamless calçada wave texture: one tile = 6.0 m along the bands x 2.25 m across.

Matches CALCADA in viewer/model.js. Proportions measured on the aligned satellite mosaic.
Run from the repo root: python3 senado/scripts/make_calcada.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageFilter

PX_PER_M = 96
ALONG, ACROSS = 6.0, 2.25     # m
AMPLITUDE = 0.6               # m, sideways swing of each band
DARK = 0.6                    # m, basalt band thickness (rest is limestone)
LIGHT_RGB, DARK_RGB = (237, 231, 217), (59, 59, 57)
SS = 3                        # supersampling

out = Path(__file__).resolve().parents[1] / "viewer" / "assets" / "calcada_waves.png"
W, H = int(ALONG * PX_PER_M), int(ACROSS * PX_PER_M)
big = Image.new("L", (W * SS, H * SS))
px = big.load()
for j in range(H * SS):
    v = (j + 0.5) / (H * SS) * ACROSS
    for i in range(W * SS):
        u = (i + 0.5) / (W * SS) * ALONG
        off = AMPLITUDE * math.sin(2 * math.pi * u / ALONG)
        px[i, j] = 255 if (v - off) % ACROSS < DARK else 0
mask = big.resize((W, H), Image.LANCZOS)

# stone grain: ~6 cm setts with small tone variation, tiled seamlessly
rng = random.Random(7)
grain = Image.new("L", (W, H))
g = grain.load()
cell = max(4, int(0.06 * PX_PER_M))
tones = {}
for j in range(H):
    for i in range(W):
        key = ((i // cell) % (W // cell + 1), (j // cell) % (H // cell + 1))
        if key not in tones:
            tones[key] = rng.randint(-14, 14)
        edge = (i % cell == 0) or (j % cell == 0)
        g[i, j] = 128 + tones[key] - (22 if edge else 0)
grain = grain.filter(ImageFilter.GaussianBlur(0.6))

img = Image.new("RGB", (W, H))
p, m, gr = img.load(), mask.load(), grain.load()
for j in range(H):
    for i in range(W):
        t = m[i, j] / 255
        d = gr[i, j] - 128
        p[i, j] = tuple(max(0, min(255, int(LIGHT_RGB[k] * (1 - t) + DARK_RGB[k] * t + d * (0.5 if t > 0.5 else 0.8)))) for k in range(3))
img.save(out, optimize=True)
print(out, img.size)
