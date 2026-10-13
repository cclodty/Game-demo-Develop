"""Esri World Imagery -> aligned reference images for the viewer (not game assets).

Writes senado/reference/sat_local.jpg (whole map) and sat_core.jpg (minimap), resampled into the
local metric frame (x east, y north, origin = fountain) and shifted so the imagery's fountain sits
on the OSM fountain. These files are git-ignored: Esri imagery is for reference only.

Run from the repo root: python3 senado/scripts/fetch_imagery.py
"""
import json
import math
import os
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "reference" / "tiles"
S, W, N, E = 22.1905, 113.5360, 22.1970, 113.5435
Z = 19
SHIFT = (4.8, -5.9)  # m; where the Esri fountain sits relative to the OSM fountain (east, north)
URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
n = 2 ** Z


def merc(lat, lon):
    return (lon + 180) / 360 * n * 256, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n * 256


def fetch():
    CACHE.mkdir(parents=True, exist_ok=True)
    (x0, y0), (x1, y1) = merc(N, W), merc(S, E)
    tx = range(int(x0 // 256), int(x1 // 256) + 1)
    ty = range(int(y0 // 256), int(y1 // 256) + 1)
    mosaic = Image.new("RGB", (len(tx) * 256, len(ty) * 256))
    for i, x in enumerate(tx):
        for j, y in enumerate(ty):
            p = CACHE / f"{Z}_{x}_{y}.jpg"
            if not p.exists():
                for a in range(4):
                    try:
                        req = urllib.request.Request(URL.format(z=Z, x=x, y=y), headers={"User-Agent": "SenadoMassingStudy/0.1"})
                        p.write_bytes(urllib.request.urlopen(req, timeout=30).read())
                        break
                    except OSError as e:
                        print("retry", x, y, e)
                        time.sleep(2 ** a)
            mosaic.paste(Image.open(p), (i * 256, j * 256))
    return mosaic, tx[0] * 256, ty[0] * 256


def render(mosaic, ox, oy, rect, mpp, out):
    data = json.loads((ROOT / "data" / "senado_massing.json").read_text())
    lat0, lon0 = data["meta"]["origin"]["lat"], data["meta"]["origin"]["lon"]
    phi = math.radians(lat0)
    a, e2 = 6378137.0, 6.69437999014e-3
    m_lat = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    m_lon = math.pi / 180 * a * math.cos(phi) / math.sqrt(1 - e2 * math.sin(phi) ** 2)

    def px(x, y):
        X, Y = merc(lat0 + (y + SHIFT[1]) / m_lat, lon0 + (x + SHIFT[0]) / m_lon)
        return X - ox, Y - oy

    x0, y0, x1, y1 = rect
    w, h = int((x1 - x0) / mpp), int((y1 - y0) / mpp)
    p00, p10, p01 = px(x0, y1), px(x1, y1), px(x0, y0)
    coeffs = ((p10[0] - p00[0]) / w, (p01[0] - p00[0]) / h, p00[0], (p10[1] - p00[1]) / w, (p01[1] - p00[1]) / h, p00[1])
    img = mosaic.transform((w, h), Image.AFFINE, coeffs, resample=Image.BICUBIC)
    img.save(out, quality=82, optimize=True, progressive=True)
    print("wrote", out.relative_to(ROOT.parent), img.size)


if __name__ == "__main__":
    mosaic, ox, oy = fetch()
    bounds = json.loads((ROOT / "data" / "senado_massing.json").read_text())["meta"]["bounds"]
    render(mosaic, ox, oy, bounds, 0.3, ROOT / "reference" / "sat_local.jpg")
    render(mosaic, ox, oy, (-110, -100, 110, 150), 0.25, ROOT / "reference" / "sat_core.jpg")
