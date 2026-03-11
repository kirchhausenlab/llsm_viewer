import { Vector2, Vector3, type Data3DTexture, type DataTexture } from 'three';

type SliceUniforms = {
  u_slice: { value: DataTexture | null };
  u_cmdata: { value: DataTexture | null };
  u_channels: { value: number };
  u_additive: { value: number };
  u_isSegmentation: { value: number };
  u_windowMin: { value: number };
  u_windowMax: { value: number };
  u_invert: { value: number };
  u_sliceIndex: { value: number };
  u_sliceSize: { value: Vector2 };
  u_backgroundMaskEnabled: { value: number };
  u_backgroundMask: { value: Data3DTexture | null };
  u_backgroundMaskSize: { value: Vector3 };
  u_hoverActive: { value: number };
  u_hoverPixel: { value: Vector2 };
  u_hoverGridSubdivisions: { value: Vector2 };
  u_hoverOutlineColor: { value: Vector3 };
};

const uniforms = {
  u_slice: { value: null as DataTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_additive: { value: 0 },
  u_isSegmentation: { value: 0 },
  u_windowMin: { value: 0 },
  u_windowMax: { value: 1 },
  u_invert: { value: 0 },
  u_sliceIndex: { value: 0 },
  u_sliceSize: { value: new Vector2(1, 1) },
  u_backgroundMaskEnabled: { value: 0 },
  u_backgroundMask: { value: null as Data3DTexture | null },
  u_backgroundMaskSize: { value: new Vector3(1, 1, 1) },
  u_hoverActive: { value: 0 },
  u_hoverPixel: { value: new Vector2(-1, -1) },
  u_hoverGridSubdivisions: { value: new Vector2(1, 1) },
  u_hoverOutlineColor: { value: new Vector3(1.0, 0.95, 0.72) },
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
    uniform float u_isSegmentation;
    uniform float u_windowMin;
    uniform float u_windowMax;
    uniform float u_invert;
    uniform float u_sliceIndex;
    uniform float u_backgroundMaskEnabled;
    uniform float u_hoverActive;
    uniform vec2 u_sliceSize;
    uniform vec3 u_backgroundMaskSize;
    uniform vec2 u_hoverPixel;
    uniform vec2 u_hoverGridSubdivisions;
    uniform vec3 u_hoverOutlineColor;

    uniform sampler2D u_cmdata;
    uniform sampler2D u_slice;
    uniform sampler3D u_backgroundMask;

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

    bool is_background_masked_slice(vec2 uv) {
      if (u_backgroundMaskEnabled <= 0.5) {
        return false;
      }
      vec2 safeUv = clamp(uv, 0.0, 1.0);
      vec3 maskSize = max(u_backgroundMaskSize, vec3(1.0));
      ivec2 maskTexelXY = ivec2(
        clamp(
          floor(safeUv * maskSize.xy),
          vec2(0.0),
          max(maskSize.xy - vec2(1.0), vec2(0.0))
        )
      );
      int maskTexelZ = int(clamp(floor(u_sliceIndex + 0.5), 0.0, maskSize.z - 1.0));
      return texelFetch(u_backgroundMask, ivec3(maskTexelXY, maskTexelZ), 0).r > 0.5;
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

    float line_mask(float distanceToLine, float thickness, float aa) {
      return 1.0 - smoothstep(thickness, thickness + aa, distanceToLine);
    }

    float subdivision_line_mask(float coordinate, float subdivisions, float thickness, float aa) {
      if (subdivisions <= 1.0) {
        return 0.0;
      }
      float scaled = coordinate * subdivisions;
      float fractional = fract(scaled);
      float distanceToNearest = min(fractional, 1.0 - fractional) / subdivisions;
      return line_mask(distanceToNearest, thickness, aa);
    }

    vec4 apply_hover_outline(vec4 color) {
      if (u_hoverActive < 0.5 || u_sliceSize.x <= 0.0 || u_sliceSize.y <= 0.0) {
        return color;
      }

      vec2 pixelCoord = clamp(v_uv, 0.0, 1.0) * u_sliceSize;
      vec2 hoverMin = u_hoverPixel;
      vec2 hoverMax = hoverMin + vec2(1.0);
      if (
        pixelCoord.x < hoverMin.x ||
        pixelCoord.y < hoverMin.y ||
        pixelCoord.x > hoverMax.x ||
        pixelCoord.y > hoverMax.y
      ) {
        return color;
      }

      vec2 local = pixelCoord - hoverMin;
      float aa = max(max(fwidth(local.x), fwidth(local.y)), 1e-4) * 1.5;
      float outerThickness = 0.08;
      float innerThickness = 0.05;

      float edgeDistance = min(
        min(local.x, 1.0 - local.x),
        min(local.y, 1.0 - local.y)
      );
      float outerMask = line_mask(edgeDistance, outerThickness, aa);

      float subdivisionX = max(u_hoverGridSubdivisions.x, 1.0);
      float subdivisionY = max(u_hoverGridSubdivisions.y, 1.0);
      float innerX = subdivision_line_mask(local.x, subdivisionX, innerThickness, aa);
      float innerY = subdivision_line_mask(local.y, subdivisionY, innerThickness, aa);
      float gateX = step(outerThickness, local.x) * step(local.x, 1.0 - outerThickness);
      float gateY = step(outerThickness, local.y) * step(local.y, 1.0 - outerThickness);
      float innerMask = max(innerX * gateX, innerY * gateY);

      float outlineMask = clamp(max(outerMask, innerMask), 0.0, 1.0);
      if (outlineMask <= 0.0) {
        return color;
      }

      vec3 outlinedRgb = mix(color.rgb, u_hoverOutlineColor, outlineMask * 0.92);
      float outlinedAlpha = max(color.a, outlineMask * 0.8);
      return vec4(outlinedRgb, outlinedAlpha);
    }

    void main() {
      if (is_background_masked_slice(v_uv)) {
        gl_FragColor = apply_blending_mode(apply_hover_outline(vec4(0.0)));
        return;
      }

      vec4 sliceSample = sample_slice(v_uv);
      if (u_isSegmentation > 0.5) {
        gl_FragColor = apply_blending_mode(apply_hover_outline(sliceSample));
        return;
      }
      float intensity = luminance(sliceSample);
      float adjusted = adjust_intensity(intensity);

      if (u_channels == 1) {
        vec4 tinted = apply_colormap(adjusted);
        vec4 color = vec4(tinted.rgb, max(adjusted, 0.05));
        gl_FragColor = apply_blending_mode(apply_hover_outline(color));
      } else {
        vec3 baseColor;
        if (u_channels == 2) {
          baseColor = vec3(sliceSample.r, sliceSample.g, 0.0);
        } else {
          baseColor = sliceSample.rgb;
        }
        vec3 adjustedColor = adjust_color(baseColor);
        if (u_channels == 2) {
          adjustedColor.z = 0.0;
        }
        float alpha = clamp(adjusted, 0.0, 1.0);
        alpha = max(alpha, 0.05);
        gl_FragColor = apply_blending_mode(apply_hover_outline(vec4(adjustedColor, alpha)));
      }
    }
  `
};
