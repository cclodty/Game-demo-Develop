## The props side by side, for a close look at each (TASKS.md G⓪b): the wall pieces on a stretch of plain wall, the
## floor pieces in a row, each dressed in the look (scripts/dress.gd) under the teahouse's light. Saves
## lineup-wall.jpg and lineup-floor.jpg to <folder> (relative to the project), then quits:
##   xvfb-run -s "-screen 0 1920x1080x24" godot --path godot/lookdev --resolution 1920x1080 -s tools/lineup.gd -- <folder>
extends SceneTree

const Dress := preload("res://scripts/dress.gd")
const ROWS := {
	"wall": ["window", "menu_boards", "plaque", "lantern", "scroll_yumcha", "scroll_tea", "clock"],
	"floor": ["altar", "counter", "fish_tank", "tea_urn", "plant", "screen", "trolley", "table_set"],
}
const GAP := 0.35

var _out := ""
var _rows := ["wall", "floor"]
var _i := 0
var _frames := 0
var _stage: Node3D
var _cam: Camera3D

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0] if args.size() > 0 else "user://shots"
	if not _out.is_absolute_path() and not _out.begins_with("user://"):
		_out = ProjectSettings.globalize_path("res://").path_join(_out)
	elif _out.begins_with("user://"):
		_out = ProjectSettings.globalize_path(_out)
	DirAccess.make_dir_recursive_absolute(_out)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.035, 0.03)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.55, 0.42, 0.5)
	env.ambient_light_energy = 0.3
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.96, 0.9)
	sun.light_energy = 0.7
	sun.rotation_degrees = Vector3(-40.0, -20.0, 0.0)
	sun.shadow_enabled = true
	root.add_child(sun)
	_cam = Camera3D.new()
	_cam.fov = 25.0
	root.add_child(_cam)

## Lays out one row: models left to right by their width, on a wall (the wall row) and a floor.
func _build(row: String) -> void:
	if _stage:
		_stage.queue_free()
	_stage = Node3D.new()
	root.add_child(_stage)
	var nodes := []
	var width := 0.0
	for id in ROWS[row]:
		var n := Dress.model(id)
		var box := _bounds(n)
		nodes.append([n, box])
		width += box.size.x + GAP
	width -= GAP
	var x := -width * 0.5
	for pair in nodes:
		var n: Node3D = pair[0]
		var box: AABB = pair[1]
		n.position = Vector3(x - box.position.x, 0.0, 0.0)
		_stage.add_child(n)
		x += box.size.x + GAP
	var floor_m := StandardMaterial3D.new()
	floor_m.albedo_color = Color(0.2, 0.13, 0.1)
	var fl := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(width + 4.0, 8.0)
	fl.mesh = plane
	fl.material_override = floor_m
	fl.position = Vector3(0.0, 0.0, 2.0)
	_stage.add_child(fl)
	if row == "wall":
		var wall := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(width + 4.0, 3.4, 0.1)
		wall.mesh = bm
		wall.material_override = Dress.twin(_flat("vermilion", Color(0.6, 0.16, 0.11)))
		wall.position = Vector3(0.0, 1.7, -0.05)
		_stage.add_child(wall)
	# frame the row: the camera a little above, far enough back to hold its width
	var aspect := 16.0 / 9.0
	var half_h := deg_to_rad(_cam.fov * 0.5)
	var half_w := atan(tan(half_h) * aspect)
	var dist := (width * 0.5 + 0.4) / tan(half_w)
	var target := Vector3(0.0, 1.6 if row == "wall" else 0.8, 0.3)
	var pitch := deg_to_rad(8.0 if row == "wall" else 22.0)
	_cam.look_at_from_position(target + Vector3(0.0, sin(pitch), cos(pitch)) * dist, target, Vector3.UP)

func _flat(name: String, color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.resource_name = name
	m.albedo_color = color
	return m

## A model's extent, from its meshes (in its own space).
func _bounds(n: Node3D) -> AABB:
	var box := AABB()
	var first := true
	for child in n.find_children("*", "MeshInstance3D", true, false):
		var mi := child as MeshInstance3D
		var b := mi.transform * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	return box

func _process(_delta: float) -> bool:
	if _frames == 0:
		_build(_rows[_i])
	_frames += 1
	if _frames < 8:
		return false
	var path := _out.path_join("lineup-%s.jpg" % _rows[_i])
	var err := root.get_texture().get_image().save_jpg(path, 0.9)
	print("%s %s" % ["saved" if err == OK else "FAILED", path])
	_i += 1
	_frames = 0
	return _i >= _rows.size()
