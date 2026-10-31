// The ink line on a Blender model (blender/kit.py finish): the mesh drawn again behind itself, back faces only, its
// points pushed out along the vertex's averaged normal, which the model carries octahedron-encoded in UV (the split
// normals at its hard edges would tear the hull open). The push is in screen pixels, so the line is the art bible's
// 1.5–2 px however near or far the camera, on a teacup as on a wall.
shader_type spatial;
render_mode unshaded, cull_front, depth_draw_opaque;

uniform vec4 ink : source_color = vec4(0.12, 0.05, 0.08, 1.0);
uniform float width_px = 1.6;

vec3 octa_decode(vec2 e) {
	vec2 f = e * 2.0 - 1.0;
	vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
	float t = max(-n.z, 0.0);
	n.x += n.x >= 0.0 ? -t : t;
	n.y += n.y >= 0.0 ? -t : t;
	return normalize(n);
}

void vertex() {
	vec3 n = octa_decode(UV);
	vec4 clip = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec3 view_n = mat3(MODELVIEW_MATRIX) * n;
	vec2 dir = (PROJECTION_MATRIX * vec4(view_n, 0.0)).xy;
	float len = length(dir);
	if (len > 1e-5) {
		clip.xy += dir / len * width_px * 2.0 / VIEWPORT_SIZE * clip.w;
	}
	POSITION = clip;
}

void fragment() {
	ALBEDO = ink.rgb;
}
