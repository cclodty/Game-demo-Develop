"""OSM (Overpass JSON) -> senado/data/senado_massing.json

Local metric coordinates, origin at the Largo do Senado fountain.
Data axes: x = east, y = north, metres. Heights in metres above the square.

Run from the repo root:  python3 senado/scripts/build_data.py
"""
import hashlib
import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "osm_raw.json"
LANDMARKS = ROOT / "data" / "landmarks.json"
ROOF_CLASSES = ROOT / "data" / "roof_classes.json"   # written by classify_roofs.py
STREETS = ROOT / "data" / "streets.json"             # written by build_streets.py
SHOPS = ROOT / "data" / "shops.json"                 # shop kinds and signs (v7, showcase)
SIGN_ATLAS = ROOT / "data" / "sign_atlas.json"       # written by make_shop_textures.py
OUT = ROOT / "data" / "senado_massing.json"

ORIGIN_NODE = 5692359322            # 噴水池 San Ma Lou (historic=memorial node at the fountain)
SQUARE_WAYS = [192573684, 972921328]  # 議事亭前地, 板樟堂前地
AVENUE_NAME = "新馬路"               # Avenida de Almeida Ribeiro
CORE_RADIUS = 170                   # m from the fountain; beyond this is skyline context
AREA_BINS = [15, 25, 40, 60, 100, 200]  # m²; untagged heights = median of tagged buildings in the same bin
KIOSK_AREA = 15.0                   # m²; untagged footprints below this are kiosks/sheds
MAP_RECT = (-360.0, -330.0, 350.0, 350.0)  # x0, y0, x1, y1 in m; landmarks are kept even outside it


def load():
    return json.loads(RAW.read_text())["elements"]


def projector(lat0, lon0):
    phi = math.radians(lat0)
    a, e2 = 6378137.0, 6.69437999014e-3
    m_lat = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    m_lon = math.pi / 180 * a * math.cos(phi) / math.sqrt(1 - e2 * math.sin(phi) ** 2)
    return lambda p: ((p["lon"] - lon0) * m_lon, (p["lat"] - lat0) * m_lat)


def r2(v):
    return round(v, 2)


def ring_area(r):
    """Signed shoelace area: positive for counter-clockwise rings (x east, y north)."""
    return sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r))) / 2


def clean_ring(pts, ccw=True):
    out = []
    for p in pts:
        q = (r2(p[0]), r2(p[1]))
        if not out or q != out[-1]:
            out.append(q)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    if len(out) < 3:
        return None
    if (ring_area(out) > 0) != ccw:
        out.reverse()
    return [list(p) for p in out]


def join_rings(segments):
    """Join open member ways of a multipolygon into closed rings."""
    segs = [list(s) for s in segments if len(s) > 1]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        rings.append(cur)
    return rings


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def poly_dist(pts, ring):
    return min(seg_dist(p, ring[i - 1], ring[i]) for p in pts for i in range(len(ring)))


def polyline_dist(pts, line):
    return min(seg_dist(p, line[i - 1], line[i]) for p in pts for i in range(1, len(line)))


def num(v):
    if v is None:
        return None
    try:
        return float(str(v).replace("m", "").strip().split(";")[0])
    except ValueError:
        return None


def jitter(osm_id, lo, hi):
    h = int(hashlib.md5(osm_id.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return lo + (hi - lo) * h


ROAD_WIDTH = {
    "primary": 9.0, "secondary": 7.5, "tertiary": 6.5, "unclassified": 5.0, "residential": 5.0,
    "living_street": 4.5, "service": 3.5, "pedestrian": 4.0, "footway": 2.5, "path": 2.0, "steps": 2.5,
}
VEHICLE = {"primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"}


def main():
    els = load()
    curated = json.loads(LANDMARKS.read_text())
    landmarks = curated["landmarks"]
    overrides = {o["osm"]: o for o in curated.get("heightOverrides", [])}
    lm_by_id = {lm["osm"]: lm for lm in landmarks}
    origin = next(e for e in els if e["type"] == "node" and e["id"] == ORIGIN_NODE)
    xy = projector(origin["lat"], origin["lon"])

    def ways_rings(e):
        """-> list of (outer, [holes]) in local metres."""
        if e["type"] == "way":
            r = clean_ring([xy(p) for p in e["geometry"]])
            return [(r, [])] if r else []
        outers = join_rings([[xy(p) for p in m["geometry"]] for m in e["members"]
                             if m["role"] == "outer" and m.get("geometry")])
        inners = join_rings([[xy(p) for p in m["geometry"]] for m in e["members"]
                             if m["role"] == "inner" and m.get("geometry")])
        outers = [clean_ring(r) for r in outers]
        inners = [clean_ring(r, ccw=False) for r in inners]
        out = []
        for o in filter(None, outers):
            holes = [h for h in inners if h and point_in(h[0], o)]
            out.append((o, holes))
        return out

    squares = []
    for e in els:
        if e["type"] == "way" and e["id"] in SQUARE_WAYS:
            ring = clean_ring([xy(p) for p in e["geometry"]])
            squares.append({"id": f"w{e['id']}", "name": e["tags"].get("name"), "outer": ring, "holes": []})
    square_rings = [s["outer"] for s in squares]

    avenue = []
    for e in els:
        t = e.get("tags", {})
        if e["type"] == "way" and t.get("highway") and AVENUE_NAME in (t.get("name") or ""):
            line = [xy(p) for p in e["geometry"]]
            if min(math.hypot(*p) for p in line) < 120:
                avenue.append(line)

    buildings, parts = [], []
    for e in els:
        t = e.get("tags", {})
        if e["type"] == "node" or not ("building" in t or "building:part" in t):
            continue
        if t.get("building") in ("roof", "no") or t.get("layer", "0").startswith("-"):
            continue
        oid = f"{e['type'][0]}{e['id']}"
        for k, (outer, holes) in enumerate(ways_rings(e)):
            cx = sum(p[0] for p in outer) / len(outer)
            cy = sum(p[1] for p in outer) / len(outer)
            h, src = num(t.get("height")), "osm:height"
            if h is None and num(t.get("building:levels")) is not None:
                h, src = num(t["building:levels"]) * 3.2 + 0.8, "osm:levels"
            if oid in overrides:
                h, src = overrides[oid]["h"], "override"
            if h is None and abs(ring_area(outer)) < KIOSK_AREA:
                h, src = 3.5, "default:small"
            if h is None:
                h, src = None, "default"
            min_h = num(t.get("min_height"))
            if min_h is None and num(t.get("building:min_level")) is not None:
                min_h = num(t["building:min_level"]) * 3.2
            b = {
                "id": oid if k == 0 else f"{oid}.{k}",
                "name": t.get("name"),
                "h": r2(h) if h is not None else None, "minH": r2(min_h or 0), "hSrc": src,
                "levels": num(t.get("building:levels")),
                "outer": outer, "holes": holes,
            }
            lm = lm_by_id.get(oid)
            if not lm and not in_rect((cx, cy)):
                continue
            dist_sq = min(poly_dist(outer, r) for r in square_rings)
            dist_av = min((polyline_dist(outer, l) for l in avenue), default=99)
            if lm:
                b["tier"], b["key"] = "landmark", lm["key"]
            elif dist_sq < 3.0:
                b["tier"] = "frontage"
            elif dist_av < 7.0 and math.hypot(cx, cy) < 110:
                b["tier"] = "avenue"
            elif math.hypot(cx, cy) < CORE_RADIUS:
                b["tier"] = "core"
            else:
                b["tier"] = "context"
            b["dSquare"] = r2(dist_sq)
            (parts if "building:part" in t else buildings).append(b)

    # Untagged heights: median of OSM-tagged buildings with a similar footprint, +-12 % so blocks don't line up.
    def area_bin(b):
        a = abs(ring_area(b["outer"]))
        return sum(a >= edge for edge in AREA_BINS)
    tagged = {}
    for b in buildings:
        if b["hSrc"] == "osm:height":
            tagged.setdefault(area_bin(b), []).append(b["h"])
    medians = {k: statistics.median(v) for k, v in tagged.items()}
    for b in buildings + parts:
        if b["h"] is None:
            b["h"] = r2(medians[area_bin(b)] * jitter(b["id"], 0.88, 1.12))
    print("default height medians by area bin", {AREA_BINS[k - 1] if k else 0: round(v, 1) for k, v in sorted(medians.items())})

    # A building outline that holds taller parts: keep the outline, parts stack on top of it.
    for p in parts:
        p["tier"] = "part"

    roads = []
    for e in els:
        t = e.get("tags", {})
        hw = t.get("highway")
        if e["type"] != "way" or not hw or t.get("area") == "yes" or hw not in ROAD_WIDTH:
            continue
        width = num(t.get("width"))
        if width is None and num(t.get("lanes")):
            width = num(t["lanes"]) * 3.2
        for k, part in enumerate(clip_polyline([xy(p) for p in e["geometry"]])):
            road = {
                "id": f"w{e['id']}" + (f".{k}" if k else ""), "name": t.get("name"), "hw": hw,
                "w": r2(width or ROAD_WIDTH[hw]), "car": hw in VEHICLE,
                "pts": [[r2(x), r2(y)] for x, y in part],
            }
            if hw in VEHICLE:   # for build_streets.py: lane markings and road surface
                road.update({k: v for k, v in (("lanes", int(num(t.get("lanes")) or 0)), ("oneway", t.get("oneway") == "yes"),
                                                ("surface", t.get("surface"))) if v})
            roads.append(road)

    green, fountain, trees = [], None, []
    for e in els:
        t = e.get("tags", {})
        if e["type"] == "way" and (t.get("landuse") == "grass" or t.get("leisure") in ("park", "garden")):
            for outer, holes in ways_rings(e):
                if not in_rect(outer[0]):
                    continue
                green.append({"id": f"w{e['id']}", "name": t.get("name"), "outer": outer, "holes": holes})
        if e["type"] == "way" and e["id"] == 402086255:
            ring = clean_ring([xy(p) for p in e["geometry"]])
            cx = sum(p[0] for p in ring) / len(ring)
            cy = sum(p[1] for p in ring) / len(ring)
            r = sum(math.hypot(p[0] - cx, p[1] - cy) for p in ring) / len(ring)
            fountain = {"x": r2(cx), "y": r2(cy), "r": r2(r), "ring": ring}
        if e["type"] == "node" and t.get("natural") == "tree":
            x, y = xy(e)
            if in_rect((x, y)):
                trees.append([r2(x), r2(y)])

    measures = measure_square(squares[0]["outer"], buildings)
    print("square", measures)

    find_fronts(buildings, squares, roads)
    attach_facades(buildings, curated)
    add_bridges(buildings, curated)
    attach_roofs(buildings + parts, curated)
    attach_generic_walls(buildings + parts, curated)
    shop_signs = attach_shops(buildings)

    data = {
        "meta": {
            "measures": measures,
            "title": "議事亭前地 Largo do Senado — massing",
            "origin": {"lat": origin["lat"], "lon": origin["lon"], "name": "噴水池 fountain"},
            "units": "metres",
            "axes": "data x=east, y=north; three.js X=east, Y=up, Z=south",
            "coreRadius": CORE_RADIUS,
            "bounds": list(MAP_RECT),
            "source": "© OpenStreetMap contributors (ODbL), Overpass API extract " + json.loads(RAW.read_text())["osm3s"]["timestamp_osm_base"],
        },
        "landmarks": landmarks,
        "wallColors": {k: {"hex": v["hex"], "label": v["label"], **({"trim": v["trim"]["hex"]} if "trim" in v else {})}
                       for k, v in curated.get("wallColors", {}).items() if not k.startswith("_")},
        "windowColors": {k: {f: v[f] for f in ("hex", "frame", "label") if f in v}
                         for k, v in curated.get("windowColors", {}).items() if not k.startswith("_")},
        "roofPalette": {k: {"hex": v["hex"], "label": v["label"]}
                        for k, v in curated["roofPalette"].items() if not k.startswith("_")},
        "genericWalls": [{"hex": v["hex"], "label": v["label"]} for v in curated["genericWalls"]["colors"]],
        "squares": squares,
        "buildings": buildings,
        "parts": parts,
        "roads": roads,
        "green": green,
        "fountain": fountain,
        "trees": trees,
    }
    if shop_signs:
        data["shopSigns"] = shop_signs
    if STREETS.exists():   # kerbs, markings and furniture from build_streets.py (run it after this script, then rerun)
        data["streets"] = json.loads(STREETS.read_text())
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    tiers = {}
    for b in buildings:
        tiers[b["tier"]] = tiers.get(b["tier"], 0) + 1
    srcs = {}
    for b in buildings:
        srcs[b["hSrc"]] = srcs.get(b["hSrc"], 0) + 1
    print(f"wrote {OUT.relative_to(ROOT.parent)}  {OUT.stat().st_size // 1024} KB")
    print("buildings", len(buildings), tiers, "heights", srcs, "parts", len(parts), "roads", len(roads))


MOUTH = ((-30.4, -6.07), (-3.85, -33.15))   # square edge on Av. de Almeida Ribeiro (OSM vertices)
NORTH_TIP = (51.1, 64.9)                      # where Largo do Senado meets Largo de S. Domingos
CHURCH_DOOR = (54.7, 100.7)                   # centre of the São Domingos facade line


def measure_square(ring, buildings):
    """Mouth width, length, narrowest width (paving and facade-to-facade) along the square's axis."""
    (ax0, ay0), (bx0, by0) = MOUTH
    mid = ((ax0 + bx0) / 2, (ay0 + by0) / 2)
    L = math.hypot(NORTH_TIP[0] - mid[0], NORTH_TIP[1] - mid[1])
    ax = ((NORTH_TIP[0] - mid[0]) / L, (NORTH_TIP[1] - mid[1]) / L)
    nx = (-ax[1], ax[0])

    def cuts(c, rings):
        out = []
        for r in rings:
            for i in range(len(r)):
                p, q = r[i], r[(i + 1) % len(r)]
                d = (q[0] - p[0], q[1] - p[1])
                den = nx[0] * d[1] - nx[1] * d[0]
                if abs(den) < 1e-9:
                    continue
                s = ((p[0] - c[0]) * d[1] - (p[1] - c[1]) * d[0]) / den
                u = ((p[0] - c[0]) * nx[1] - (p[1] - c[1]) * nx[0]) / den
                if 0 <= u <= 1:
                    out.append(s)
        return out

    near = [b["outer"] for b in buildings if b["dSquare"] < 15]
    best = None
    for k in range(int(L * 0.9), int(L * 1.96)):
        t = k / 2
        c = (mid[0] + ax[0] * t, mid[1] + ax[1] * t)
        sq = cuts(c, [ring])
        if len(sq) < 2:
            continue
        w = max(sq) - min(sq)
        b = cuts(c, near)
        left = [s for s in b if s > max(sq) - 0.01]
        right = [s for s in b if s < min(sq) + 0.01]
        if left and right and (best is None or w < best[0]):
            best = (w, min(left) - max(right))
    return {
        "mouthWidth": r2(math.hypot(bx0 - ax0, by0 - ay0)),
        "length": r2(L),
        "toChurch": r2(L + math.hypot(CHURCH_DOOR[0] - NORTH_TIP[0], CHURCH_DOOR[1] - NORTH_TIP[1])),
        "narrowPaving": r2(best[0]),
        "narrowFacades": r2(best[1]),
        "area": round(abs(ring_area(ring))),
    }


FRONT_TIERS = ("landmark", "frontage", "avenue")
FRONT_PROBE = 1.2       # m; sample this far outside each wall to see what it faces
FRONT_MIN_LEN = 2.0     # m; shorter wall segments are corners and jogs, not facades


def find_fronts(buildings, squares, roads):
    """Mark each wall of the buildings around the square that faces the square or a street.

    b["fronts"] = [{"i": edge index, "len": m, "kind": "square" | "street"}]; edge i runs outer[i] -> outer[i+1].
    """
    near = [b for b in buildings if b["tier"] in FRONT_TIERS or b["dSquare"] < 15]
    others = [(b, bbox(b["outer"])) for b in buildings if b["dSquare"] < 60 or b["tier"] in FRONT_TIERS]
    sq_rings = [s["outer"] for s in squares]

    def in_building(p, me):
        for b, (x0, y0, x1, y1) in others:
            if b is not me and x0 <= p[0] <= x1 and y0 <= p[1] <= y1 and point_in(p, b["outer"]):
                return True
        return False

    def near_road(p):
        for r in roads:
            if polyline_dist([p], r["pts"]) < r["w"] / 2 + 3.5:
                return True
        return False

    for b in near:
        ring, fronts = b["outer"], []
        for i in range(len(ring)):
            a, c = ring[i], ring[(i + 1) % len(ring)]
            L = math.hypot(c[0] - a[0], c[1] - a[1])
            if L < FRONT_MIN_LEN:
                continue
            nx, ny = (c[1] - a[1]) / L, -(c[0] - a[0]) / L   # outward for a CCW ring
            votes = {"square": 0, "street": 0}
            for t in (0.2, 0.5, 0.8):
                p = (a[0] + (c[0] - a[0]) * t + nx * FRONT_PROBE, a[1] + (c[1] - a[1]) * t + ny * FRONT_PROBE)
                if in_building(p, b):
                    continue
                if any(point_in(p, r) or poly_dist([p], r) < 3.0 for r in sq_rings):
                    votes["square"] += 1
                elif near_road(p):
                    votes["street"] += 1
            kind = max(votes, key=votes.get)
            if votes[kind] >= 2:
                fronts.append({"i": i, "len": r2(L), "kind": kind})
        b["fronts"] = fronts


def attach_facades(buildings, curated):
    """Copy the photo-based facade spec onto each building and resolve which walls it applies to."""
    styles = curated.get("facadeStyles", {})
    by_id = {b["id"]: b for b in buildings}
    for spec in curated.get("facades", []):
        b = by_id.get(spec["osm"])
        if not b:
            raise SystemExit(f"facade spec for unknown building {spec['osm']}")
        style = facade_style(styles, spec)
        on = spec.get("on", "square")
        if isinstance(on, list):
            edges = on
        else:
            kinds = on.split("+")
            edges = [f["i"] for f in b.get("fronts", []) if f["kind"] in kinds]
        arcade_on = spec.get("arcadeOn", edges if style.get("arcade") else [])
        if isinstance(arcade_on, str):
            kinds = arcade_on.split("+")
            arcade_on = [f["i"] for f in b.get("fronts", []) if f["kind"] in kinds]
        kinds = {f["i"]: f["kind"] for f in b.get("fronts", [])}
        b["facade"] = {"style": spec["style"], **style, "edges": edges, "arcadeEdges": arcade_on,
                       "edgeKinds": {str(i): kinds.get(i, "square") for i in edges},
                       "evidence": spec.get("evidence", []), "note": spec.get("note"),
                       "wallColor": wall_color(curated, spec)}


def attach_shops(buildings):
    """Shop kinds and sign placements from shops.json onto the buildings; returns the sign atlas for the model."""
    if not SHOPS.exists():
        return None
    shops = json.loads(SHOPS.read_text())
    atlas = json.loads(SIGN_ATLAS.read_text())["signs"] if SIGN_ATLAS.exists() else {}
    for sid, spec in shops["signs"].items():
        a = atlas.get(sid)
        if not a or a["w"] != spec["w"] or a["h"] != spec["h"]:
            raise SystemExit(f"sign {sid} is not in sign_atlas.json as drawn; run make_shop_textures.py first")
    by_id = {b["id"]: b for b in buildings}
    for spec in shops["buildings"]:
        b = by_id.get(spec["osm"])
        if not b:
            raise SystemExit(f"shop spec for unknown building {spec['osm']}")
        for p in spec.get("signs", []):
            ids = p.get("sign", [])
            for sid in ids if isinstance(ids, list) else [ids]:
                if sid not in atlas:
                    raise SystemExit(f"{spec['osm']}: unknown sign {sid}")
        b["shops"] = {"kinds": spec.get("kinds", {}), "signs": spec.get("signs", []),
                      "evidence": spec.get("evidence", []), "note": spec.get("note")}
    for kind, ids in shops["generic"].items():
        for sid in ids:
            if sid not in atlas:
                raise SystemExit(f"generic {kind}: unknown sign {sid}")
    return {"atlas": "signs.png", "signs": atlas, "generic": shops["generic"]}


def facade_style(styles, spec):
    """Style dict with the spec's overrides; a spec's windows entry is merged key by key over the style's."""
    style = dict(styles[spec["style"]])
    style.update(spec.get("override", {}))
    if "windows" in spec:
        style["windows"] = {**style.get("windows", {}), **spec["windows"]}
    return style


def wall_color(curated, spec):
    """{key, hex, label, photos[, trim]} for a facade spec's photo-sampled wall colour, or None while unchecked."""
    key = spec.get("wall")
    if not key:
        return None
    c = curated["wallColors"][key]
    out = {"key": key, "hex": c["hex"], "label": c["label"], "photos": sorted({x["photo"] for x in c["samples"]})}
    if "trim" in c:                                   # mouldings that are not the usual white
        out["trim"] = c["trim"]["hex"]
    return out


def add_bridges(buildings, curated):
    """Upper floors that span a lane between two OSM buildings (the lane runs under the arcade)."""
    by_id = {b["id"]: b for b in buildings}
    styles = curated.get("facadeStyles", {})
    for br in curated.get("bridges", []):
        def end(ref):
            b = by_id[ref[0]]
            ring, i = b["outer"], ref[1]
            a, c = ring[i], ring[(i + 1) % len(ring)]
            L = math.hypot(c[0] - a[0], c[1] - a[1])
            n = ((c[1] - a[1]) / L, -(c[0] - a[0]) / L)
            return (c if ref[2] == "end" else a), n
        (A, nA), (B, nB) = end(br["from"]), end(br["to"])
        d = br["depth"]
        ring = clean_ring([A, B, (B[0] - nB[0] * d, B[1] - nB[1] * d), (A[0] - nA[0] * d, A[1] - nA[1] * d)])
        front = next(i for i in range(len(ring)) if ring[i] == [r2(A[0]), r2(A[1])] and ring[(i + 1) % len(ring)] == [r2(B[0]), r2(B[1])])
        style = facade_style(styles, br)
        buildings.append({
            "id": br["id"], "name": br["name"], "h": br["h"], "minH": 0, "hSrc": "bridge", "levels": None,
            "outer": ring, "holes": [], "tier": "frontage", "dSquare": 0.0,
            "facade": {"style": br["style"], **style, "edges": [front], "arcadeEdges": [front], "passage": True,
                       "edgeKinds": {str(front): "square"},
                       "evidence": br.get("evidence", []), "note": br.get("note"), "wallColor": wall_color(curated, br)},
        })


def attach_roofs(items, curated):
    """Roof material class (classify_roofs.py) and roof shape.

    Gables: the landmarks listed in roofShapes (ridge along the footprint's long axis), plus low terracotta roofs
    (class "red", h <= 14 m) whose footprint is close to a rectangle. Everything else stays flat.
    """
    classes = json.loads(ROOF_CLASSES.read_text()) if ROOF_CLASSES.exists() else {}
    shapes = {k: v for k, v in curated.get("roofShapes", {}).items() if not k.startswith("_")}
    gables = 0
    for b in items:
        roof = {"cls": classes.get(b["id"], "grey")}
        spec = shapes.get(b["id"])
        auto = (spec is None and roof["cls"] == "red" and not b.get("facade") and not b["holes"]
                and b["h"] <= 14 and not b.get("minH"))
        if (spec and spec.get("type") == "gable") or auto:
            box = min_rect(b["outer"])
            if spec or (box["fill"] >= 0.88 and 4 <= box["short"] <= 14):
                spec = spec or {}
                rise = spec.get("rise") or round(min(2.8, box["short"] / 2 * math.tan(math.radians(25))), 2)
                axis, c = box["axis"], box["c"]
                if "front" in spec:                   # ridge runs back from the middle of the entrance wall
                    p, q = b["outer"][spec["front"]], b["outer"][(spec["front"] + 1) % len(b["outer"])]
                    L = math.hypot(q[0] - p[0], q[1] - p[1])
                    axis = (-(q[1] - p[1]) / L, (q[0] - p[0]) / L)
                    c = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
                shape = {"type": "gable", "rise": rise, "eave": spec.get("eave", r2(b["h"] - rise)),
                         "axis": [round(axis[0], 4), round(axis[1], 4)], "c": [r2(c[0]), r2(c[1])]}
                if "halfWidth" in spec:
                    shape["halfWidth"] = spec["halfWidth"]
                roof["shape"] = shape
                gables += 1
        b["roof"] = roof
    print("roofs", len(items), "classified", sum(1 for b in items if b["id"] in classes), "gables", gables)


def min_rect(ring):
    """Minimum-area bounding rectangle: long axis (unit), centre, long and short side, footprint/rectangle area."""
    best = None
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6:
            continue
        u = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        su = [p[0] * u[0] + p[1] * u[1] for p in ring]
        sn = [-p[0] * u[1] + p[1] * u[0] for p in ring]
        w, h = max(su) - min(su), max(sn) - min(sn)
        if best is None or w * h < best[0]:
            best = (w * h, u, (min(su) + max(su)) / 2, (min(sn) + max(sn)) / 2, w, h)
    area, u, mu, mn, w, h = best
    c = (mu * u[0] - mn * u[1], mu * u[1] + mn * u[0])
    axis = u if w >= h else (-u[1], u[0])
    return {"axis": axis, "c": c, "long": max(w, h), "short": min(w, h), "fill": ring_area(ring) / area if area else 0}


def attach_generic_walls(items, curated):
    """Buildings without photo evidence get a muted colour from a weighted generic palette (stable per OSM id).

    Landmarks keep the colour listed for them in landmarks.json (marked pending there while unchecked)."""
    colors = curated["genericWalls"]["colors"]
    total = sum(c["w"] for c in colors)
    for b in items:
        if b.get("facade") or b["tier"] == "landmark":
            continue
        t = jitter(b["id"] + ":wall", 0, total)
        for i, c in enumerate(colors):
            t -= c["w"]
            if t <= 0 or i == len(colors) - 1:
                b["wallGeneric"] = i
                break


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def in_rect(p):
    return MAP_RECT[0] <= p[0] <= MAP_RECT[2] and MAP_RECT[1] <= p[1] <= MAP_RECT[3]


def clip_polyline(pts):
    """Liang-Barsky clip of a polyline to MAP_RECT -> list of polylines."""
    x0, y0, x1, y1 = MAP_RECT
    out, cur = [], []
    for a, b in zip(pts, pts[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t0, t1, ok = 0.0, 1.0, True
        for p, q in ((-dx, a[0] - x0), (dx, x1 - a[0]), (-dy, a[1] - y0), (dy, y1 - a[1])):
            if p == 0:
                if q < 0:
                    ok = False
                continue
            r = q / p
            if p < 0:
                t0 = max(t0, r)
            else:
                t1 = min(t1, r)
        if not ok or t0 > t1:
            if cur:
                out.append(cur)
                cur = []
            continue
        pa = (a[0] + t0 * dx, a[1] + t0 * dy)
        pb = (a[0] + t1 * dx, a[1] + t1 * dy)
        if not cur:
            cur = [pa]
        cur.append(pb)
        if t1 < 1:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return [c for c in out if len(c) > 1]


def point_in(p, ring):
    x, y = p
    inside = False
    for i in range(len(ring)):
        x1, y1 = ring[i - 1]
        x2, y2 = ring[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


if __name__ == "__main__":
    main()
