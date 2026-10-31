## Dresses a Blender model (models/<id>.glb, made by blender/build.py or by hand: TASKS.md G⓪b, G⓪c) in the look,
## as src/style.js dresses the JS game: each imported material swapped for its toon twin (its colour and base colour
## texture, a glow when its name says so: blender/kit.py PALETTE) with the ink line along the averaged normals Blender
## wrote into UV2 (shaders/outline_model.gdshader). One twin a material, shared by every model.
extends RefCounted

const TOON := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/outline_model.gdshader")

static var _twins := {}

static func model(id: String) -> Node3D:
	var scene: PackedScene = load("res://models/%s.glb" % id)
	var node := scene.instantiate() as Node3D
	for child in node.find_children("*", "MeshInstance3D", true, false):
		var mi := child as MeshInstance3D
		for i in mi.mesh.get_surface_count():
			mi.set_surface_override_material(i, twin(mi.mesh.surface_get_material(i) as BaseMaterial3D))
	return node

static func twin(src: BaseMaterial3D) -> ShaderMaterial:
	if _twins.has(src):
		return _twins[src]
	var m := ShaderMaterial.new()
	m.shader = TOON
	m.set_shader_parameter("albedo", src.albedo_color)
	if src.albedo_texture:
		m.set_shader_parameter("albedo_tex", src.albedo_texture)
	m.set_shader_parameter("glow", 1.2 if src.resource_name.contains("glow") else 0.0)
	var o := ShaderMaterial.new()
	o.shader = OUTLINE
	m.next_pass = o
	_twins[src] = m
	return m
