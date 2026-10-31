"""What hangs on the teahouse's tall walls (G⓪b). Each is built in the wall's own terms: origin on the wall's inner
face at floor level, x along the wall, +z out into the room (the prop faces +z); room.json `decor` says on which wall
and where along it. Nothing stands more than half a metre out: nothing hangs over the floor."""

import math

from kit import box, cyl, lathe, ring, sphere, text, vtext

DISHES = ["蝦餃", "燒賣", "叉燒包", "腸粉", "鳳爪", "排骨", "糯米雞", "馬拉糕"]


def window():
    """A lattice window lit warm from behind: a dark frame and sill, a grid of bars round a diamond and a ring."""
    w, h, y = 1.8, 1.3, 1.95
    box((w - 0.1, h - 0.1, 0.02), (0.0, y, 0.01), "paper_glow")
    for k in (-1, 1):
        box((0.1, h + 0.1, 0.1), (k * w * 0.5, y, 0.05), "wood", bev=0.01)
        box((w + 0.1, 0.1, 0.1), (0.0, y + k * h * 0.5, 0.05), "wood", bev=0.01)
    box((w + 0.3, 0.06, 0.16), (0.0, y - h * 0.5 - 0.08, 0.08), "wood_red", bev=0.01)
    for i in range(1, 6):
        x = -w * 0.5 + i * w / 6.0
        if abs(x) > 0.3:
            box((0.03, h, 0.04), (x, y, 0.04), "wood")
    for j in range(1, 4):
        yy = y - h * 0.5 + j * h / 4.0
        box((w, 0.03, 0.04), (0.0, yy, 0.04), "wood")
    # a diamond round the middle, its corners on the bars
    for sx, sy in ((1, 1), (1, -1), (-1, -1), (-1, 1)):
        box((0.45, 0.03, 0.035), (sx * 0.16, y + sy * 0.16, 0.045), "wood", tilt=("z", -sx * sy * math.pi * 0.25))
    ring(0.13, 0.016, (0.0, y, 0.05), "gold", seg=20, tube_seg=5, tilt=("x", math.pi * 0.5))


def menu_boards():
    """The dim sum boards: eight hanging boards on a rail, red with gold names and cream with red ones in turn."""
    n, gap = len(DISHES), 0.3
    top = 2.62
    box((n * gap + 0.2, 0.05, 0.06), (0.0, top + 0.06, 0.03), "wood", bev=0.01)
    for i, dish in enumerate(DISHES):
        x = (i - (n - 1) * 0.5) * gap
        red = i % 2 == 0
        hgt = 0.2 + 0.22 * len(dish)
        box((0.24, hgt, 0.025), (x, top - hgt * 0.5, 0.06), "wood_red" if red else "cream", bev=0.006)
        box((0.008, 0.05, 0.008), (x, top + 0.01, 0.06), "gold")
        vtext(dish, 0.17, (x, top - hgt * 0.5, 0.076), "gold" if red else "vermilion", depth=0.0)


def plaque():
    """The house's name board over the way in: black lacquer in a gold frame, gold characters, a red silk sash along
    its top knotted at the middle, the knot's ends short of the characters."""
    w, h, y = 2.3, 0.5, 2.83
    box((w, h, 0.05), (0.0, y, 0.12), "black", bev=0.01)
    for k in (-1, 1):
        box((w + 0.08, 0.05, 0.07), (0.0, y + k * (h * 0.5 + 0.0), 0.13), "gold", bev=0.008)
        box((0.05, h + 0.08, 0.07), (k * (w * 0.5 + 0.0), y, 0.13), "gold", bev=0.008)
        box((0.06, 0.06, 0.12), (k * w * 0.35, y, 0.06), "wood")
    text("如意茶樓", 0.3, (0.0, y - 0.02, 0.152), "gold", depth=0.0)
    for k in (-1, 1):
        box((0.9, 0.06, 0.03), (k * 0.5, y + h * 0.5 + 0.06, 0.17), "vermilion", tilt=("z", k * 0.08))
    sphere(0.07, (0.0, y + h * 0.5 + 0.06, 0.18), "vermilion", seg=10, rings=6)
    for k in (-1, 1):
        box((0.05, 0.12, 0.02), (k * 0.06, y + h * 0.5 - 0.02, 0.19), "vermilion", tilt=("z", k * 0.3))


def lantern():
    """A red paper lantern on a wall bracket: ribbed, lit from inside, gold caps, a tassel."""
    y = 2.55
    box((0.06, 0.06, 0.48), (0.0, y + 0.52, 0.24), "wood", bev=0.008)
    box((0.08, 0.18, 0.05), (0.0, y + 0.47, 0.025), "wood", bev=0.008)
    cyl(0.006, 0.12, (0.0, y + 0.37, 0.44), "gold", seg=6)
    lathe([(0.0, -0.22), (0.1, -0.21), (0.2, -0.13), (0.24, 0.0), (0.2, 0.13), (0.1, 0.21), (0.0, 0.22)],
          (0.0, y + 0.0, 0.44), "lantern_glow", seg=24, radial=lambda i, a: 1.0 + 0.03 * math.cos(a * 12.0))
    cyl(0.1, 0.05, (0.0, y + 0.2, 0.44), "gold", seg=14)
    cyl(0.09, 0.04, (0.0, y - 0.24, 0.44), "gold", seg=14)
    cyl(0.012, 0.08, (0.0, y - 0.32, 0.44), "gold", seg=6)
    cyl(0.045, 0.2, (0.0, y - 0.54, 0.44), "vermilion", seg=10, r2=0.012)


def scroll(words="一盅兩件"):
    """A hanging scroll: ink green silk round cream paper, black characters top to bottom, wooden rollers, a cord to
    a hook."""
    y, h, w = 1.95, 1.5, 0.62
    box((w, h, 0.012), (0.0, y, 0.02), "ink_green")
    box((w - 0.12, h - 0.3, 0.014), (0.0, y + 0.02, 0.022), "cream")
    vtext(words, 0.2, (0.0, y + 0.02, 0.031), "black", depth=0.0)
    for yy in (y + h * 0.5, y - h * 0.5):
        cyl(0.022, w + 0.1, (-(w + 0.1) * 0.5, yy, 0.03), "wood", seg=10, tilt=("z", -math.pi * 0.5))
    for k in (-1, 1):
        box((0.006, 0.3, 0.006), (k * 0.14, y + h * 0.5 + 0.13, 0.02), "black", tilt=("z", -k * 0.45))
    sphere(0.02, (0.0, y + h * 0.5 + 0.27, 0.02), "gold", seg=8, rings=4)


def clock():
    """A round wall clock: a gold rim, a cream face with twelve marks, black hands at ten to two."""
    y, r = 2.3, 0.2
    cyl(r, 0.05, (0.0, y, 0.0), "wood", seg=28, tilt=("x", math.pi * 0.5))
    ring(r, 0.02, (0.0, y, 0.05), "gold", seg=28, tube_seg=6, tilt=("x", math.pi * 0.5))
    cyl(r - 0.02, 0.012, (0.0, y, 0.05), "cream", seg=28, tilt=("x", math.pi * 0.5))
    for k in range(12):
        a = k * math.pi / 6.0
        long = k % 3 == 0
        box((0.012, 0.04 if long else 0.022, 0.006), (math.sin(a) * (r - 0.05), y + math.cos(a) * (r - 0.05), 0.065),
            "black", tilt=("z", -a))
    for a, length in ((math.pi / 3.0, 0.1), (-math.pi / 3.0, 0.14)):  # the hour hand at two, the minute at ten
        box((0.014, length, 0.006), (math.sin(a) * length * 0.5, y + math.cos(a) * length * 0.5, 0.072), "black",
            tilt=("z", -a))
    sphere(0.014, (0.0, y, 0.075), "gold", seg=8, rings=4)
