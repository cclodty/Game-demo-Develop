"""Roof material class per building, read from the aligned satellite reference (not stored as pixels).

Each footprint is rasterised onto reference/sat_local.jpg (0.3 m/px, same local frame as the data),
shrunk by about 1 m so walls and eaves of the neighbours stay out, and every pixel is put into one of a
few roof classes by HSV. The building gets the majority class; deep shadow only wins when it covers most of
the roof. The model paints each class with one colour from landmarks.json "roofPalette", so the imagery
itself never reaches the game assets.

Output: data/roof_classes.json  {osm id: class}. Re-run build_data.py afterwards.
    python3 senado/scripts/fetch_imagery.py     # once, the reference image is git-ignored
    python3 senado/scripts/classify_roofs.py
    python3 senado/scripts/build_data.py
"""
import json
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MPP = 0.3          # metres per pixel of sat_local.jpg
ERODE_PX = 7       # MinFilter size: about 1 m in from every edge


def classify(rgb):
    """Per-pixel class names for an (n, 3) uint8 array."""
    a = rgb.astype(float) / 255
    mx, mn = a.max(1), a.min(1)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = a[:, 0], a[:, 1], a[:, 2]
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    out = np.full(len(a), "grey", dtype=object)
    out[(s < 0.14) & (v >= 0.68)] = "light"
    out[(s < 0.14) & (v < 0.42)] = "dark"
    warm = (s >= 0.14) & ((h < 50) | (h >= 330))
    out[warm & (s >= 0.3) & ((h < 28) | (h >= 330))] = "red"                 # terracotta tiles, red paint
    out[warm & ~((s >= 0.3) & ((h < 28) | (h >= 330))) & (v < 0.55)] = "brown"  # old tiles, rust
    out[warm & ~((s >= 0.3) & ((h < 28) | (h >= 330))) & (v >= 0.55)] = "beige"
    out[(s >= 0.14) & (h >= 50) & (h < 170)] = "green"                       # roof gardens, green paint
    out[(s >= 0.14) & (h >= 170) & (h < 330)] = "blue"                        # blue paint, plastic sheeting
    out[v < 0.2] = "shadow"
    return out


def main():
    data = json.loads((ROOT / "data" / "senado_massing.json").read_text())
    img = Image.open(ROOT / "reference" / "sat_local.jpg").convert("RGB")
    x0, y0, x1, y1 = data["meta"]["bounds"]
    arr = np.asarray(img)
    px = lambda p: ((p[0] - x0) / MPP, (y1 - p[1]) / MPP)
    out, stats = {}, Counter()
    for b in data["buildings"] + data["parts"]:
        xs = [p[0] for p in b["outer"]]
        ys = [p[1] for p in b["outer"]]
        if min(xs) < x0 or max(xs) > x1 or min(ys) < y0 or max(ys) > y1:
            continue
        # rasterise in a local window to keep it cheap
        c0, r0 = int((min(xs) - x0) / MPP) - 2, int((y1 - max(ys)) / MPP) - 2
        c1, r1 = int((max(xs) - x0) / MPP) + 3, int((y1 - min(ys)) / MPP) + 3
        c0, r0, c1, r1 = max(c0, 0), max(r0, 0), min(c1, arr.shape[1]), min(r1, arr.shape[0])
        mask = Image.new("L", (c1 - c0, r1 - r0), 0)
        dr = ImageDraw.Draw(mask)
        dr.polygon([(px(p)[0] - c0, px(p)[1] - r0) for p in b["outer"]], fill=255)
        for hole in b.get("holes", []):
            dr.polygon([(px(p)[0] - c0, px(p)[1] - r0) for p in hole], fill=0)
        inner = mask.filter(ImageFilter.MinFilter(ERODE_PX))
        m = np.asarray(inner) > 0
        if m.sum() < 30:
            m = np.asarray(mask) > 0
        if m.sum() < 8:
            continue
        cls = Counter(classify(arr[r0:r1, c0:c1][m]))
        lit = {k: n for k, n in cls.items() if k != "shadow"}
        total = sum(cls.values())
        if not lit or cls["shadow"] > 0.7 * total:
            best = "dark"
        else:
            best = max(lit, key=lit.get)
        out[b["id"]] = best
        stats[best] += 1
    path = ROOT / "data" / "roof_classes.json"
    path.write_text(json.dumps(dict(sorted(out.items())), separators=(",", ":")) + "\n")
    print("wrote", path.relative_to(ROOT.parent), len(out), dict(stats.most_common()))


if __name__ == "__main__":
    main()
