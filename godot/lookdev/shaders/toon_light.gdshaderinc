// The cel light the art bible asks for (docs/REDESIGN.md §2): two bands, lit and shaded, the shaded band leaning
// purple-blue, never grey; a thin soft step between them. Included by toon.gdshader and floor.gdshader.

uniform vec4 shade_tint : source_color = vec4(0.42, 0.36, 0.62, 1.0);
uniform float band : hint_range(0.0, 1.0) = 0.5;
uniform float band_soft : hint_range(0.0, 0.2) = 0.03;

void light() {
	float ndl = dot(NORMAL, LIGHT) * 0.5 + 0.5;
	float lit = smoothstep(band - band_soft, band + band_soft, ndl) * ATTENUATION;
	vec3 tone = mix(shade_tint.rgb * 0.45, vec3(1.0), lit);
	DIFFUSE_LIGHT += tone * LIGHT_COLOR / PI;
}
