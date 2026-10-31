"""A dim sum table for eight (G⓪b), on a round rug: a round table under a cloth that falls in folds, a glass lazy susan with a clay
teapot, steamer baskets and plates of dumplings, a place laid at each seat (plate, bowl, cup, chopsticks), and eight
wooden chairs with round-railed backs. Origin: the table's middle on the floor."""

import math

from kit import box, cyl, lathe, ring, sphere

TOP = 0.76  # the table top
R = 0.85  # its radius (room.json tables)
SEATS = 8


def teapot(x, z, y):
    lathe([(0.0, 0.0), (0.06, 0.0), (0.085, 0.03), (0.09, 0.07), (0.075, 0.11), (0.04, 0.125), (0.0, 0.125)],
          (x, y, z), "clay", seg=20)
    lathe([(0.042, 0.0), (0.045, 0.012), (0.012, 0.02), (0.014, 0.04), (0.0, 0.045)], (x, y + 0.122, z), "clay", seg=16)
    cyl(0.012, 0.09, (x + 0.075, y + 0.03, z), "clay", seg=8, r2=0.008, tilt=("z", -0.9))
    ring(0.04, 0.009, (x - 0.095, y + 0.07, z), "clay", seg=14, tube_seg=6, tilt=("x", math.pi * 0.5))


def steamer(x, z, y, layers=2):
    """A stack of bamboo steamer baskets under a lid."""
    r = 0.11
    for i in range(layers):
        lathe([(r * 0.97, 0.0), (r, 0.005), (r, 0.05), (r * 0.97, 0.055)], (x, y + i * 0.055, z), "bamboo", seg=20,
              smooth=False)
        ring(r, 0.005, (x, y + i * 0.055 + 0.028, z), "bamboo_dark", seg=20, tube_seg=4)
    lid_y = y + layers * 0.055
    lathe([(r, 0.0), (r, 0.02), (r * 0.7, 0.045), (0.0, 0.05)], (x, lid_y, z), "bamboo", seg=20, smooth=False)


def plate_of(x, z, y, food, n=4, r=0.09):
    lathe([(0.0, 0.0), (r * 0.7, 0.0), (r, 0.015), (r * 1.05, 0.02), (0.0, 0.012)], (x, y, z), "porcelain", seg=20)
    ring(r * 1.02, 0.004, (x, y + 0.018, z), "porcelain_blue", seg=20, tube_seg=4)
    for k in range(n):
        a = k * 2.0 * math.pi / n
        px, pz = x + math.cos(a) * r * 0.45, z + math.sin(a) * r * 0.45
        if food == "siumai":
            cyl(0.024, 0.03, (px, y + 0.012, pz), "siumai", seg=10, r2=0.02)
            sphere(0.008, (px, y + 0.044, pz), "roe", seg=6, rings=4)
        else:
            sphere(0.028, (px, y + 0.014, pz), "dumpling", seg=10, rings=6, scale=(1.0, 0.8, 0.85), rot=a)


def place(a, d):
    """A place laid at angle `a`, `d` from the middle: plate, bowl on it, a cup, chopsticks on a rest."""
    x, z = math.cos(a) * d, math.sin(a) * d
    lathe([(0.0, 0.0), (0.06, 0.0), (0.085, 0.012), (0.09, 0.016), (0.0, 0.008)], (x, TOP, z), "porcelain", seg=18)
    lathe([(0.0, 0.0), (0.025, 0.0), (0.045, 0.02), (0.05, 0.045), (0.044, 0.045), (0.022, 0.012), (0.0, 0.012)],
          (x, TOP + 0.014, z), "porcelain", seg=16)
    ring(0.049, 0.003, (x, TOP + 0.058, z), "porcelain_blue", seg=16, tube_seg=4)
    side = a + 0.42
    cx, cz = math.cos(side) * d, math.sin(side) * d
    lathe([(0.0, 0.0), (0.022, 0.0), (0.03, 0.04), (0.026, 0.04), (0.018, 0.006), (0.0, 0.006)], (cx, TOP, cz),
          "porcelain", seg=12)
    turn = -a
    ox, oz = math.cos(a - 0.38) * (d - 0.02), math.sin(a - 0.38) * (d - 0.02)
    for s in (-0.012, 0.012):
        px, pz = ox + math.cos(a + math.pi * 0.5) * s, oz + math.sin(a + math.pi * 0.5) * s
        box((0.22, 0.008, 0.008), (px, TOP + 0.012, pz), "vermilion", rot=turn)


def chair(a, d):
    """A horseshoe-backed wooden chair at angle `a`, `d` out, facing the table: four legs with stretchers, a seat,
    a bent rail round the back on two back posts and two arm posts, a splat."""
    x, z = math.cos(a) * d, math.sin(a) * d
    rot = math.pi * 0.5 - a  # the chair's front (its own -z) towards the middle
    c, s = math.cos(rot), math.sin(rot)

    def at(lx, ly, lz):
        return (x + lx * c + lz * s, ly, z - lx * s + lz * c)

    seat = 0.46
    for lx in (-0.18, 0.18):
        for lz in (-0.17, 0.17):
            cyl(0.018, seat, at(lx, 0.0, lz), "wood_red", seg=8, r2=0.015, rot=rot)
    for lz in (-0.17, 0.17):
        box((0.36, 0.02, 0.02), at(0.0, 0.14, lz), "wood_red", rot=rot)
    box((0.44, 0.035, 0.42), at(0.0, seat + 0.017, 0.0), "wood_red", rot=rot, bev=0.008)
    rail = 0.32
    for lx, lz in ((-0.15, 0.17), (0.15, 0.17), (-0.21, 0.02), (0.21, 0.02)):
        cyl(0.015, rail, at(lx, seat, lz), "wood_red", seg=8, rot=rot)
    ring(0.21, 0.018, at(0.0, seat + rail, 0.02), "wood_red", seg=20, tube_seg=6, rot=rot + math.pi, arc=0.5)
    box((0.12, 0.3, 0.015), at(0.0, seat + 0.16, 0.21), "wood_light", rot=rot, bev=0.004)


def rug():
    """A round rug under the table and chairs: deep red, a dark gold border, a ring of cream lozenges, a dark gold
    ring inside (dark: the floor is where the bullets' yellow must stand out)."""
    r = 1.62
    cyl(r, 0.006, (0.0, 0.0, 0.0), "vermilion_dark", seg=64)
    lathe([(r - 0.12, 0.006), (r - 0.04, 0.006), (r - 0.04, 0.009), (r - 0.12, 0.009)], (0.0, 0.0, 0.0), "gold_dark",
          seg=64, smooth=False)
    lathe([(r - 0.42, 0.006), (r - 0.38, 0.006), (r - 0.38, 0.009), (r - 0.42, 0.009)], (0.0, 0.0, 0.0), "gold_dark",
          seg=64, smooth=False)
    for k in range(24):
        a = k * 2.0 * math.pi / 24.0
        box((0.1, 0.004, 0.1), (math.cos(a) * (r - 0.25), 0.008, math.sin(a) * (r - 0.25)), "cream",
            rot=-a + math.pi * 0.25)


def build():
    rug()
    # the table under its cloth: a top disc and a skirt falling in twelve soft folds to 0.3 m above the floor
    folds = 12
    lathe([(0.0, TOP + 0.005), (R + 0.03, TOP + 0.005), (R + 0.045, TOP - 0.02), (R + 0.06, TOP - 0.2),
           (R + 0.075, 0.33), (R + 0.06, 0.3), (0.0, 0.3)], (0.0, 0.0, 0.0), "cloth", seg=72, smooth=True,
          radial=lambda i, a: 1.0 + (0.0 if i < 2 else 0.04 * (i - 1) / 4.0) * math.cos(a * folds))
    cyl(0.08, 0.3, (0.0, 0.0, 0.0), "wood", seg=12)
    cyl(0.35, 0.03, (0.0, 0.0, 0.0), "wood", seg=16, r2=0.3)
    # the lazy susan: glass on a short wooden spindle
    cyl(0.05, 0.02, (0.0, TOP + 0.005, 0.0), "wood", seg=12)
    cyl(0.45, 0.018, (0.0, TOP + 0.025, 0.0), "glass", seg=36, bev=0.004)
    y = TOP + 0.043
    teapot(0.0, 0.0, y)
    steamer(0.24, -0.12, y, layers=2)
    steamer(-0.2, -0.2, y, layers=1)
    plate_of(-0.24, 0.12, y, "siumai")
    plate_of(0.16, 0.24, y, "dumpling", n=3)
    cyl(0.04, 0.012, (0.32, y, 0.12), "porcelain", seg=12)
    cyl(0.03, 0.012, (-0.33, y, -0.02), "porcelain", seg=12)
    # eight places and eight chairs
    for k in range(SEATS):
        a = (k + 0.5) * 2.0 * math.pi / SEATS
        place(a, R - 0.17)
        chair(a, R + 0.38)
