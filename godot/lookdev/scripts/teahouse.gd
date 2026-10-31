## The teahouse (茶樓), the game's first room, set dressed as the second generation means it to look
## (docs/REDESIGN.md §2, the art bible): cel light in two bands with purple-blue shade, a dark ink line, vermilion
## and ink green with gold and cream, warm lamps. Built here from the room's own data (src/rooms.js TEAHOUSE, at the
## game's ROOM_SIZE.scale 1.2: places spread out, things keep their size) with Godot's own meshes and shaders, no
## model files. A look test only (TASKS.md G⓪): nothing in it plays. Nothing hangs over the floor, as in the game:
## nothing comes between the camera and a bullet.
extends Node3D

const TOON := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")
const FLOOR := preload("res://shaders/floor.gdshader")

## rooms.js TEAHOUSE, the template's numbers (metres; +Z is south, towards the camera).
const SCALE := 1.2
const SIZE := Vector2(22.0, 15.0)
const WALL_H := 3.2
const LOW_H := 0.9
const LOW_SIDES := ["s", "w"]
const DOORS := [["n", -5.0], ["n", 5.0], ["e", -3.0], ["e", 3.0]]
const EXITS := [["n", 0.0], ["e", 0.0]]
const ENTRY := ["s", 0.0]
const TABLES := [[-6.0, -3.0, 0.85], [0.0, -3.0, 0.85], [6.0, -3.0, 0.85], [-6.0, 3.0, 0.85], [0.0, 3.0, 0.85], [6.0, 3.0, 0.85]]
const TROLLEYS := [[-9.0, 5.5, 0.0], [9.0, -5.5, PI]]
const LAMPS := [[-3.0, -3.0], [3.0, -3.0], [-3.0, 3.0], [3.0, 3.0]]
const PLAYER := Vector2(-3.0, 1.0) ## where the block player stands (the camera follows it, as in the game)
const DOOR_W := 1.6
const EXIT_W := 1.8
const DOOR_H := 2.5
const WALL_T := 0.3

## The palette: the teahouse's vermilion and ink green (art bible), gold and cream to set them off, dark wood.
const VERMILION := Color(0.6, 0.16, 0.11)
const INK_GREEN := Color(0.09, 0.2, 0.17)
const GOLD := Color(0.8, 0.6, 0.27)
const CREAM := Color(0.94, 0.89, 0.8)
const WOOD := Color(0.24, 0.12, 0.08)
const WOOD_LIGHT := Color(0.42, 0.24, 0.14)
const LANTERN := Color(0.86, 0.2, 0.12)
const PAPER := Color(1.0, 0.72, 0.4)
const JADE := Color(0.36, 0.62, 0.5)
const WARM := Color(1.0, 0.78, 0.55)

var _mats := {}
var camera: Camera3D

func _ready() -> void:
	_environment()
	_floor()
	for side in ["n", "s", "w", "e"]:
		_wall(side)
	for t in TABLES:
		_table(_at(t[0], t[1]), t[2])
	for t in TROLLEYS:
		_trolley(_at(t[0], t[1]), t[2])
	_wall_dress()
	_figures()
	camera = Camera3D.new()
	camera.fov = 40.0
	add_child(camera)
	set_view("game")

## The camera: `game` the game's own 45° tilt in a room (config.js VIEWS tilt, CAMERA.fov, roomDist, roomLean: this
## far off, leaning most of the way from the room's middle to the player), `iso` the 45° side view over the whole
## room (VIEWS iso), `close` lower and nearer the middle tables, `top` straight down over the whole room.
func set_view(view: String) -> void:
	var target := _at(PLAYER.x, PLAYER.y) * 0.85
	var pitch := 45.0
	var yaw := 0.0
	var dist := 22.0
	match view:
		"iso":
			target = Vector3(-2.4, 0.0, 3.4)
			yaw = -45.0
			dist = 33.0
		"close":
			target = Vector3(-1.5, 0.6, 0.0)
			pitch = 24.0
			yaw = -32.0
			dist = 11.0
		"top":
			target = Vector3(0.0, 0.0, 0.0)
			pitch = 89.0
			yaw = 0.0
			dist = 34.0
	var p := deg_to_rad(pitch)
	var y := deg_to_rad(yaw)
	var back := Vector3(sin(y) * cos(p), sin(p), cos(y) * cos(p)) * dist
	camera.look_at_from_position(target + back, target, Vector3.UP)

# --- the pieces

func _at(x: float, z: float) -> Vector3:
	return Vector3(x * SCALE, 0.0, z * SCALE)

func _half() -> Vector2:
	return SIZE * SCALE * 0.5

func _mat(color: Color, glow := 0.0, ink := true) -> ShaderMaterial:
	var key := "%s/%s/%s" % [color.to_html(), glow, ink]
	if _mats.has(key):
		return _mats[key]
	var m := ShaderMaterial.new()
	m.shader = TOON
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("glow", glow)
	if ink:
		var o := ShaderMaterial.new()
		o.shader = OUTLINE
		o.set_shader_parameter("width", 0.04)
		m.next_pass = o
	_mats[key] = m
	return m

func _mesh(mesh: Mesh, pos: Vector3, mat: Material, rot_y := 0.0, parent: Node3D = null) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation.y = rot_y
	(parent if parent else self).add_child(mi)
	return mi

func _box(size: Vector3, pos: Vector3, mat: Material, rot_y := 0.0, parent: Node3D = null) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	return _mesh(mesh, pos, mat, rot_y, parent)

func _cyl(top: float, bottom: float, height: float, pos: Vector3, mat: Material, sides := 24, parent: Node3D = null) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = top
	mesh.bottom_radius = bottom
	mesh.height = height
	mesh.radial_segments = sides
	mesh.rings = 1
	return _mesh(mesh, pos, mat, 0.0, parent)

func _ball(radius: float, height: float, pos: Vector3, mat: Material, parent: Node3D = null) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = height
	mesh.radial_segments = 16
	mesh.rings = 8
	return _mesh(mesh, pos, mat, 0.0, parent)

func _environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.035, 0.03)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.42, 0.5)
	env.ambient_light_energy = 0.3
	# The lit band shows the palette as it is (art bible: the colour is in the paint, not the light). So no film
	# curve, lights all but white, and about 1× light on a lit face: a warm light multiplies in linear space, and with
	# 1.4× of it the vermilion burnt orange and the cream white. No glow: the Compatibility renderer's (Godot's default
	# soft light blend) raised the contrast of the whole frame; the lanterns shine by their own emission.
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# the moon through the roof the camera looks in by: from the camera's side, casting the shadows
	var sun := DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.96, 0.9)
	sun.light_energy = 0.7
	sun.rotation_degrees = Vector3(-58.0, -28.0, 0.0)
	sun.shadow_enabled = true
	add_child(sun)
	# the room's four lamps, high over the lanes between the tables (rooms.js teaTheme): a faint warm pool each
	for l in LAMPS:
		var o := OmniLight3D.new()
		o.light_color = WARM
		o.light_energy = 0.35
		o.omni_range = 9.0
		o.position = _at(l[0], l[1]) + Vector3(0.0, 5.0, 0.0)
		add_child(o)

func _floor() -> void:
	var plane := PlaneMesh.new()
	plane.size = SIZE * SCALE
	var m := ShaderMaterial.new()
	m.shader = FLOOR
	_mesh(plane, Vector3.ZERO, m)

## The openings along `side`: each door, exit and the entry on it, as [middle along the wall, width].
func _openings(side: String) -> Array:
	var out := []
	for d in DOORS:
		if d[0] == side:
			out.append([d[1] * SCALE, DOOR_W])
	for d in EXITS:
		if d[0] == side:
			out.append([d[1] * SCALE, EXIT_W])
	if ENTRY[0] == side:
		out.append([ENTRY[1] * SCALE, EXIT_W])
	out.sort_custom(func(a, b): return a[0] < b[0])
	return out

## A wall along `side`, broken at its openings: a tall one is ink green to the dado rail, a gold band, vermilion above,
## a dark wood cap; a low one (the camera's sides) is a green half wall under a gold cap. A door leaf in each opening.
func _wall(side: String) -> void:
	var half := _half()
	var along_x := side == "n" or side == "s"
	var length := half.x * 2.0 if along_x else half.y * 2.0
	var at := (-half.y if side == "n" else half.y) if along_x else (-half.x if side == "w" else half.x)
	var off := WALL_T * 0.5 * (-1.0 if side == "n" or side == "w" else 1.0)
	var low := LOW_SIDES.has(side)
	var height := LOW_H if low else WALL_H
	var runs := []
	var from := -length * 0.5
	var openings := _openings(side)
	for o in openings:
		runs.append([from, o[0] - o[1] * 0.5])
		from = o[0] + o[1] * 0.5
	runs.append([from, length * 0.5])
	for r in runs:
		var span: float = r[1] - r[0]
		if span < 0.05:
			continue
		var mid: float = (r[0] + r[1]) * 0.5
		var layers := [[0.0, 0.82, INK_GREEN], [0.82, 0.08, GOLD]] if low else [[0.0, 1.05, INK_GREEN], [1.05, 0.08, GOLD], [1.13, height - 1.23, VERMILION], [height - 0.1, 0.1, WOOD]]
		for l in layers:
			var size := Vector3(span, l[1], WALL_T) if along_x else Vector3(WALL_T, l[1], span)
			var pos := Vector3(mid, l[0] + l[1] * 0.5, at + off) if along_x else Vector3(at + off, l[0] + l[1] * 0.5, mid)
			_box(size, pos, _mat(l[2]))
	for o in openings:
		if low:
			continue
		var w: float = o[1]
		var lintel := Vector3(w, height - DOOR_H, WALL_T) if along_x else Vector3(WALL_T, height - DOOR_H, w)
		var lpos := Vector3(o[0], DOOR_H + (height - DOOR_H) * 0.5, at + off) if along_x else Vector3(at + off, DOOR_H + (height - DOOR_H) * 0.5, o[0])
		_box(lintel, lpos, _mat(VERMILION))
		_door(side, o[0], w, at + off, EXITS.any(func(e): return e[0] == side and is_equal_approx(e[1] * SCALE, o[0])))

## A door in its opening: a dark wood leaf with gold studs and a gold frame; an exit's lit sign over it.
func _door(side: String, along: float, width: float, at: float, exit: bool) -> void:
	var along_x := side == "n" or side == "s"
	var pos := Vector3(along, DOOR_H * 0.5, at) if along_x else Vector3(at, DOOR_H * 0.5, along)
	var leaf := Vector3(width, DOOR_H, 0.08) if along_x else Vector3(0.08, DOOR_H, width)
	_box(leaf, pos, _mat(WOOD))
	for k in [-1.0, 1.0]:
		var jamb := Vector3(0.1, DOOR_H, WALL_T + 0.04) if along_x else Vector3(WALL_T + 0.04, DOOR_H, 0.1)
		var jpos := pos + (Vector3(k * width * 0.5, 0.0, 0.0) if along_x else Vector3(0.0, 0.0, k * width * 0.5))
		_box(jamb, jpos, _mat(GOLD))
	# the studs: a grid of small gold bosses on the leaf
	var inward := Vector3(0.0, 0.0, 0.05) if side == "n" else (Vector3(0.0, 0.0, -0.05) if side == "s" else (Vector3(0.05, 0.0, 0.0) if side == "w" else Vector3(-0.05, 0.0, 0.0)))
	for row in range(4):
		for col in range(3):
			var u := (col - 1) * width * 0.28
			var v := 0.55 + row * 0.5
			var spos := (Vector3(along + u, v, at) if along_x else Vector3(at, v, along + u)) + inward
			_ball(0.035, 0.07, spos, _mat(GOLD, 0.0, false))
	if exit:
		var plate := Vector3(0.9, 0.28, 0.06) if along_x else Vector3(0.06, 0.28, 0.9)
		var ppos := (Vector3(along, DOOR_H + 0.3, at) if along_x else Vector3(at, DOOR_H + 0.3, along)) + inward * 2.0
		_box(plate, ppos, _mat(JADE, 2.2, false))

## A round table set for dim sum: a cream cloth to the floor, a lazy susan of dark glass, a teapot, cups, bamboo
## steamers; six stools round it (low: a bullet over them is a bullet over the floor).
func _table(at: Vector3, r: float) -> void:
	_cyl(r, r + 0.06, 0.74, at + Vector3(0.0, 0.37, 0.0), _mat(CREAM), 32)
	_cyl(r + 0.02, r + 0.02, 0.04, at + Vector3(0.0, 0.76, 0.0), _mat(CREAM.darkened(0.06)), 32)
	_cyl(r * 0.45, r * 0.45, 0.03, at + Vector3(0.0, 0.795, 0.0), _mat(Color(0.12, 0.1, 0.1)), 24)
	_ball(0.11, 0.18, at + Vector3(0.18, 0.9, -0.08), _mat(JADE))
	_cyl(0.015, 0.025, 0.12, at + Vector3(0.3, 0.9, -0.08), _mat(JADE, 0.0, false), 6)
	for i in range(4):
		var a := TAU * i / 4.0 + 0.4
		_cyl(0.045, 0.035, 0.06, at + Vector3(cos(a) * r * 0.72, 0.81, sin(a) * r * 0.72), _mat(CREAM.lightened(0.05), 0.0, false), 10)
	for i in range(3):
		var a2 := TAU * i / 3.0 + 1.2
		var s := at + Vector3(cos(a2) * r * 0.25, 0.0, sin(a2) * r * 0.25)
		for k in range(2 if i == 0 else 1):
			_cyl(0.13, 0.13, 0.08, s + Vector3(0.0, 0.85 + k * 0.085, 0.0), _mat(Color(0.74, 0.58, 0.34)), 14)
	for i in range(6):
		var a3 := TAU * i / 6.0 + 0.3
		var p := at + Vector3(cos(a3) * (r + 0.45), 0.0, sin(a3) * (r + 0.45))
		_cyl(0.2, 0.18, 0.42, p + Vector3(0.0, 0.21, 0.0), _mat(WOOD_LIGHT), 14)
		_cyl(0.205, 0.205, 0.05, p + Vector3(0.0, 0.445, 0.0), _mat(VERMILION.darkened(0.1)), 14)

## A dim-sum trolley: a steel cart on four wheels, a stack of bamboo steamers on it, a push bar.
func _trolley(at: Vector3, angle: float) -> void:
	var t := Node3D.new()
	t.position = at
	t.rotation.y = angle
	add_child(t)
	var steel := _mat(Color(0.7, 0.72, 0.74))
	_box(Vector3(1.1, 0.06, 0.6), Vector3(0.0, 0.62, 0.0), steel, 0.0, t)
	_box(Vector3(1.1, 0.05, 0.6), Vector3(0.0, 0.22, 0.0), steel, 0.0, t)
	for x in [-0.5, 0.5]:
		for z in [-0.26, 0.26]:
			_box(Vector3(0.04, 0.6, 0.04), Vector3(x, 0.4, z), steel, 0.0, t)
			_cyl(0.06, 0.06, 0.04, Vector3(x, 0.06, z), _mat(Color(0.1, 0.1, 0.1), 0.0, false), 10, t)
	var bar := _cyl(0.025, 0.025, 0.62, Vector3(-0.62, 0.9, 0.0), steel, 8, t)
	bar.rotation.x = PI * 0.5
	for i in range(3):
		var x2 := -0.3 + i * 0.3
		for k in range(4 - i):
			_cyl(0.14, 0.14, 0.09, Vector3(x2, 0.7 + k * 0.095, 0.0), _mat(Color(0.74, 0.58, 0.34)), 14, t)

## What hangs on the tall walls (north, east), never over the floor: a gold rail at waist height, red paper lanterns,
## lattice windows lit warm from behind, hanging scrolls, a folding screen in the north-east corner.
func _wall_dress() -> void:
	var half := _half()
	var zn := -half.y + 0.02
	var xe := half.x - 0.02
	var exit_n: float = EXITS[0][1] * SCALE
	var exit_e: float = EXITS[1][1] * SCALE
	# the rails, broken at the doors
	for side in ["n", "e"]:
		var length := half.x * 2.0 if side == "n" else half.y * 2.0
		var from := -length * 0.5
		var runs := []
		for o in _openings(side):
			runs.append([from, o[0] - o[1] * 0.5 - 0.15])
			from = o[0] + o[1] * 0.5 + 0.15
		runs.append([from, length * 0.5])
		for r in runs:
			var span: float = r[1] - r[0]
			if span < 0.1:
				continue
			var mid: float = (r[0] + r[1]) * 0.5
			if side == "n":
				_box(Vector3(span, 0.07, 0.07), Vector3(mid, 1.1, zn + 0.06), _mat(GOLD, 0.0, false))
			else:
				_box(Vector3(0.07, 0.07, span), Vector3(xe - 0.06, 1.1, mid), _mat(GOLD, 0.0, false))
	# lattice windows on the north wall, between its doors, lit warm from behind
	for x in [-10.2, -3.0, 3.0, 10.2]:
		_lattice(Vector3(x, 1.95, zn + 0.04))
	# hanging scrolls on the east wall
	for z in [-6.6, -1.6, 1.6, 6.6]:
		if absf(z - exit_e) < 1.4:
			continue
		_box(Vector3(0.03, 1.5, 0.62), Vector3(xe - 0.05, 2.05, z), _mat(INK_GREEN, 0.0, false))
		_box(Vector3(0.035, 1.34, 0.5), Vector3(xe - 0.06, 2.05, z), _mat(CREAM, 0.0, false))
		for k in range(4):
			_box(Vector3(0.04, 0.05 + (k % 2) * 0.12, 0.2 - (k % 3) * 0.04), Vector3(xe - 0.07, 2.55 - k * 0.3, z + ((k % 2) - 0.5) * 0.08), _mat(Color(0.1, 0.08, 0.08), 0.0, false))
	# red paper lanterns along both tall walls, never across an exit
	for x in range(-11, 12, 4):
		if absf(x - exit_n) > 1.6:
			_lantern(Vector3(x, WALL_H - 0.55, zn + 0.45))
	for z in range(-7, 8, 4):
		if absf(z - exit_e) > 1.6:
			_lantern(Vector3(xe - 0.45, WALL_H - 0.55, z))
	# a folding screen in the north-east corner: four lacquered panels, gold edged, a jade band
	for i in range(4):
		var p := Vector3(half.x - 1.0 - i * 0.55, 0.9, -half.y + 1.1 + (i % 2) * 0.12)
		_box(Vector3(0.52, 1.8, 0.05), p, _mat(Color(0.14, 0.05, 0.05)), 0.0)
		_box(Vector3(0.44, 0.3, 0.06), p + Vector3(0.0, 0.45, 0.0), _mat(JADE, 0.15, false))

## A lattice window: a dark wood frame, a grid of bars, warm paper behind it lit as if from the street.
func _lattice(at: Vector3) -> void:
	_box(Vector3(1.7, 1.25, 0.04), at, _mat(PAPER, 1.1, false))
	_box(Vector3(1.86, 0.1, 0.08), at + Vector3(0.0, 0.67, 0.02), _mat(WOOD))
	_box(Vector3(1.86, 0.1, 0.08), at + Vector3(0.0, -0.67, 0.02), _mat(WOOD))
	for k in [-1.0, 1.0]:
		_box(Vector3(0.1, 1.44, 0.08), at + Vector3(k * 0.88, 0.0, 0.02), _mat(WOOD))
	for i in range(1, 6):
		_box(Vector3(0.035, 1.25, 0.05), at + Vector3(-0.85 + i * 0.283, 0.0, 0.03), _mat(WOOD, 0.0, false))
	for j in range(1, 4):
		_box(Vector3(1.7, 0.035, 0.05), at + Vector3(0.0, -0.62 + j * 0.31, 0.03), _mat(WOOD, 0.0, false))

## A red paper lantern: lit from inside, gold caps top and bottom, a red tassel.
func _lantern(at: Vector3) -> void:
	_ball(0.3, 0.52, at, _mat(LANTERN, 1.4, false))
	_cyl(0.13, 0.13, 0.06, at + Vector3(0.0, 0.28, 0.0), _mat(GOLD, 0.0, false), 12)
	_cyl(0.11, 0.11, 0.05, at + Vector3(0.0, -0.27, 0.0), _mat(GOLD, 0.0, false), 12)
	_cyl(0.02, 0.05, 0.22, at + Vector3(0.0, -0.4, 0.0), _mat(LANTERN.darkened(0.2), 0.0, false), 6)

## Figures for scale, block people 1.78 m tall in the art bible's 6-head proportion: the player in white (the only
## white on the floor), three of the gang in dark coats each with his own accent.
func _figures() -> void:
	_person(_at(PLAYER.x, PLAYER.y), Color(0.95, 0.95, 0.97), Color(0.3, 0.85, 0.95), -2.4)
	_person(_at(-6.0, -5.3), Color(0.16, 0.16, 0.2), Color(0.95, 0.2, 0.25), 0.5)
	_person(_at(0.5, -5.4), Color(0.2, 0.15, 0.1), Color(0.95, 0.55, 0.12), 0.0)
	_person(_at(6.0, -5.2), Color(0.17, 0.15, 0.27), Color(0.7, 0.42, 1.0), -0.6)

func _person(at: Vector3, coat: Color, accent: Color, facing: float) -> void:
	var p := Node3D.new()
	p.position = at
	p.rotation.y = facing
	add_child(p)
	var skin := _mat(Color(0.93, 0.78, 0.66))
	var dark := _mat(Color(0.1, 0.1, 0.12))
	for x in [-0.1, 0.1]:
		_box(Vector3(0.14, 0.82, 0.16), Vector3(x, 0.41, 0.0), dark, 0.0, p)
	_box(Vector3(0.46, 0.62, 0.26), Vector3(0.0, 1.14, 0.0), _mat(coat), 0.0, p)
	_box(Vector3(0.48, 0.07, 0.27), Vector3(0.0, 0.88, 0.0), _mat(accent, 0.2), 0.0, p)
	for x in [-0.3, 0.3]:
		_box(Vector3(0.12, 0.58, 0.14), Vector3(x, 1.16, 0.06), _mat(coat), 0.0, p)
	_box(Vector3(0.24, 0.26, 0.24), Vector3(0.0, 1.62, 0.0), skin, 0.0, p)
	_box(Vector3(0.26, 0.1, 0.26), Vector3(0.0, 1.76, -0.01), dark, 0.0, p)
	_box(Vector3(0.06, 0.08, 0.36), Vector3(0.22, 1.2, 0.3), dark, 0.0, p)
