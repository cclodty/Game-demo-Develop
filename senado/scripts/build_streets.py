"""Street detail: lowered carriageways with granite kerbs, lane and crossing markings, street furniture.

Reads data/senado_massing.json (roads with width, lanes and surface; buildings; squares; fountain, all from
build_data.py) and data/osm_street.json (fetch_osm_street.sh), writes data/streets.json, which build_data.py copies
into senado_massing.json as "streets". Needs shapely 2 (pip install shapely); build_data.py stays stdlib-only.

    python3 senado/scripts/build_data.py       # roads, buildings, squares
    python3 senado/scripts/build_streets.py    # -> data/streets.json
    python3 senado/scripts/build_data.py       # merge it

Evidence (reference/photos/credits.json): #047 granite kerb about 15 cm high, concrete roadway, a black signal pole
and a double-lantern lamp post at the square mouth; #263 the same lamp posts and dark green railings along the kerbs
of Av. de Almeida Ribeiro, dashed white lane lines; #087 #049 single-lantern posts at the edge of the square;
#105 #028 #031 large potted topiary and benches in front of the facades. Signals, crossings, bus stops, bollards and
post boxes are OSM nodes; lamp posts, railings, pots and benches are placed by rule (spacing below), not surveyed.
"""
import json
import math
import sys
from pathlib import Path

from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points, substring, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import MAP_RECT, projector  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "senado_massing.json"
STREET = ROOT / "data" / "osm_street.json"
OUT = ROOT / "data" / "streets.json"

DROP = 0.15            # m, kerb height: the carriageway sits this far below the pavements (#047)
BAND = 0.25            # m, granite kerb top
SUNK_R = 7.1           # m, fountain steps radius (FOUNTAIN.stepsOuter in viewer/model.js)
AVENUE = "Almeida Ribeiro"
SURFACES = ("asphalt", "concrete", "setts")
RANK = {"primary": 0, "secondary": 1, "tertiary": 2, "unclassified": 3, "residential": 3, "living_street": 4, "service": 5}
SURFACE_OF = {"asphalt": "asphalt", "concrete": "concrete", "concrete:plates": "concrete", "paving_stones": "setts",
              "sett": "setts", "cobblestone": "setts", "unhewn_cobblestone": "setts"}
LINE_W, DASH, GAP = 0.12, 3.0, 4.0           # lane lines: width, dash, gap (m)
ZEBRA_BAR, ZEBRA_STEP = 0.5, 1.0             # crossing bars 0.5 m wide every 1.0 m
AVENUE_LAMP_STEP = 25.0                      # m between double-lantern posts along each avenue kerb
SQUARE_LAMP_STEP = 18.0                      # m between single-lantern posts round the squares
POT_STEP = 9.0                               # m between potted shrubs along the square facades
PLAZA_GAP = 10.0                             # m; narrower gaps between a square and its facades/kerb are paved too


def r2(v):
    return round(v + 0.0, 2)


def ring_out(coords):
    pts = [[r2(x), r2(y)] for x, y in coords]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()
    return pts


def polys(geom, min_area=0.05):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        geom = [geom]
    elif hasattr(geom, "geoms"):
        geom = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon))]
        geom = [p for g in geom for p in (g.geoms if isinstance(g, MultiPolygon) else [g])]
    return [orient(p, 1.0) for p in geom if p.area >= min_area]


def poly_out(geom, min_area=0.05):
    return [{"outer": ring_out(p.exterior.coords), "holes": [ring_out(h.coords) for h in p.interiors]}
            for p in polys(geom, min_area)]


def clean(geom, eps=0.08):
    """Drop slivers narrower than 2 * eps and simplify."""
    return geom.buffer(-eps, join_style="mitre").buffer(eps, join_style="mitre").simplify(0.03)


def unit(a, b):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    return ((b[0] - a[0]) / L, (b[1] - a[1]) / L) if L > 1e-9 else (1.0, 0.0)


def main():
    data = json.loads(DATA.read_text())
    osm = json.loads(STREET.read_text())
    origin = data["meta"]["origin"]
    xy = projector(origin["lat"], origin["lon"])
    x0, y0, x1, y1 = MAP_RECT

    buildings = unary_union([Polygon(b["outer"], b.get("holes") or []).buffer(0) for b in data["buildings"]])
    squares = unary_union([Polygon(s["outer"]).buffer(0) for s in data["squares"]])
    fc = data["fountain"]
    sunk = Point(fc["x"], fc["y"]).buffer(SUNK_R, quad_segs=16)
    blocked = unary_union([buildings, squares, sunk])
    rect = box(x0, y0, x1, y1)

    cars = [r for r in data["roads"] if r["car"] and len(r["pts"]) > 1]
    foot = [r for r in data["roads"] if not r["car"] and len(r["pts"]) > 1]
    lines = [LineString(r["pts"]) for r in cars]
    bufs = [ln.buffer(r["w"] / 2, quad_segs=4) for ln, r in zip(lines, cars)]

    # carriageway: every vehicle road at its width, minus squares, buildings and the fountain ring
    cw = clean(unary_union(bufs).difference(blocked).intersection(rect))
    cw = unary_union([p for p in polys(cw, 2.0)])
    # where roads overlap, the higher class keeps its surface (the avenue stays concrete across side-street mouths)
    pieces = {s: [] for s in SURFACES}
    covered = Polygon()
    for rank in sorted({RANK.get(r["hw"], 9) for r in cars}):
        mine = [(b, r) for b, r in zip(bufs, cars) if RANK.get(r["hw"], 9) == rank]
        for s in SURFACES:
            u = unary_union([b for b, r in mine if SURFACE_OF.get(r.get("surface"), "asphalt") == s])
            if not u.is_empty:
                pieces[s].append(u.difference(covered))
        covered = covered.union(unary_union([b for b, _ in mine]))
    surface = {s: clean(cw.intersection(unary_union(v)), 0.03) if v else Polygon() for s, v in pieces.items()}

    ground = box(x0 - 30, y0 - 30, x1 + 30, y1 + 30).difference(cw)
    kerbed = cw.buffer(BAND, join_style="mitre", mitre_limit=2.0)
    # The OSM square outlines stop 1-4 m short of the facades and of the avenue kerb, but the wave paving runs up to
    # both (#047, #105, #031): fill gaps narrower than PLAZA_GAP between a square and the buildings or the kerb.
    grass = unary_union([Polygon(g["outer"], g.get("holes") or []).buffer(0) for g in data["green"]])
    local = squares.buffer(PLAZA_GAP + 2)
    solid = unary_union([squares, buildings.intersection(local), kerbed.intersection(local)])
    closed = solid.buffer(PLAZA_GAP / 2, quad_segs=4).buffer(-PLAZA_GAP / 2, quad_segs=4)
    plaza = clean(unary_union([squares, closed.intersection(squares.buffer(PLAZA_GAP, join_style="mitre"))])
                  .difference(buildings).difference(kerbed).difference(grass), 0.05)
    plaza = unary_union(polys(plaza, 1.0))
    blocked = unary_union([buildings, plaza, sunk])
    band = clean(kerbed.difference(cw).difference(blocked), 0.02)
    footways = clean(unary_union([LineString(r["pts"]).buffer(r["w"] / 2, quad_segs=4) for r in foot])
                     .difference(cw.buffer(BAND)).difference(blocked).intersection(rect))
    kerbs = []
    for p in polys(cw):
        for ring in [p.exterior, *p.interiors]:   # oriented with the carriageway on the left
            kerbs.append(ring_out(ring.coords))

    # ---- lookups ----
    tree = STRtree(lines)

    def nearest_road(p, within):
        i = tree.nearest(Point(p))
        if i is None or lines[i].distance(Point(p)) > within:
            return None
        ln = lines[i]
        d = ln.project(Point(p))
        a, b = ln.interpolate(max(0.0, d - 0.5)), ln.interpolate(min(ln.length, d + 0.5))
        return cars[i], unit((a.x, a.y), (b.x, b.y)), ln.interpolate(d)

    def kerb_point(p, n, reach):
        """First point where a ray from p along n leaves the carriageway."""
        ray = LineString([p, (p[0] + n[0] * reach, p[1] + n[1] * reach)])
        hit = ray.intersection(cw.boundary)
        pts = [hit] if isinstance(hit, Point) else [g for g in getattr(hit, "geoms", []) if isinstance(g, Point)]
        if not pts:
            return None
        q = min(pts, key=lambda g: g.distance(Point(p)))
        return (q.x, q.y)

    near_cw = cw.buffer(4.0)
    near_square = plaza.buffer(0.6)
    # poles and bins may stand on the paved squares (#047: signal and lamp post at the mouth), not in buildings or roads
    free = lambda p: not buildings.contains(Point(p)) and not sunk.contains(Point(p)) and not cw.contains(Point(p))

    # junctions: vertices shared by three or more road ends/segments
    degree, wmax = {}, {}
    for r in cars:
        for k, (x, y) in enumerate(r["pts"]):
            key = (round(x, 1), round(y, 1))
            degree[key] = degree.get(key, 0) + (1 if k in (0, len(r["pts"]) - 1) else 2)
            wmax[key] = max(wmax.get(key, 0), r["w"])
    junctions = unary_union([Point(k).buffer(wmax[k] / 2 + 2.0, quad_segs=6) for k, d in degree.items() if d >= 3])

    # ---- crossings ----
    els = osm["elements"]
    nodes = [e for e in els if e["type"] == "node"]
    tags = lambda e: e.get("tags", {})
    marked = lambda t: t.get("crossing") not in ("unmarked", "no") and (t.get("highway") == "crossing" or t.get("crossing") == "traffic_signals")
    crossings = []
    for e in nodes:
        t = tags(e)
        if marked(t):
            p = xy(e)
            hit = nearest_road(p, 2.0)
            if hit:
                crossings.append((hit[2].x, hit[2].y, hit[1], hit[0], t.get("crossing") == "traffic_signals"))
    for e in els:
        t = tags(e)
        if e["type"] != "way" or t.get("footway") != "crossing" or t.get("crossing") in ("unmarked", "no"):
            continue
        way = LineString([xy(p) for p in e["geometry"]])
        for ln, r in zip(lines, cars):
            x = way.intersection(ln)
            if isinstance(x, Point) and all(math.hypot(x.x - c[0], x.y - c[1]) > 4 for c in crossings):
                d = ln.project(x)
                a, b = ln.interpolate(max(0.0, d - 0.5)), ln.interpolate(min(ln.length, d + 0.5))
                crossings.append((x.x, x.y, unit((a.x, a.y), (b.x, b.y)), r, t.get("crossing") == "traffic_signals"))
    inset = cw.buffer(-0.2)
    markings, zones, drawn = [], [], 0
    for cx, cy, u, r, signals in crossings:
        n = (-u[1], u[0])
        L = 4.0 if signals or r["hw"] in ("primary", "secondary") else 3.0
        half = r["w"] / 2 + 1.0
        zones.append(Polygon([(cx + u[0] * s * (L / 2 + 1) + n[0] * t * half, cy + u[1] * s * (L / 2 + 1) + n[1] * t * half)
                              for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))]))
        k, before = -half, len(markings)
        while k + ZEBRA_BAR <= half:
            o0, o1 = k, k + ZEBRA_BAR
            bar = Polygon([(cx + u[0] * s * L / 2 + n[0] * o, cy + u[1] * s * L / 2 + n[1] * o)
                           for s, o in ((-1, o0), (1, o0), (1, o1), (-1, o1))])
            markings += [m for m in polys(bar.intersection(inset), 0.15)]
            k += ZEBRA_STEP
        drawn += len(markings) > before
    zones = unary_union(zones) if zones else Polygon()

    # ---- lane lines ----
    lane_ok = inset.buffer(-0.1).difference(junctions).difference(zones)
    for ln, r in zip(lines, cars):
        lanes = r.get("lanes") or 0
        if lanes < 2 or r["w"] < 5.5:
            continue
        for i in range(1, lanes):
            off = -r["w"] / 2 + i * r["w"] / lanes
            cl = ln.offset_curve(off) if abs(off) > 1e-6 else ln
            if cl.is_empty or not isinstance(cl, LineString):
                continue
            s = 1.0
            while s < cl.length:
                dash = substring(cl, s, min(s + DASH, cl.length))
                if dash.length > 0.5:
                    markings += polys(dash.buffer(LINE_W / 2, cap_style="flat").intersection(lane_ok), 0.06)
                s += DASH + GAP

    # ---- furniture ----
    fur = {k: [] for k in ("lampDouble", "lamp", "signal", "pedSignal", "busStop", "bollard", "block", "postBox",
                           "pot", "bench", "bin", "railing")}
    poles = []

    def take(p, clear=1.0):
        if any(math.hypot(p[0] - q[0], p[1] - q[1]) < clear for q in poles):
            return False
        poles.append(p)
        return True

    ang = lambda v: r2(math.atan2(v[1], v[0]))

    def facade_spot(base, inward, off):
        """Point `off` m from the nearest facade, towards the square edge point `base`; None if unsuitable."""
        nb = nearest_points(buildings, Point(base))[0]
        dist = nb.distance(Point(base))
        if dist > 6.0:
            return None
        v = unit((nb.x, nb.y), base) if dist > 0.05 else inward
        p = (nb.x + v[0] * off, nb.y + v[1] * off)
        P = Point(p)
        if buildings.contains(P) or near_cw.contains(P) or P.distance(Point(fc["x"], fc["y"])) < SUNK_R + 2:
            return None
        return p, v

    # vehicle signals: a pole at each kerb beside the stop node, heads facing the oncoming traffic (#047)
    for e in nodes:
        t = tags(e)
        if t.get("highway") != "traffic_signals":
            continue
        hit = nearest_road(xy(e), 3.0)
        if not hit:
            continue
        r, u, c = hit
        n = (-u[1], u[0])
        for side in (1, -1):
            k = kerb_point((c.x, c.y), (n[0] * side, n[1] * side), r["w"] / 2 + 6)
            if not k:
                continue
            p = (k[0] + n[0] * side * 0.5, k[1] + n[1] * side * 0.5)
            if free(p) and take(p):
                fur["signal"].append([r2(p[0]), r2(p[1]), ang((-u[0], -u[1])), 1 if r.get("oneway") else 2])
    # pedestrian signals at both ends of signalled crossings, facing across the road
    for cx, cy, u, r, signals in crossings:
        if not signals:
            continue
        n = (-u[1], u[0])
        for side in (1, -1):
            k = kerb_point((cx, cy), (n[0] * side, n[1] * side), r["w"] / 2 + 6)
            if not k:
                continue
            p = (k[0] + n[0] * side * 0.5 + u[0] * 2.4, k[1] + n[1] * side * 0.5 + u[1] * 2.4)
            if free(p) and take(p):
                fur["pedSignal"].append([r2(p[0]), r2(p[1]), ang((-n[0] * side, -n[1] * side))])
    for e in nodes:
        t = tags(e)
        p = xy(e)
        if t.get("highway") == "bus_stop":
            hit = nearest_road(p, 15.0)
            if not hit:
                continue
            r, u, c = hit
            side = 1 if (p[0] - c.x) * -u[1] + (p[1] - c.y) * u[0] >= 0 else -1
            n = (-u[1] * side, u[0] * side)
            k = kerb_point((c.x, c.y), n, r["w"] / 2 + 15)
            if k:
                q = (k[0] + n[0] * 0.6, k[1] + n[1] * 0.6)
                if free(q) and take(q):
                    fur["busStop"].append([r2(q[0]), r2(q[1]), ang((-n[0], -n[1]))])
        elif t.get("barrier") in ("bollard", "block") and not buildings.contains(Point(p)):
            fur["bollard" if t["barrier"] == "bollard" else "block"].append([r2(p[0]), r2(p[1])])
        elif t.get("amenity") == "post_box" and free(p):
            hit = nearest_road(p, 30.0)
            fur["postBox"].append([r2(p[0]), r2(p[1]), ang(hit[1]) if hit else 0])

    # avenue kerbs: railings 0.3 m behind the kerb, double-lantern posts every AVENUE_LAMP_STEP (#263, #047)
    for ring in kerbs:
        L = LineString(ring + ring[:1])
        run, last_lamp, dist = [], -AVENUE_LAMP_STEP / 2, 0.0
        n_s = max(2, int(L.length / 1.0))
        for k in range(n_s + 1):
            d = L.length * k / n_s
            a, b = L.interpolate(max(0.0, d - 0.4)), L.interpolate(min(L.length, d + 0.4))
            t_ = unit((a.x, a.y), (b.x, b.y))
            right = (t_[1], -t_[0])
            q = L.interpolate(d)
            hit = nearest_road((q.x, q.y), 1.2 + 6.4)
            on_avenue = hit and AVENUE in (hit[0]["name"] or "") and abs(hit[2].distance(q) - hit[0]["w"] / 2) < 1.0
            rp = (q.x + right[0] * 0.3, q.y + right[1] * 0.3)
            kerbside = on_avenue and not junctions.contains(q) and not zones.contains(q)
            ok = (kerbside and not blocked.contains(Point(rp)) and not cw.contains(Point(rp))
                  and not near_square.contains(Point(rp)))   # no railing where the square opens onto the avenue (#047)
            if ok:
                run.append([r2(rp[0]), r2(rp[1])])
            lp = (q.x + right[0] * 0.75, q.y + right[1] * 0.75)
            if kerbside and d - last_lamp >= AVENUE_LAMP_STEP and free(lp) and take(lp, 3.0):
                fur["lampDouble"].append([r2(lp[0]), r2(lp[1]), ang((-right[0], -right[1]))])
                last_lamp = d
            if not ok or k == n_s:
                if len(run) >= 3:
                    fur["railing"].append(run)
                run = []

    # pots and benches along the facades
    for s in data["squares"]:
        sq = Polygon(s["outer"]).buffer(0)
        # the square outline stops 1-4 m short of the facades; pots and benches stand on that strip, 1.2 m off the wall
        wide = sq.buffer(-4.5)
        coords = list(orient(sq, 1.0).exterior.coords)
        bench_turn = 0
        for i in range(len(coords) - 1):
            a, b = coords[i], coords[i + 1]
            seg = LineString([a, b])
            if seg.length < 4 or seg.interpolate(0.5, normalized=True).distance(buildings) > 5.0:
                continue
            u = unit(a, b)
            m = int(seg.length // POT_STEP)
            for j in range(m):
                d = (seg.length - (m - 1) * POT_STEP) / 2 + j * POT_STEP
                spot = facade_spot((a[0] + u[0] * d, a[1] + u[1] * d), (-u[1], u[0]), 1.2)
                if not spot or Point(a[0] + u[0] * d, a[1] + u[1] * d).distance(wide) > 4.6 or not take(spot[0], 2.5):
                    continue
                p, out_dir = spot
                fur["pot"].append([r2(p[0]), r2(p[1])])
                # a bench between every second pair of pots, facing the square; a bin beside every other bench
                if j + 1 < m and j % 2 == 0:
                    bd = d + POT_STEP / 2
                    bs = facade_spot((a[0] + u[0] * bd, a[1] + u[1] * bd), (-u[1], u[0]), 1.0)
                    if bs and take(bs[0], 1.5):
                        fur["bench"].append([r2(bs[0][0]), r2(bs[0][1]), ang(bs[1])])
                        bench_turn += 1
                        if bench_turn % 2 == 1:
                            cp = (bs[0][0] + u[0] * 1.5, bs[0][1] + u[1] * 1.5)
                            if free(cp) and take(cp, 0.6):
                                fur["bin"].append([r2(cp[0]), r2(cp[1])])

    # squares: single-lantern posts 1.8 m in front of the facades (#087), every SQUARE_LAMP_STEP along the paving edge
    for p in polys(plaza.buffer(-1.8, join_style="mitre"), 20.0):
        ring = p.exterior
        d = SQUARE_LAMP_STEP / 2
        while d < ring.length:
            for shift in (0, 1.5, -1.5, 3.0, -3.0):          # step aside from a pot or bench
                q = ring.interpolate(d + shift)
                if (q.distance(buildings) < 2.3 and not near_cw.contains(q) and q.distance(Point(fc["x"], fc["y"])) > SUNK_R + 2.5
                        and take((q.x, q.y), 2.0)):
                    fur["lamp"].append([r2(q.x), r2(q.y)])
                    break
            d += SQUARE_LAMP_STEP

    out = {
        "note": "Generated by scripts/build_streets.py from senado_massing.json and osm_street.json. Carriageways are "
                "OSM vehicle roads at their width minus squares and buildings; furniture spacing is by rule.",
        "source": "© OpenStreetMap contributors (ODbL), Overpass API extract " + osm["osm3s"]["timestamp_osm_base"],
        "kerb": {"drop": DROP, "band": BAND},
        "carriageway": {s: poly_out(g, 0.5) for s, g in surface.items()},
        "plaza": poly_out(plaza, 1.0),
        "ground": poly_out(ground, 0.5),
        "kerbBand": poly_out(band, 0.02),
        "footways": poly_out(footways, 0.3),
        "kerbs": kerbs,
        "markings": [ring_out(m.exterior.coords) for m in markings],
        "furniture": fur,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT.parent)}  {OUT.stat().st_size // 1024} KB")
    print("plaza m²", round(plaza.area), "squares m²", round(squares.area))
    print("carriageway m²", {s: round(g.area) for s, g in surface.items()}, "kerbs", len(kerbs),
          "kerb m", round(sum(LineString(k + k[:1]).length for k in kerbs)), "crossings", drawn, "of", len(crossings),
          "markings", len(markings))
    print("furniture", {k: len(v) for k, v in fur.items()}, "railing m",
          round(sum(LineString(r).length for r in fur["railing"])))


if __name__ == "__main__":
    main()
