## The look-dev's screenshots, one a view (scripts/teahouse.gd set_view): the game's 45° tilt, the 45° side view over
## the whole room, a close one, straight down. A display is needed (on a server, Xvfb; Mesa's software OpenGL is
## enough for the Compatibility renderer):
##   xvfb-run -s "-screen 0 1280x720x24" godot --path godot/lookdev --resolution 1280x720 -s tools/shot.gd -- <folder>
## The JPEGs go to <folder> (relative to the project; default user://shots), then it quits.
extends SceneTree

const VIEWS := ["game", "iso", "close", "top"]
const SETTLE := 8 ## frames a view is drawn before it is taken (the shadows settle)

var _room: Node3D
var _frames := 0
var _i := 0
var _out := ""

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0] if args.size() > 0 else "user://shots"
	if _out.begins_with("user://"):
		_out = ProjectSettings.globalize_path(_out)
	elif not _out.is_absolute_path():
		_out = ProjectSettings.globalize_path("res://").path_join(_out)
	DirAccess.make_dir_recursive_absolute(_out)
	var scene: PackedScene = load("res://scenes/teahouse.tscn")
	_room = scene.instantiate() as Node3D
	root.add_child(_room)

## A view is set on its first frame: the room is ready (its camera made) only once the tree has started.
func _process(_delta: float) -> bool:
	if _frames == 0:
		_room.call("set_view", VIEWS[_i])
	_frames += 1
	if _frames < SETTLE:
		return false
	var path := _out.path_join("teahouse-%s.jpg" % VIEWS[_i])
	var err := root.get_texture().get_image().save_jpg(path, 0.88)
	print("%s %s" % ["saved" if err == OK else "FAILED", path])
	_i += 1
	_frames = 0
	return _i >= VIEWS.size()
