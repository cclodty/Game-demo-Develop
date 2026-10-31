// Everything but the floor: a flat colour (times a model's texture), the cel light (toon_light.gdshaderinc), a rim
// of light round the edge seen from the camera, and an optional glow for lanterns and signs.
shader_type spatial;
render_mode specular_disabled;

#include "res://shaders/toon_light.gdshaderinc"

uniform vec4 albedo : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, hint_default_white; // a model's base colour texture, if it has one
uniform vec4 rim_color : source_color = vec4(1.0, 0.86, 0.7, 1.0);
uniform float rim_amount : hint_range(0.0, 1.0) = 0.18;
uniform float glow : hint_range(0.0, 8.0) = 0.0;

void fragment() {
	ALBEDO = albedo.rgb * texture(albedo_tex, UV).rgb;
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	EMISSION = rim_color.rgb * rim * rim_amount + albedo.rgb * glow;
}
