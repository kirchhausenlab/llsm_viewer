import type { DataTexture } from 'three';

type SliceUniforms = {
  u_slice: { value: DataTexture | null };
  u_cmdata: { value: DataTexture | null };
  u_channels: { value: number };
  u_additive: { value: number };
  u_windowMin: { value: number };
  u_windowMax: { value: number };
  u_invert: { value: number };
};

const uniforms = {
  u_slice: { value: null as DataTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_additive: { value: 0 },
  u_windowMin: { value: 0 },
  u_windowMax: { value: 1 },
  u_invert: { value: 0 }
} satisfies SliceUniforms;

export const SliceRenderShader = {
  uniforms,
  vertexShader: /* glsl */ `
    varying vec2 v_uv;

    void main() {
      v_uv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    precision mediump sampler2D;

    uniform int u_channels;
    uniform float u_additive;
    uniform float u_windowMin;
    uniform float u_windowMax;
    uniform float u_invert;

    uniform sampler2D u_cmdata;
    uniform sampler2D u_slice;

    varying vec2 v_uv;

    float normalize_window(float value) {
      float range = max(u_windowMax - u_windowMin, 1e-5);
      float normalized = (value - u_windowMin) / range;
      return clamp(normalized, 0.0, 1.0);
    }

    float adjust_intensity(float value) {
      float normalized = normalize_window(value);
      return u_invert > 0.5 ? 1.0 - normalized : normalized;
    }

    vec3 adjust_color(vec3 value) {
      float range = max(u_windowMax - u_windowMin, 1e-5);
      vec3 normalized = (value - vec3(u_windowMin)) / range;
      normalized = clamp(normalized, 0.0, 1.0);
      if (u_invert > 0.5) {
        normalized = vec3(1.0) - normalized;
      }
      return normalized;
    }

    float luminance(vec4 colorSample) {
      if (u_channels == 1) {
        return colorSample.r;
      }
      if (u_channels == 2) {
        return 0.5 * (colorSample.r + colorSample.g);
      }
      if (u_channels == 3) {
        return dot(colorSample.rgb, vec3(0.2126, 0.7152, 0.0722));
      }
      return max(max(colorSample.r, colorSample.g), max(colorSample.b, colorSample.a));
    }

    vec4 sample_slice(vec2 uv) {
      vec2 clamped = clamp(uv, 0.0, 1.0);
      return texture2D(u_slice, clamped);
    }

    vec4 apply_colormap(float intensity) {
      float normalized = clamp(intensity, 0.0, 1.0);
      return texture2D(u_cmdata, vec2(normalized, 0.5));
    }

    vec4 apply_blending_mode(vec4 color) {
      if (u_additive > 0.5) {
        color.rgb *= color.a;
        color.a = color.a > 0.0 ? 1.0 : 0.0;
      }
      return color;
    }

    void main() {
      vec4 sample = sample_slice(v_uv);
      float intensity = luminance(sample);
      float adjusted = adjust_intensity(intensity);

      if (u_channels == 1) {
        vec4 tinted = apply_colormap(adjusted);
        vec4 color = vec4(tinted.rgb, max(adjusted, 0.05));
        gl_FragColor = apply_blending_mode(color);
      } else {
        vec3 baseColor;
        if (u_channels == 2) {
          baseColor = vec3(sample.r, sample.g, 0.0);
        } else {
          baseColor = sample.rgb;
        }
        vec3 adjustedColor = adjust_color(baseColor);
        if (u_channels == 2) {
          adjustedColor.z = 0.0;
        }
        float alpha = clamp(adjusted, 0.0, 1.0);
        alpha = max(alpha, 0.05);
        gl_FragColor = apply_blending_mode(vec4(adjustedColor, alpha));
      }
    }
  `
};
