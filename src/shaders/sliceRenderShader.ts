import type { DataTexture } from 'three';

type SliceUniforms = {
  u_slice: { value: DataTexture | null };
  u_cmdata: { value: DataTexture | null };
  u_channels: { value: number };
  u_contrast: { value: number };
  u_gamma: { value: number };
  u_brightness: { value: number };
  u_invert: { value: number };
};

const uniforms = {
  u_slice: { value: null as DataTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_contrast: { value: 1 },
  u_gamma: { value: 1 },
  u_brightness: { value: 0 },
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
    uniform float u_contrast;
    uniform float u_gamma;
    uniform float u_brightness;
    uniform float u_invert;

    uniform sampler2D u_cmdata;
    uniform sampler2D u_slice;

    varying vec2 v_uv;

    float apply_brightness(float value) {
      return clamp(value + u_brightness, 0.0, 1.0);
    }

    float apply_contrast(float value) {
      float centered = value - 0.5;
      return clamp(centered * u_contrast + 0.5, 0.0, 1.0);
    }

    float apply_gamma(float value) {
      float safeGamma = max(u_gamma, 1e-3);
      return clamp(pow(max(value, 0.0), 1.0 / safeGamma), 0.0, 1.0);
    }

    float adjust_intensity(float value) {
      float base = u_invert > 0.5 ? 1.0 - value : value;
      float brightened = apply_brightness(base);
      float contrasted = apply_contrast(brightened);
      return apply_gamma(contrasted);
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

    void main() {
      vec4 sample = sample_slice(v_uv);
      float intensity = luminance(sample);
      float adjusted = adjust_intensity(intensity);

      if (u_channels == 1) {
        vec4 tinted = apply_colormap(adjusted);
        gl_FragColor = vec4(tinted.rgb, max(adjusted, 0.05));
      } else {
        vec3 baseColor = u_invert > 0.5 ? vec3(1.0) - sample.rgb : sample.rgb;
        vec3 brightenedColor = clamp(baseColor + vec3(u_brightness), 0.0, 1.0);
        float safeGamma = max(u_gamma, 1e-3);
        vec3 gammaCorrectedColor = clamp(
          pow(max(brightenedColor, vec3(0.0)), vec3(1.0 / safeGamma)),
          0.0,
          1.0
        );
        float alpha = clamp(adjusted, 0.0, 1.0);
        alpha = max(alpha, 0.05);
        gl_FragColor = vec4(gammaCorrectedColor, alpha);
      }
    }
  `
};
