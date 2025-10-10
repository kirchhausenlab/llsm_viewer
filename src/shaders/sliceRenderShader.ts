import { Vector3 } from 'three';
import type { Data3DTexture, DataTexture } from 'three';

type SliceUniforms = {
  u_size: { value: Vector3 };
  u_sliceIndex: { value: number };
  u_data: { value: Data3DTexture | null };
  u_cmdata: { value: DataTexture | null };
  u_channels: { value: number };
  u_contrast: { value: number };
  u_brightness: { value: number };
};

const uniforms = {
  u_size: { value: new Vector3(1, 1, 1) },
  u_sliceIndex: { value: 0 },
  u_data: { value: null as Data3DTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_contrast: { value: 1 },
  u_brightness: { value: 0 }
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
    precision mediump sampler3D;

    uniform vec3 u_size;
    uniform float u_sliceIndex;
    uniform int u_channels;
    uniform float u_contrast;
    uniform float u_brightness;

    uniform sampler3D u_data;
    uniform sampler2D u_cmdata;

    varying vec2 v_uv;

    float apply_brightness(float value) {
      return clamp(value + u_brightness, 0.0, 1.0);
    }

    float apply_contrast(float value) {
      float centered = value - 0.5;
      return clamp(centered * u_contrast + 0.5, 0.0, 1.0);
    }

    float adjust_intensity(float value) {
      return apply_contrast(apply_brightness(value));
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
      float width = max(u_size.x, 1.0);
      float height = max(u_size.y, 1.0);
      float depth = max(u_size.z, 1.0);

      float sliceIndex = clamp(u_sliceIndex, 0.0, depth - 1.0);
      float normalizedZ = (sliceIndex + 0.5) / depth;

      float clampedX = clamp(uv.x, 0.0, 1.0);
      float clampedY = clamp(uv.y, 0.0, 1.0);

      float xIndex = floor(clampedX * width);
      float yIndex = floor(clampedY * height);

      float normalizedX = (xIndex + 0.5) / width;
      float normalizedY = (yIndex + 0.5) / height;

      return texture(u_data, vec3(normalizedX, normalizedY, normalizedZ));
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
        gl_FragColor = apply_colormap(adjusted);
      } else {
        vec3 adjustedColor = clamp(sample.rgb + vec3(u_brightness), 0.0, 1.0);
        float alpha = clamp(adjusted, 0.0, 1.0);
        gl_FragColor = vec4(adjustedColor, alpha);
      }
    }
  `
};
