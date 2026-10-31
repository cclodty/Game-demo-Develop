"""The modelling kit the teahouse's props are built with (TASKS.md G⓪b): shapes in the game's coordinates, the
palette as materials, bevels, lathed and swept shapes, Chinese text, and `finish`, which joins a prop into one mesh
and writes it as a .glb for Godot.

Coordinates are the game's: metres, Y up, +Z south (towards the camera). Blender is Z up with -Y south, so every
position goes through `B()`; a turn `rot` (radians) about the up axis is the same number in both (Godot rotation.y).

Each material is a palette name; Godot reads its colour from the .glb and swaps in the toon twin (scripts/
teahouse.gd), and a name with "glow" in it shines. The ink line needs smooth normals where the shading has hard
edges: `finish` writes each vertex's averaged normal (in glTF's axes, octahedron-encoded into 0..1) into the only UV
map, and shaders/outline_model.gdshader pushes the hull out along it. The props have no textures, so UV is free.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

# sRGB, as the art bible and scripts/teahouse.gd write them
PALETTE = {
    "vermilion": (0.6, 0.16, 0.11),
    "vermilion_dark": (0.42, 0.1, 0.08),
    "ink_green": (0.09, 0.2, 0.17),
    "ink_green_light": (0.16, 0.32, 0.27),
    "gold": (0.8, 0.6, 0.27),
    "gold_dark": (0.48, 0.32, 0.14),  # gold on the floor, where the bullets fly: never near their yellow
    "cream": (0.94, 0.89, 0.8),
    "cloth": (0.96, 0.94, 0.9),
    "wood": (0.24, 0.12, 0.08),
    "wood_light": (0.42, 0.24, 0.14),
    "wood_red": (0.36, 0.11, 0.07),
    "lantern_glow": (0.86, 0.2, 0.12),
    "paper_glow": (1.0, 0.72, 0.4),
    "sign_glow": (1.0, 0.86, 0.55),
    "jade": (0.36, 0.62, 0.5),
    "glass": (0.55, 0.66, 0.66),
    "bamboo": (0.78, 0.62, 0.36),
    "bamboo_dark": (0.55, 0.4, 0.2),
    "porcelain": (0.95, 0.95, 0.93),
    "porcelain_blue": (0.2, 0.32, 0.62),
    "clay": (0.45, 0.22, 0.14),
    "dumpling": (0.97, 0.93, 0.82),
    "siumai": (0.93, 0.72, 0.36),
    "roe": (0.95, 0.45, 0.15),
    "steel": (0.62, 0.64, 0.66),
    "steel_dark": (0.3, 0.32, 0.34),
    "black": (0.08, 0.07, 0.08),
    "rubber": (0.12, 0.12, 0.13),
    "tile_white": (0.9, 0.9, 0.86),
    "tile_green": (0.32, 0.56, 0.46),
    "water": (0.16, 0.36, 0.4),
    "gravel": (0.55, 0.5, 0.42),
    "fish": (0.95, 0.5, 0.2),
    "plant": (0.2, 0.45, 0.25),
    "pink": (0.95, 0.62, 0.62),
}

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # godot/lookdev
FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"


def B(x, y, z):
    """Game (x, y up, z south) to Blender (x, y north, z up)."""
    return Vector((x, -z, y))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b = PALETTE[name]
    bsdf.inputs["Base Color"].default_value = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
    bsdf.inputs["Roughness"].default_value = 1.0
    m.diffuse_color = bsdf.inputs["Base Color"].default_value
    return m


def _link(bm, name, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material(mat))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _place(ob, at, rot=0.0, tilt=None):
    ob.location = B(*at)
    ob.rotation_euler = (0.0, 0.0, rot)
    if tilt:  # (axis, angle) about the object's own game axis before the turn
        axis, angle = tilt
        m = Matrix.Rotation(angle, 4, {"x": "X", "y": "Z", "z": "Y"}[axis])
        if axis == "z":
            m = Matrix.Rotation(-angle, 4, "Y")
        ob.matrix_world = Matrix.Translation(ob.location) @ Matrix.Rotation(rot, 4, "Z") @ m
    return ob


def bevel(ob, width=0.01, segments=2, angle=40):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.miter_outer = "MITER_ARC"
    return ob


def box(size, at, mat, rot=0.0, bev=0.0, name="box", tilt=None):
    """A box `size` (x, y, z game) centred on `at`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
    ob = _place(_link(bm, name, mat), at, rot, tilt)
    if bev:
        bevel(ob, bev)
    return ob


def cyl(r, h, at, mat, seg=24, r2=None, bev=0.0, name="cyl", rot=0.0, tilt=None, smooth=False):
    """An upright cylinder (or cone, top radius `r2`) of height `h` whose base sits at `at`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=h,
                          matrix=Matrix.Translation((0.0, 0.0, h * 0.5)))
    if smooth:
        for f in bm.faces:
            f.smooth = len(f.verts) == 4
    ob = _place(_link(bm, name, mat), at, rot, tilt)
    if bev:
        bevel(ob, bev)
    return ob


def lathe(profile, at, mat, seg=24, name="lathe", smooth=True, rot=0.0, tilt=None, radial=None):
    """Turn `profile` [(radius, height), ...] (bottom to top) round the up axis. A radius of 0 at an end closes it.
    `radial(i, a)` may scale ring i's radius at angle a (folds, petals)."""
    bm = bmesh.new()
    rings = []
    for i, (r, y) in enumerate(profile):
        if r <= 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, y))])
            continue
        ring = []
        for k in range(seg):
            a = 2.0 * math.pi * k / seg
            rr = r * (radial(i, a) if radial else 1.0)
            ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), y)))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        if len(lo) == 1 and len(hi) == 1:
            continue
        for k in range(seg):
            k2 = (k + 1) % seg
            if len(lo) == 1:
                f = bm.faces.new((lo[0], hi[k], hi[k2]))
            elif len(hi) == 1:
                f = bm.faces.new((lo[k], hi[0], lo[k2]))
            else:
                f = bm.faces.new((lo[k], lo[k2], hi[k2], hi[k]))
            f.smooth = smooth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _place(_link(bm, name, mat), at, rot, tilt)


def ring(r, tube, at, mat, seg=24, tube_seg=8, name="ring", rot=0.0, tilt=None, arc=1.0):
    """A torus (or `arc` of one) lying flat, centred on `at`."""
    bm = bmesh.new()
    n = seg if arc >= 1.0 else seg + 1
    grid = []
    for i in range(n):
        a = 2.0 * math.pi * arc * i / seg
        c = Vector((r * math.cos(a), r * math.sin(a), 0.0))
        out = Vector((math.cos(a), math.sin(a), 0.0))
        row = []
        for j in range(tube_seg):
            b = 2.0 * math.pi * j / tube_seg
            row.append(bm.verts.new(c + out * (tube * math.cos(b)) + Vector((0, 0, tube * math.sin(b)))))
        grid.append(row)
    for i in range(seg if arc >= 1.0 else seg):
        i2 = (i + 1) % n
        for j in range(tube_seg):
            j2 = (j + 1) % tube_seg
            f = bm.faces.new((grid[i][j], grid[i2][j], grid[i2][j2], grid[i][j2]))
            f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _place(_link(bm, name, mat), at, rot, tilt)


def sphere(r, at, mat, seg=16, rings=8, scale=(1.0, 1.0, 1.0), name="sphere", rot=0.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    sx, sy, sz = scale
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
    for f in bm.faces:
        f.smooth = True
    return _place(_link(bm, name, mat), at, rot)


def poly(points, h, at, mat, name="poly", rot=0.0, bev=0.0, tilt=None):
    """An upright prism: the outline `points` [(x, z), ...] (game, seen from above) raised `h`. Tilted ('x', pi/2)
    it stands up as a flat shape facing +z, a point's -z its height."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, -z, 0.0)) for x, z in points]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z < 0:
        f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0.0, 0.0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _place(_link(bm, name, mat), at, rot, tilt)
    if bev:
        bevel(ob, bev)
    return ob


def text(s, size, at, mat, depth=0.01, rot=0.0, face="s", name="text"):
    """Chinese text standing upright, facing `face` ('s' south, the camera; 'n', 'e', 'w'), centred on `at`."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = s
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.size = size
    cu.extrude = depth * 0.5
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material(mat))
    turn = {"s": 0.0, "w": -math.pi * 0.5, "n": math.pi, "e": math.pi * 0.5}[face] + rot
    ob.matrix_world = Matrix.Translation(B(*at)) @ Matrix.Rotation(turn, 4, "Z") @ Matrix.Rotation(math.pi * 0.5, 4, "X")
    return ob


def vtext(s, size, at, mat, depth=0.01, face="s", gap=1.05, name="vtext"):
    """Text read top to bottom, one character under the next (signboards, scrolls), centred on `at`."""
    obs = []
    n = len(s)
    for i, ch in enumerate(s):
        y = at[1] + (n - 1) * size * gap * 0.5 - i * size * gap
        obs.append(text(ch, size, (at[0], y, at[2]), mat, depth, face=face, name=f"{name}{i}"))
    return obs


def mirror_x(obs):
    """Copies of `obs` mirrored across x = 0 (a prop's own left and right)."""
    out = []
    for ob in obs:
        c = ob.copy()
        c.data = ob.data.copy()
        bpy.context.scene.collection.objects.link(c)
        c.matrix_world = Matrix.Scale(-1.0, 4, (1.0, 0.0, 0.0)) @ ob.matrix_world
        out.append(c)
    return out


def copy(ob, at=None, rot=None):
    c = ob.copy()
    c.data = ob.data.copy()
    bpy.context.scene.collection.objects.link(c)
    if at is not None:
        c.location = B(*at)
    if rot is not None:
        c.rotation_euler = (0.0, 0.0, rot)
    return c


def _bake(ob):
    """Apply the object's modifiers (and a text's curve) and transform into plain mesh data."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    me.transform(ob.matrix_world)
    if ob.matrix_world.determinant() < 0:
        me.flip_normals()
    new = bpy.data.objects.new(ob.name, me)
    bpy.context.scene.collection.objects.link(new)
    bpy.data.objects.remove(ob)
    return new


def _octa(n):
    """Octahedron encoding of a unit vector into 0..1 (decoded in shaders/outline_model.gdshader)."""
    s = abs(n.x) + abs(n.y) + abs(n.z)
    x, y, z = n.x / s, n.y / s, n.z / s
    if z < 0.0:
        x, y = (1.0 - abs(y)) * math.copysign(1.0, x), (1.0 - abs(x)) * math.copysign(1.0, y)
    return x * 0.5 + 0.5, y * 0.5 + 0.5


def finish(prop_id, sharp=35):
    """Join everything in the scene into one mesh named `prop_id`, shade it (flat across edges sharper than
    `sharp` degrees, smooth where the parts asked for it), write the ink line's normals and export
    models/<prop_id>.glb. Returns the triangle count and the materials."""
    obs = [_bake(o) for o in list(bpy.context.scene.objects) if o.type in {"MESH", "FONT"}]
    for o in bpy.context.scene.objects:
        o.select_set(o in obs)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = prop_id
    me = ob.data
    me.name = prop_id
    # merge each material's slots (join keeps one slot per source object)
    slots = {}
    remap = []
    for m in me.materials:
        if m.name not in slots:
            slots[m.name] = len(slots)
        remap.append(slots[m.name])
    index = [remap[p.material_index] for p in me.polygons]
    mats = list(slots)
    me.materials.clear()  # (this also sets every face's index to 0)
    for name in mats:
        me.materials.append(bpy.data.materials[name])
    for p, i in zip(me.polygons, index):
        p.material_index = i
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # hard edges where the faces meet sharper than `sharp`, or where a part asked for flat faces
    angle = math.radians(sharp)
    for e in bm.edges:
        e.smooth = True
        if len(e.link_faces) == 2:
            a, b = e.link_faces
            if a.normal.angle(b.normal, 0.0) > angle or not (a.smooth and b.smooth):
                e.smooth = False
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    # the ink line's normals: the vertex's averaged normal, in glTF axes (x, z, -y), into the UV map
    uv = me.uv_layers.new(name="outline")
    for loop in me.loops:
        n = me.vertices[loop.vertex_index].normal
        u, v = _octa(Vector((n.x, n.z, -n.y)).normalized())
        uv.data[loop.index].uv = (u, 1.0 - v)  # the exporter writes glTF's v as 1 - v
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    os.makedirs(os.path.join(ROOT, "models"), exist_ok=True)
    path = os.path.join(ROOT, "models", prop_id + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False, export_apply=True,
                              export_yup=True, export_texcoords=True, export_normals=True,
                              export_materials="EXPORT", export_vertex_color="NONE", export_animations=False,
                              export_extras=False, export_cameras=False, export_lights=False)
    return {"id": prop_id, "tris": tris, "materials": mats}
