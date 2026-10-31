"""What stands on the teahouse floor against its walls, and the dim sum trolley (G⓪b). The wall pieces are built in
the wall's terms (origin on the wall's inner face at floor level, x along it, facing +z into the room); the
trolley round its own middle, its push bar at -x."""

import math

from kit import box, cyl, lathe, poly, ring, sphere, text
from table_set import steamer


def altar():
    """The house shrine: a red cabinet in gold trim, a red back board with a gold 福 under a little roof, two
    electric candles lit red, an incense burner with three sticks, a plate of oranges, three tea cups."""
    w, d = 1.2, 0.5
    box((w, 0.9, d), (0.0, 0.45, d * 0.5), "wood_red", bev=0.012)
    for k in (-1, 1):
        box((w * 0.5 - 0.1, 0.6, 0.012), (k * w * 0.24, 0.45, d + 0.006), "vermilion", bev=0.004)
        sphere(0.025, (k * 0.06, 0.5, d + 0.02), "gold", seg=8, rings=4)
    box((w + 0.04, 0.04, d + 0.04), (0.0, 0.92, d * 0.5), "gold", bev=0.008)
    box((w - 0.1, 0.9, 0.04), (0.0, 1.4, 0.02), "vermilion", bev=0.01)
    for k in (-1, 1):
        box((0.05, 0.98, 0.06), (k * (w * 0.5 - 0.05), 1.4, 0.04), "gold", bev=0.008)
    text("福", 0.5, (0.0, 1.42, 0.042), "gold", depth=0.0)
    box((w + 0.16, 0.06, 0.4), (0.0, 1.9, 0.2), "wood_red", bev=0.012)
    box((w + 0.2, 0.03, 0.42), (0.0, 1.94, 0.21), "gold", bev=0.006)
    for k in (-1, 1):
        cyl(0.035, 0.32, (k * 0.45, 0.94, 0.25), "vermilion", seg=10)
        lathe([(0.0, 0.0), (0.03, 0.02), (0.035, 0.07), (0.0, 0.1)], (k * 0.45, 1.26, 0.25), "lantern_glow", seg=10)
    lathe([(0.0, 0.0), (0.07, 0.0), (0.1, 0.05), (0.11, 0.1), (0.1, 0.12), (0.0, 0.11)], (0.0, 0.94, 0.25), "gold",
          seg=16)
    for k in (-1, 0, 1):
        cyl(0.004, 0.28, (k * 0.03, 1.04, 0.25), "wood_red", seg=4, tilt=("z", k * 0.12))
        sphere(0.008, (k * 0.03 - k * 0.034, 1.32, 0.25), "lantern_glow", seg=6, rings=3)
    lathe([(0.0, 0.0), (0.1, 0.0), (0.13, 0.02), (0.0, 0.015)], (-0.25, 0.94, 0.3), "porcelain", seg=16)
    for (x, z, yy) in ((-0.28, 0.27, 0.0), (-0.22, 0.33, 0.0), (-0.21, 0.26, 0.0), (-0.25, 0.3, 0.06)):
        sphere(0.04, (x, 0.995 + yy, z), "roe", seg=10, rings=6)
    for k in range(3):
        lathe([(0.0, 0.0), (0.02, 0.0), (0.028, 0.035), (0.0, 0.005)], (0.18 + k * 0.07, 0.94, 0.32), "porcelain",
              seg=10)


def fish_tank():
    """The seafood tank: a tiled cabinet, a tank of water in a steel frame with fish and a bubbling pipe, a light
    along the top."""
    w, d = 1.7, 0.65
    box((w, 0.75, d), (0.0, 0.375, d * 0.5), "tile_white", bev=0.01)
    box((w + 0.02, 0.08, d + 0.02), (0.0, 0.04, d * 0.5), "tile_green", bev=0.008)
    box((w + 0.02, 0.05, d + 0.02), (0.0, 0.73, d * 0.5), "tile_green", bev=0.008)
    for i in range(1, 6):
        box((0.008, 0.6, 0.004), (-w * 0.5 + i * w / 6.0, 0.38, d + 0.002), "tile_green")
    th = 0.62
    # no glass to draw: the water is the tank's back and floor, the fish swim in front of it (a deep teal, not the
    # player's cyan: art bible, the functional colours)
    box((w - 0.06, th - 0.06, 0.04), (0.0, 0.75 + th * 0.5, 0.05), "water")
    for k in (-1, 1):
        box((0.02, th - 0.06, d - 0.08), (k * (w * 0.5 - 0.04), 0.75 + th * 0.5, d * 0.5), "water")
    box((w - 0.06, 0.05, d - 0.06), (0.0, 0.775, d * 0.5), "gravel")
    for x in (-w * 0.5, w * 0.5):
        for z in (0.02, d - 0.02):
            box((0.03, th, 0.03), (x, 0.75 + th * 0.5, z), "steel")
    for y in (0.76, 0.75 + th):
        for z in (0.02, d - 0.02):
            box((w, 0.03, 0.03), (0.0, y, z), "steel")
        for x in (-w * 0.5, w * 0.5):
            box((0.03, 0.03, d), (x, y, d * 0.5), "steel")
    box((w + 0.04, 0.06, d + 0.04), (0.0, 0.75 + th + 0.04, d * 0.5), "steel_dark", bev=0.008)
    box((w - 0.1, 0.03, 0.03), (0.0, 0.75 + th + 0.05, d + 0.03), "sign_glow")
    for i, (x, y, z, turn) in enumerate(((-0.5, 0.95, 0.35, 0.3), (-0.1, 1.15, 0.3, 2.9), (0.35, 0.98, 0.4, 0.1),
                                         (0.55, 1.2, 0.25, 3.3), (0.05, 0.88, 0.45, 1.0))):
        sphere(0.08, (x, y, z), "fish", seg=12, rings=6, scale=(1.0, 0.45, 0.32), rot=turn)
        cx, cz = x - math.cos(turn) * 0.09, z + math.sin(turn) * 0.09
        cyl(0.045, 0.06, (cx, y - 0.03, cz), "fish", seg=4, r2=0.0, rot=turn)
    cyl(0.012, th - 0.1, (w * 0.5 - 0.15, 0.78, 0.1), "steel", seg=6)
    for k in range(6):
        sphere(0.012 + k * 0.002, (w * 0.5 - 0.15 + (k % 2) * 0.02, 0.85 + k * 0.08, 0.12), "porcelain", seg=6,
               rings=3)


def counter():
    """The cashier's counter by the way in: red wood, a gold-lettered front, a top with an abacus, a telephone, a
    jar of sweets and a stack of order slips; a tear-off calendar on the wall above."""
    w, d, h = 2.4, 0.6, 1.05
    box((w, h - 0.05, d), (0.0, (h - 0.05) * 0.5, d * 0.5), "wood_red", bev=0.012)
    box((w + 0.08, 0.05, d + 0.08), (0.0, h - 0.025, d * 0.5 + 0.02), "wood_light", bev=0.01)
    box((w - 0.2, h - 0.35, 0.012), (0.0, 0.5, d + 0.006), "vermilion", bev=0.004)
    for k in (-1, 1):
        box((w - 0.16, 0.03, 0.02), (0.0, 0.5 + k * (h - 0.35) * 0.5, d + 0.01), "gold")
        box((0.03, h - 0.32, 0.02), (k * (w - 0.2) * 0.5, 0.5, d + 0.01), "gold")
    text("收銀", 0.26, (0.0, 0.52, d + 0.014), "gold", depth=0.0)
    box((w, 0.1, d), (0.0, 0.05, d * 0.5), "black")
    top = h
    # an abacus
    ax, az = -0.6, 0.35
    box((0.5, 0.03, 0.2), (ax, top + 0.015, az), "wood", bev=0.004)
    for k in (-1, 1):
        box((0.5, 0.025, 0.02), (ax, top + 0.03, az + k * 0.09), "wood")
        box((0.02, 0.025, 0.2), (ax + k * 0.24, top + 0.03, az), "wood")
    box((0.48, 0.02, 0.012), (ax, top + 0.03, az - 0.04), "wood")
    for i in range(9):
        x = ax - 0.2 + i * 0.05
        box((0.004, 0.004, 0.18), (x, top + 0.035, az), "black")
        for j, z in enumerate((-0.065, 0.0, 0.02, 0.04, 0.06)):
            cyl(0.012, 0.012, (x, top + 0.03, az + z), "black" if j else "wood_red", seg=6, tilt=("x", math.pi * 0.5))
    # a telephone
    box((0.2, 0.08, 0.22), (0.15, top + 0.04, 0.3), "vermilion", bev=0.02)
    box((0.22, 0.04, 0.05), (0.15, top + 0.1, 0.3), "black", bev=0.015)
    cyl(0.05, 0.005, (0.15, top + 0.08, 0.36), "cream", seg=12, tilt=("x", -0.6))
    # a sweet jar, order slips on a spike
    lathe([(0.0, 0.0), (0.07, 0.0), (0.08, 0.02), (0.08, 0.16), (0.05, 0.19), (0.05, 0.21), (0.0, 0.21)],
          (0.65, top, 0.3), "glass", seg=16)
    for k in range(5):
        sphere(0.02, (0.63 + (k % 3) * 0.02, top + 0.03 + (k // 3) * 0.03, 0.29 + (k % 2) * 0.02),
               ("roe", "pink", "jade", "siumai", "pink")[k], seg=6, rings=4)
    for k in range(6):
        box((0.1, 0.004, 0.14), (0.9, top + 0.005 + k * 0.005, 0.3), "cream", rot=k * 0.08)
    # the calendar on the wall above
    box((0.32, 0.42, 0.02), (0.8, 1.75, 0.01), "cream", bev=0.004)
    box((0.32, 0.1, 0.022), (0.8, 1.92, 0.012), "vermilion")
    text("31", 0.18, (0.8, 1.72, 0.022), "vermilion", depth=0.0)


def tea_urn():
    """The hot water urn on its steel stand, a gauge and a tap, two kettles and a tray of teapots below."""
    for x in (-0.22, 0.22):
        for z in (0.08, 0.48):
            box((0.03, 0.8, 0.03), (x, 0.4, z), "steel")
    for y in (0.15, 0.8):
        box((0.5, 0.03, 0.46), (0.0, y, 0.28), "steel_dark", bev=0.006)
    lathe([(0.0, 0.0), (0.2, 0.0), (0.21, 0.02), (0.21, 0.5), (0.18, 0.56), (0.08, 0.6), (0.08, 0.64),
           (0.0, 0.64)], (0.0, 0.82, 0.28), "steel", seg=24)
    ring(0.21, 0.01, (0.0, 1.0, 0.28), "steel_dark", seg=24, tube_seg=4)
    cyl(0.05, 0.02, (0.0, 1.15, 0.48), "cream", seg=14, tilt=("x", math.pi * 0.5))
    box((0.06, 0.05, 0.12), (0.0, 0.92, 0.52), "steel_dark")
    box((0.03, 0.06, 0.03), (0.0, 0.88, 0.57), "black")
    for x in (-0.12, 0.12):
        lathe([(0.0, 0.0), (0.09, 0.0), (0.1, 0.06), (0.07, 0.12), (0.03, 0.13), (0.0, 0.13)], (x, 0.165, 0.28),
              "steel", seg=14)
    for x in (-0.12, 0.12):
        ring(0.05, 0.006, (x, 0.32, 0.28), "black", seg=10, tube_seg=4, tilt=("x", math.pi * 0.5), arc=0.5)


def plant():
    """Lucky bamboo in a blue-and-white vase: stalks with knuckles, leaves fanning out."""
    lathe([(0.0, 0.0), (0.12, 0.0), (0.16, 0.12), (0.17, 0.3), (0.12, 0.48), (0.1, 0.52), (0.12, 0.56),
           (0.0, 0.55)], (0.0, 0.0, 0.3), "porcelain", seg=20)
    for y in (0.08, 0.42):
        ring(0.16 if y < 0.2 else 0.135, 0.012, (0.0, y, 0.3), "porcelain_blue", seg=20, tube_seg=4)
    for k in range(7):
        a = k * 2.0 * math.pi / 7.0
        h = 0.9 + (k % 3) * 0.3
        x, z = math.cos(a) * 0.05, 0.3 + math.sin(a) * 0.05
        lean = 0.08 * (1 if k % 2 else -1)
        cyl(0.018, h, (x, 0.5, z), "plant", seg=8, tilt=("z", lean))
        for j in range(1, int(h / 0.3) + 1):
            yy = 0.5 + j * 0.3
            ring(0.02, 0.006, (x - math.sin(lean) * j * 0.3, yy, z), "ink_green_light", seg=8, tube_seg=4)
        for j in range(3):
            la = a + j * 2.1
            yy = 0.5 + h - 0.05 - j * 0.12
            lx = x - math.sin(lean) * (h - 0.05) + math.cos(la) * 0.09
            box((0.2, 0.004, 0.05), (lx, yy, z + math.sin(la) * 0.09), "plant", rot=-la, tilt=("z", 0.35))


def screen():
    """A four-leaf folding screen: red wood frames, gold rails, cream panels painted with ink green hills and a
    vermilion sun, standing in a zigzag."""
    leaf, h = 0.55, 1.9
    x = -leaf * 2.0
    z = 0.25
    for i in range(4):
        turn = 0.35 if i % 2 == 0 else -0.35
        dx, dz = math.cos(turn) * leaf, -math.sin(turn) * leaf
        cx, cz = x + dx * 0.5, z + dz * 0.5
        c, s = math.cos(turn), math.sin(turn)

        def at(lx, ly, lz):
            return (cx + lx * c + lz * s, ly, cz - lx * s + lz * c)

        for k in (-1, 1):
            box((0.05, h, 0.05), at(k * (leaf * 0.5 - 0.025), h * 0.5, 0.0), "wood_red", rot=turn, bev=0.008)
            box((leaf, 0.05, 0.05), at(0.0, h * 0.5 + k * (h * 0.5 - 0.06), 0.0), "wood_red", rot=turn, bev=0.008)
        box((leaf - 0.08, 0.05, 0.03), at(0.0, h - 0.3, 0.0), "gold", rot=turn)
        box((leaf - 0.08, 0.05, 0.03), at(0.0, 0.3, 0.0), "gold", rot=turn)
        box((leaf - 0.08, h - 0.68, 0.015), at(0.0, h * 0.5 + 0.02, 0.0), "cream", rot=turn)
        box((leaf - 0.08, 0.2, 0.015), at(0.0, 0.17, 0.0), "wood", rot=turn)
        # the painting: two hills on each leaf, a pale one behind a dark one, peaks rising and falling along it
        for j, (hx, peak, mat) in enumerate(((-0.06, 0.5 + (i % 3) * 0.1, "jade"), (0.08, 0.32 + (i % 2) * 0.1,
                                                                                   "ink_green"))):
            pts = [(hx - 0.2, 0.0), (hx + 0.2, 0.0), (hx + 0.02 * (j - 0.5), -peak)]
            poly(pts, 0.004, at(0.0, 0.42, 0.01 + j * 0.004), mat, rot=turn, tilt=("x", math.pi * 0.5))
        if i == 1:
            cyl(0.08, 0.004, at(0.12, 1.3, 0.012), "vermilion", seg=16, rot=turn, tilt=("x", math.pi * 0.5))
        x += dx
        z += dz


def trolley():
    """The dim sum trolley: a steel cart on four castors with two shelves, a push bar, steamer stacks on top, a
    card on a stem naming what it carries, a tray of tea cups below."""
    L, W = 1.1, 0.6
    for x in (-L * 0.5 + 0.03, L * 0.5 - 0.03):
        for z in (-W * 0.5 + 0.03, W * 0.5 - 0.03):
            box((0.035, 0.6, 0.035), (x, 0.4, z), "steel")
            cyl(0.05, 0.035, (x, 0.05, z - 0.0175), "rubber", seg=12, tilt=("x", math.pi * 0.5))
            box((0.03, 0.06, 0.03), (x, 0.1, z), "steel_dark")
    box((L, 0.04, W), (0.0, 0.7, 0.0), "steel", bev=0.008)
    box((L + 0.02, 0.06, W + 0.02), (0.0, 0.66, 0.0), "steel_dark", bev=0.008)
    box((L, 0.03, W), (0.0, 0.24, 0.0), "steel", bev=0.006)
    for z in (-W * 0.5 + 0.03, W * 0.5 - 0.03):
        box((0.12, 0.03, 0.03), (-L * 0.5 - 0.06, 0.88, z), "steel")
        box((0.03, 0.2, 0.03), (-L * 0.5 - 0.0, 0.79, z), "steel")
    cyl(0.022, W, (-L * 0.5 - 0.12, 0.88, -W * 0.5), "black", seg=10, tilt=("x", math.pi * 0.5))
    for i, (x, layers) in enumerate(((-0.33, 3), (0.0, 4), (0.33, 2))):
        steamer(x, -0.1, 0.72, layers=layers)
        steamer(x + 0.04, 0.15, 0.72, layers=max(1, layers - 1))
    cyl(0.008, 0.45, (0.45, 0.72, 0.22), "steel", seg=6)
    box((0.26, 0.16, 0.01), (0.45, 1.2, 0.22), "cream", bev=0.003)
    text("點心", 0.1, (0.45, 1.2, 0.226), "vermilion", depth=0.0)
    box((0.5, 0.02, 0.35), (0.15, 0.27, 0.0), "wood", bev=0.004)
    for k in range(6):
        lathe([(0.0, 0.0), (0.022, 0.0), (0.03, 0.04), (0.026, 0.04), (0.018, 0.006), (0.0, 0.006)],
              (0.0 + (k % 3) * 0.12, 0.28, -0.08 + (k // 3) * 0.14), "porcelain", seg=10)
