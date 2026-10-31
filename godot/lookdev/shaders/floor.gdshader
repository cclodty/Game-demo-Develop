// The teahouse floor: dark terrazzo in square tiles, small soft chips in a deep red-brown, a fine grout line between the
// tiles, a brass strip round every four, a darker band round the walls behind a brass line; the cel light as
// everything else, no ink line (bullets must read on the floor first).
shader_type spatial;
render_mode specular_disabled;

#include "res://shaders/toon_light.gdshaderinc"

uniform vec4 base : source_color = vec4(0.21, 0.12, 0.09, 1.0);
uniform vec4 chip_light : source_color = vec4(0.62, 0.46, 0.34, 1.0);
uniform vec4 chip_dark : source_color = vec4(0.07, 0.05, 0.05, 1.0);
uniform vec4 grout : source_color = vec4(0.09, 0.06, 0.05, 1.0);
uniform float tile = 1.2;
uniform vec2 half_size = vec2(13.2, 9.0); // the room's, so a border can run round its walls
uniform float border = 0.9;
uniform vec4 border_base : source_color = vec4(0.13, 0.07, 0.06, 1.0);
uniform vec4 brass : source_color = vec4(0.46, 0.33, 0.16, 1.0); // dark: never near the enemy bullets' yellow

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	vec3 world = (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec2 p = world.xz;
	vec3 col = base.rgb;
	// chips: two sizes of small cell, few and soft, so the floor stays quiet under the bullets
	float h1 = hash(floor(p * 16.0));
	float h2 = hash(floor(p * 34.0) + 17.0);
	col = mix(col, chip_light.rgb, step(0.92, h1) * 0.35);
	col = mix(col, chip_dark.rgb, step(0.85, h2) * 0.4);
	// the grout between square tiles, and a brass strip every second one
	vec2 g = abs(fract(p / tile) - 0.5);
	col = mix(col, grout.rgb, step(0.485, max(g.x, g.y)));
	vec2 g2 = abs(fract(p / (tile * 2.0)) - 0.5);
	col = mix(col, brass.rgb, step(0.496, max(g2.x, g2.y)) * 0.3);
	// a darker band round the walls, set off by a brass strip
	vec2 edge = half_size - abs(p);
	float to_wall = min(edge.x, edge.y);
	col = mix(col, mix(border_base.rgb, col, 0.35), step(to_wall, border));
	col = mix(col, brass.rgb, step(abs(to_wall - border), 0.025));
	ALBEDO = col;
}
