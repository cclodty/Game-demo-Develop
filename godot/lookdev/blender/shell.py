"""The teahouse's shell (G⓪b), built from room.json: the tall walls (north, east) in layers, a black skirting, ink
green wainscot with raised panels, a gold dado rail, vermilion plaster, a gold frieze and a dark wood cornice, red
pilasters with gold capitals at every opening and corner and between; the low walls (south, west: the camera's
sides) as panelled half walls under a rail, dressed on both faces since the camera sees their outsides; the door
openings framed in red wood, each with a pair of red lacquered leaves set with gold studs and ring pulls; the exits
framed and open; the entry between two capped posts. Origin: the room's middle on the floor."""

import json
import math
import os

from kit import ROOT, box, cyl, ring, sphere

with open(os.path.join(ROOT, "room.json")) as f:
    ROOM = json.load(f)

S = ROOM["scale"]
HX, HZ = ROOM["size"][0] * S * 0.5, ROOM["size"][1] * S * 0.5
WALL_H, LOW_H, T = ROOM["wallH"], ROOM["lowH"], ROOM["wallT"]
DOOR_H = ROOM["doorH"]


def openings(side):
    """[(middle along the wall, width, kind)] on `side`, kind 'door', 'exit' or 'entry', sorted."""
    out = [(d[1] * S, ROOM["doorW"], "door") for d in ROOM["doors"] if d[0] == side]
    out += [(d[1] * S, ROOM["exitW"], "exit") for d in ROOM["exits"] if d[0] == side]
    if ROOM["entry"][0] == side:
        out.append((ROOM["entry"][1] * S, ROOM["exitW"], "entry"))
    return sorted(out)


class Wall:
    """Places things on one wall in its own terms: `u` along it, `y` up, `d` out from its inner face into the room
    (negative into the wall), `size` (along, up, out)."""

    def __init__(self, side):
        self.side = side
        self.length = HX * 2.0 if side in "ns" else HZ * 2.0
        self.low = side in ROOM["lowSides"]

    def pos(self, u, y, d):
        s = self.side
        if s == "n":
            return (u, y, -HZ + d)
        if s == "s":
            return (u, y, HZ - d)
        if s == "w":
            return (-HX + d, y, u)
        return (HX - d, y, u)

    def box(self, u, y, d, size, mat, bev=0.0):
        a, h, o = size
        sz = (a, h, o) if self.side in "ns" else (o, h, a)
        return box(sz, self.pos(u, y, d), mat, bev=bev)

    def runs(self, pad=0.0):
        """The solid stretches between the openings, [(from, to)], each `pad` shorter at an opening."""
        out, frm = [], -self.length * 0.5
        for mid, w, _ in openings(self.side):
            out.append((frm, mid - w * 0.5 - pad))
            frm = mid + w * 0.5 + pad
        out.append((frm, self.length * 0.5))
        return [r for r in out if r[1] - r[0] > 0.05]


def panels(w, u0, u1, y0, y1, d, mat="ink_green_light", target=1.0):
    """Raised panels between u0 and u1, y0 and y1, about `target` wide, standing `d` proud of the face."""
    span = u1 - u0
    n = max(1, round(span / target))
    pw = span / n
    for i in range(n):
        u = u0 + pw * (i + 0.5)
        if pw > 0.3:
            w.box(u, (y0 + y1) * 0.5, d * 0.5, (pw - 0.14, y1 - y0, d), mat, bev=0.008)


def pilaster(w, u, top):
    w.box(u, top * 0.5, 0.03, (0.3, top, 0.06), "wood_red", bev=0.01)
    w.box(u, 0.07, 0.05, (0.36, 0.14, 0.1), "black", bev=0.008)
    w.box(u, top - 0.08, 0.06, (0.38, 0.12, 0.12), "gold", bev=0.01)
    w.box(u, 1.09, 0.065, (0.32, 0.06, 0.06), "gold", bev=0.008)


def tall_layers(w, u0, u1, y_from=0.0):
    """The tall wall's layers on the stretch u0..u1, from `y_from` up (above a door: its lintel)."""
    span, mid = u1 - u0, (u0 + u1) * 0.5
    if span <= 0.02:
        return
    # the wall's body, flush with the inner face
    w.box(mid, (y_from + WALL_H) * 0.5, -T * 0.5, (span, WALL_H - y_from, T), "vermilion")
    if y_from < 0.12:
        w.box(mid, 0.06, 0.012, (span, 0.12, 0.024), "black")
    if y_from < 1.05:
        w.box(mid, (max(y_from, 0.12) + 1.05) * 0.5, 0.004, (span, 1.05 - max(y_from, 0.12), 0.008), "ink_green")
        panels(w, u0 + 0.05, u1 - 0.05, 0.24, 0.93, 0.02)
        w.box(mid, 1.09, 0.025, (span, 0.08, 0.05), "gold", bev=0.01)
    w.box(mid, 2.88, 0.01, (span, 0.08, 0.02), "gold")
    w.box(mid, 3.05, 0.05, (span, 0.22, 0.1), "wood", bev=0.015)
    w.box(mid, 3.17, 0.09, (span, 0.06, 0.18), "wood", bev=0.01)


def low_wall(w, u0, u1):
    """A half wall on u0..u1, panelled on both faces (the camera sees its outside), under a red rail and gold
    strip."""
    span, mid = u1 - u0, (u0 + u1) * 0.5
    w.box(mid, LOW_H * 0.5, -T * 0.5, (span, LOW_H, T), "ink_green")
    for d in (0.0, -T):
        sign = 1.0 if d == 0.0 else -1.0
        w.box(mid, 0.06, d + sign * 0.012, (span, 0.12, 0.024), "black")
        n = max(1, round(span / 1.0))
        pw = span / n
        for i in range(n):
            if pw > 0.3:
                w.box(u0 + pw * (i + 0.5), 0.48, d + sign * 0.01, (pw - 0.14, 0.5, 0.02), "ink_green_light", bev=0.008)
    w.box(mid, LOW_H + 0.03, -T * 0.5, (span + 0.04, 0.06, T + 0.08), "wood_red", bev=0.012)
    w.box(mid, LOW_H + 0.065, -T * 0.5, (span + 0.04, 0.015, T * 0.5), "gold")


def door(w, mid, width):
    """A red wood frame round the opening and a pair of lacquered leaves set a little into it."""
    for k in (-1, 1):
        w.box(mid + k * (width * 0.5 + 0.06), DOOR_H * 0.5, 0.0, (0.12, DOOR_H, T + 0.12), "wood_red", bev=0.01)
    w.box(mid, DOOR_H + 0.06, 0.0, (width + 0.36, 0.12, T + 0.12), "wood_red", bev=0.01)
    w.box(mid, DOOR_H + 0.15, 0.04, (width + 0.2, 0.06, 0.08), "gold", bev=0.008)
    leaf = width * 0.5 - 0.01
    for k in (-1, 1):
        u = mid + k * (leaf * 0.5 + 0.005)
        w.box(u, DOOR_H * 0.5, -0.1, (leaf, DOOR_H - 0.02, 0.06), "vermilion_dark", bev=0.008)
        w.box(u, DOOR_H * 0.5, -0.065, (leaf - 0.12, DOOR_H - 0.3, 0.012), "vermilion", bev=0.004)
        for row in range(5):
            for col in range(3):
                uu = u + (col - 1) * leaf * 0.27
                p = w.pos(uu, 0.55 + row * 0.38, -0.055)
                sphere(0.026, p, "gold", seg=8, rings=4)
        p = w.pos(mid + k * 0.12, 1.15, -0.05)
        cyl(0.07, 0.015, p, "gold", seg=12, tilt=("x", math.pi * 0.5) if w.side in "ns" else ("z", math.pi * 0.5))
        p = w.pos(mid + k * 0.12, 1.05, -0.03)
        ring(0.06, 0.008, p, "gold", seg=14, tube_seg=5, tilt=("x", math.pi * 0.5) if w.side in "ns" else ("z", math.pi * 0.5))


def exit_frame(w, mid, width):
    for k in (-1, 1):
        w.box(mid + k * (width * 0.5 + 0.06), DOOR_H * 0.5, 0.0, (0.12, DOOR_H, T + 0.12), "wood_red", bev=0.01)
    w.box(mid, DOOR_H + 0.06, 0.0, (width + 0.36, 0.12, T + 0.12), "wood_red", bev=0.01)
    # a dark passage beyond, so the opening reads as a way on
    w.box(mid, 0.01, -1.2, (width + 0.4, 0.02, 2.0), "wood")
    w.box(mid, DOOR_H * 0.5, -2.2, (width + 0.4, DOOR_H, 0.05), "black")


def entry_posts(w, mid, width):
    for k in (-1, 1):
        u = mid + k * (width * 0.5 + 0.08)
        w.box(u, (LOW_H + 0.25) * 0.5, -T * 0.5, (0.16, LOW_H + 0.25, T + 0.06), "wood_red", bev=0.012)
        w.box(u, LOW_H + 0.28, -T * 0.5, (0.22, 0.06, T + 0.12), "gold", bev=0.01)
        sphere(0.07, w.pos(u, LOW_H + 0.36, -T * 0.5), "gold", seg=12, rings=6)


def build():
    for side in ("n", "e", "s", "w"):
        w = Wall(side)
        for u0, u1 in w.runs():
            if w.low:
                low_wall(w, u0, u1)
            else:
                tall_layers(w, u0, u1)
        for mid, width, kind in openings(side):
            if w.low:
                entry_posts(w, mid, width)
                continue
            tall_layers(w, mid - width * 0.5, mid + width * 0.5, y_from=DOOR_H + 0.12)
            (door if kind == "door" else exit_frame)(w, mid, width)
        if not w.low:
            # pilasters: at each end of a stretch, and between where a stretch is long
            for u0, u1 in w.runs(pad=0.18):
                ends = [u0 + 0.15, u1 - 0.15]
                n = int((u1 - u0) / 3.2)
                ends += [u0 + (u1 - u0) * (i + 1) / (n + 1) for i in range(n)]
                for u in ends:
                    pilaster(w, u, 2.84)
    # the corners, where two walls' bodies leave a square outside the room
    for sx in (-1, 1):
        for sz in (-1, 1):
            tall = (sz < 0 and "n" not in ROOM["lowSides"]) or (sx > 0 and "e" not in ROOM["lowSides"])
            h = WALL_H if tall else LOW_H
            box((T, h, T), (sx * (HX + T * 0.5), h * 0.5, sz * (HZ + T * 0.5)), "vermilion" if tall else "ink_green")
