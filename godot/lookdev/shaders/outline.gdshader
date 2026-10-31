// The ink line (art bible: 1.5–2 px, dark but not black): the mesh drawn again a little bigger, its back faces only,
// in one flat colour behind the first. The meshes here are boxes, cylinders and balls built round their own middle, so
// pushing each point `width` out along each axis it lies on grows a box evenly on every face, hard corners and all
// (along its normal would split a box at its corners). The floor gets none (bullets read on it first).
shader_type spatial;
render_mode unshaded, cull_front, depth_draw_opaque;

uniform vec4 ink : source_color = vec4(0.12, 0.05, 0.08, 1.0);
uniform float width = 0.025;

void vertex() {
	VERTEX += sign(VERTEX) * width;
}

void fragment() {
	ALBEDO = ink.rgb;
}
