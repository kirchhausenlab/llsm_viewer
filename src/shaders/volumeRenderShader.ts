import { Vector2, Vector3 } from 'three';
import type { Data3DTexture, DataTexture } from 'three';

type VolumeUniforms = {
  u_size: { value: Vector3 };
  u_renderstyle: { value: number };
  u_renderthreshold: { value: number };
  u_clim: { value: Vector2 };
  u_data: { value: Data3DTexture | null };
  u_cmdata: { value: DataTexture | null };
  u_channels: { value: number };
  u_additive: { value: number };
  u_cameraPos: { value: Vector3 };
  u_windowMin: { value: number };
  u_windowMax: { value: number };
  u_invert: { value: number };
  u_stepScale: { value: number };
  u_nearestSampling: { value: number };
  u_useClipmap: { value: number };
  u_clipmapLevelCount: { value: number };
  u_clipmapSize: { value: number };
  u_clipmapOrigins: { value: Vector3[] };
  u_clipmapScales: { value: number[] };
  u_clipmapTextures: { value: (Data3DTexture | null)[] };
  u_minClipLevel: { value: number };
  u_hoverPos: { value: Vector3 };
  u_hoverScale: { value: Vector3 };
  u_hoverRadius: { value: number };
  u_hoverActive: { value: number };
  u_hoverPulse: { value: number };
  u_hoverLabel: { value: number };
  u_hoverSegmentationMode: { value: number };
  u_segmentationLabels: { value: Data3DTexture | null };
};

const uniforms = {
  u_size: { value: new Vector3(1, 1, 1) },
  u_renderstyle: { value: 0 },
  u_renderthreshold: { value: 0.5 },
  u_clim: { value: new Vector2(1, 1) },
  u_data: { value: null as Data3DTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_additive: { value: 0 },
  u_cameraPos: { value: new Vector3() },
  u_windowMin: { value: 0 },
  u_windowMax: { value: 1 },
  u_invert: { value: 0 },
  u_stepScale: { value: 1 },
  u_nearestSampling: { value: 0 },
  u_useClipmap: { value: 0 },
  u_clipmapLevelCount: { value: 0 },
  u_clipmapSize: { value: 1 },
  u_clipmapOrigins: { value: new Array(6).fill(null).map(() => new Vector3()) },
  u_clipmapScales: { value: new Array(6).fill(1) },
  u_clipmapTextures: { value: new Array(6).fill(null) as (Data3DTexture | null)[] },
  u_minClipLevel: { value: 0 },
  u_hoverPos: { value: new Vector3() },
  u_hoverScale: { value: new Vector3() },
  u_hoverRadius: { value: 0 },
  u_hoverActive: { value: 0 },
  u_hoverPulse: { value: 0 },
  u_hoverLabel: { value: 0 },
  u_hoverSegmentationMode: { value: 0 },
  u_segmentationLabels: { value: null as Data3DTexture | null }
} satisfies VolumeUniforms;

export const VolumeRenderShader = {
  uniforms,
  vertexShader: /* glsl */ `
    varying vec4 v_nearpos;
    varying vec4 v_farpos;
    varying vec3 v_position;

    void main() {
      mat4 viewtransformf = modelViewMatrix;
      mat4 viewtransformi = inverse(modelViewMatrix);

      vec4 position4 = vec4(position, 1.0);
      vec4 pos_in_cam = viewtransformf * position4;

      pos_in_cam.z = -pos_in_cam.w;
      v_nearpos = viewtransformi * pos_in_cam;

      pos_in_cam.z = pos_in_cam.w;
      v_farpos = viewtransformi * pos_in_cam;

      v_position = position;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * position4;
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    precision mediump sampler3D;

    #define MAX_CLIP_LEVELS 6

    uniform vec3 u_size;
    uniform int u_renderstyle;
    uniform float u_renderthreshold;
    uniform vec2 u_clim;
    uniform int u_channels;
    uniform float u_additive;
    uniform float u_windowMin;
    uniform float u_windowMax;
    uniform float u_invert;
    uniform float u_stepScale;
    uniform float u_nearestSampling;
    uniform float u_useClipmap;
    uniform int u_clipmapLevelCount;
    uniform float u_clipmapSize;
    uniform vec3 u_clipmapOrigins[MAX_CLIP_LEVELS];
    uniform float u_clipmapScales[MAX_CLIP_LEVELS];
    uniform sampler3D u_clipmapTextures[MAX_CLIP_LEVELS];
    uniform float u_minClipLevel;
    uniform vec3 u_hoverPos;
    uniform vec3 u_hoverScale;
    uniform float u_hoverRadius;
    uniform float u_hoverActive;
    uniform float u_hoverPulse;
    uniform float u_hoverLabel;
    uniform float u_hoverSegmentationMode;
    uniform sampler3D u_segmentationLabels;

    uniform sampler3D u_data;
    uniform sampler2D u_cmdata;
    uniform vec3 u_cameraPos;

    varying vec3 v_position;
    varying vec4 v_nearpos;
    varying vec4 v_farpos;

    const int MAX_STEPS = 887;
    const int REFINEMENT_STEPS = 4;
    const float EPSILON = 1e-6;
    const float LARGE = 1e20;
    const float shininess = 40.0;
    const float ambientStrength = 0.2;
    const float diffuseStrength = 0.8;
    const vec3 specularColor = vec3(1.0);

    vec4 add_lighting(float val, vec3 loc, vec3 step, vec3 view_ray, vec4 sampleColor);
    void cast_mip(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);
    void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);

    vec4 sample_clipmap(vec3 texcoords, out float levelScale) {
      vec3 voxelPos = texcoords * u_size;
      int chosenLevel = -1;
      vec4 sampled = vec4(0.0);
      levelScale = 1.0;
      bool sampledLevel = false;

#define SAMPLE_CLIPMAP_LEVEL(LEVEL)                                                                            \
      if (!sampledLevel && u_clipmapLevelCount > LEVEL && float(LEVEL) >= u_minClipLevel) {                   \
        vec3 origin = u_clipmapOrigins[LEVEL];                                                                \
        float scale = u_clipmapScales[LEVEL];                                                                 \
        vec3 extent = vec3(u_clipmapSize * scale);                                                            \
        vec3 local = (voxelPos - origin) / extent;                                                            \
        if (all(greaterThanEqual(local, vec3(0.0))) && all(lessThan(local, vec3(1.0)))) {                    \
          sampled = texture(u_clipmapTextures[LEVEL], local);                                                 \
          levelScale = scale;                                                                                \
          chosenLevel = LEVEL;                                                                               \
          sampledLevel = true;                                                                               \
        }                                                                                                     \
      }

      SAMPLE_CLIPMAP_LEVEL(0)
      SAMPLE_CLIPMAP_LEVEL(1)
      SAMPLE_CLIPMAP_LEVEL(2)
      SAMPLE_CLIPMAP_LEVEL(3)
      SAMPLE_CLIPMAP_LEVEL(4)
      SAMPLE_CLIPMAP_LEVEL(5)

#undef SAMPLE_CLIPMAP_LEVEL

      if (!sampledLevel) {
        int fallback = clamp(u_clipmapLevelCount - 1, 0, MAX_CLIP_LEVELS - 1);
        switch (fallback) {
          case 0: {
            float scale = u_clipmapScales[0];
            vec3 origin = u_clipmapOrigins[0];
            vec3 extent = vec3(u_clipmapSize * scale);
            vec3 local = (voxelPos - origin) / extent;
            sampled = texture(u_clipmapTextures[0], local);
            levelScale = scale;
            break;
          }
          case 1: {
            float scale = u_clipmapScales[1];
            vec3 origin = u_clipmapOrigins[1];
            vec3 extent = vec3(u_clipmapSize * scale);
            vec3 local = (voxelPos - origin) / extent;
            sampled = texture(u_clipmapTextures[1], local);
            levelScale = scale;
            break;
          }
          case 2: {
            float scale = u_clipmapScales[2];
            vec3 origin = u_clipmapOrigins[2];
            vec3 extent = vec3(u_clipmapSize * scale);
            vec3 local = (voxelPos - origin) / extent;
            sampled = texture(u_clipmapTextures[2], local);
            levelScale = scale;
            break;
          }
          case 3: {
            float scale = u_clipmapScales[3];
            vec3 origin = u_clipmapOrigins[3];
            vec3 extent = vec3(u_clipmapSize * scale);
            vec3 local = (voxelPos - origin) / extent;
            sampled = texture(u_clipmapTextures[3], local);
            levelScale = scale;
            break;
          }
          case 4: {
            float scale = u_clipmapScales[4];
            vec3 origin = u_clipmapOrigins[4];
            vec3 extent = vec3(u_clipmapSize * scale);
            vec3 local = (voxelPos - origin) / extent;
            sampled = texture(u_clipmapTextures[4], local);
            levelScale = scale;
            break;
          }
          case 5: {
            float scale = u_clipmapScales[5];
            vec3 origin = u_clipmapOrigins[5];
            vec3 extent = vec3(u_clipmapSize * scale);
            vec3 local = (voxelPos - origin) / extent;
            sampled = texture(u_clipmapTextures[5], local);
            levelScale = scale;
            break;
          }
          default:
            break;
        }
      }

      return sampled;
    }

    vec4 sample_color_with_scale(vec3 texcoords, out float levelScale) {
      if (u_useClipmap > 0.5 && u_clipmapLevelCount > 0) {
        return sample_clipmap(texcoords, levelScale);
      }
      levelScale = 1.0;
      return texture(u_data, texcoords.xyz);
    }

    vec4 sample_color(vec3 texcoords) {
      float unusedScale;
      return sample_color_with_scale(texcoords, unusedScale);
    }

    float normalize_window(float value) {
      float range = max(u_windowMax - u_windowMin, 1e-5);
      float normalized = (value - u_windowMin) / range;
      return clamp(normalized, 0.0, 1.0);
    }

    float apply_inversion(float normalized) {
      return u_invert > 0.5 ? 1.0 - normalized : normalized;
    }

    float normalize_intensity(float value) {
      return normalize_window(value);
    }

    float adjust_intensity(float value) {
      return apply_inversion(normalize_intensity(value));
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

    float sample1(vec3 texcoords) {
      float levelScale;
      vec4 colorSample = sample_color_with_scale(texcoords, levelScale);
      float intensity = luminance(colorSample);
      return adjust_intensity(intensity);
    }

    vec4 apply_colormap(float val) {
      float normalized = (val - u_clim[0]) / (u_clim[1] - u_clim[0]);
      return texture2D(u_cmdata, vec2(normalized, 0.5));
    }

    vec4 compose_color(float normalizedIntensity, vec4 colorSample) {
      float adjustedIntensity = apply_inversion(normalizedIntensity);
      if (u_channels == 1) {
        return apply_colormap(adjustedIntensity);
      }
      vec3 baseColor;
      if (u_channels == 2) {
        baseColor = vec3(colorSample.r, colorSample.g, 0.0);
      } else {
        baseColor = colorSample.rgb;
      }
      vec3 adjustedColor = adjust_color(baseColor);
      if (u_channels == 2) {
        adjustedColor.z = 0.0;
      }
      float alpha = clamp(adjustedIntensity, 0.0, 1.0);
      return vec4(adjustedColor, alpha);
    }

    vec4 apply_blending_mode(vec4 color) {
      if (u_additive > 0.5) {
        color.rgb *= color.a;
        color.a = color.a > 0.0 ? 1.0 : 0.0;
      }
      return color;
    }

    void main() {
      vec3 farpos = v_farpos.xyz / v_farpos.w;
      vec3 nearpos = v_nearpos.xyz / v_nearpos.w;

      vec3 rayOrigin = u_cameraPos;
      vec3 rawDir = v_position - rayOrigin;
      float rawDirLength = length(rawDir);
      if (rawDirLength < EPSILON) {
        discard;
      }
      vec3 rayDir = rawDir / rawDirLength;

      vec3 boxMin = vec3(-0.5);
      vec3 boxMax = u_size - 0.5;

      vec3 tLower;
      vec3 tUpper;

      if (abs(rayDir.x) < EPSILON) {
        if (rayOrigin.x < boxMin.x || rayOrigin.x > boxMax.x) {
          discard;
        }
        tLower.x = -LARGE;
        tUpper.x = LARGE;
      } else {
        float tx1 = (boxMin.x - rayOrigin.x) / rayDir.x;
        float tx2 = (boxMax.x - rayOrigin.x) / rayDir.x;
        tLower.x = min(tx1, tx2);
        tUpper.x = max(tx1, tx2);
      }

      if (abs(rayDir.y) < EPSILON) {
        if (rayOrigin.y < boxMin.y || rayOrigin.y > boxMax.y) {
          discard;
        }
        tLower.y = -LARGE;
        tUpper.y = LARGE;
      } else {
        float ty1 = (boxMin.y - rayOrigin.y) / rayDir.y;
        float ty2 = (boxMax.y - rayOrigin.y) / rayDir.y;
        tLower.y = min(ty1, ty2);
        tUpper.y = max(ty1, ty2);
      }

      if (abs(rayDir.z) < EPSILON) {
        if (rayOrigin.z < boxMin.z || rayOrigin.z > boxMax.z) {
          discard;
        }
        tLower.z = -LARGE;
        tUpper.z = LARGE;
      } else {
        float tz1 = (boxMin.z - rayOrigin.z) / rayDir.z;
        float tz2 = (boxMax.z - rayOrigin.z) / rayDir.z;
        tLower.z = min(tz1, tz2);
        tUpper.z = max(tz1, tz2);
      }

      float entry = max(max(tLower.x, tLower.y), tLower.z);
      float exit = min(min(tUpper.x, tUpper.y), tUpper.z);

      if (exit <= entry) {
        discard;
      }

      float tStart = max(entry, 0.0);
      float tEnd = exit;

      if (tEnd <= tStart) {
        discard;
      }

      vec3 front = rayOrigin + rayDir * tStart;
      vec3 back = rayOrigin + rayDir * tEnd;

      float travelDistance = tEnd - tStart;
      int nsteps;
      vec3 step;
      vec3 start_loc;

      if (u_nearestSampling > 0.5) {
        vec3 frontCenter = floor(front) + vec3(0.5);
        start_loc = frontCenter / u_size;
        step = rayDir / u_size;
        nsteps = clamp(int(travelDistance) + 1, 1, MAX_STEPS);
      } else {
        float safeStepScale = max(u_stepScale, 1e-3);
        nsteps = int(travelDistance * safeStepScale + 0.5);
        nsteps = clamp(nsteps, 1, MAX_STEPS);
        step = ((back - front) / u_size) / float(nsteps);
        start_loc = front / u_size;
      }
      vec3 view_ray = -rayDir;

      if (u_renderstyle == 0) {
        cast_mip(start_loc, step, nsteps, view_ray);
      } else if (u_renderstyle == 1) {
        cast_iso(start_loc, step, nsteps, view_ray);
      }

      if (gl_FragColor.a < 0.05) {
        discard;
      }
    }

    void cast_mip(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      float max_val = -1e6;
      int max_i = 100;
      vec4 max_color = vec4(0.0);
      vec3 loc = start_loc;
      vec3 max_loc = start_loc;

      const float HIGH_WATER_MARK = 0.999;

      for (int iter = 0; iter < MAX_STEPS; iter++) {
        if (iter >= nsteps) {
          break;
        }
        float levelScale;
        vec4 colorSample = sample_color_with_scale(loc, levelScale);
        float rawVal = luminance(colorSample);
        float normalizedVal = normalize_intensity(rawVal);
        if (normalizedVal > max_val) {
          max_val = normalizedVal;
          max_i = iter;
          max_color = colorSample;
          max_loc = loc;

          if (max_val >= HIGH_WATER_MARK) {
            break;
          }
        }
        vec3 scaledStep = step * levelScale;
        loc += scaledStep;
      }

      vec3 iloc = start_loc + step * (float(max_i) - 0.5);
      vec3 istep = step / float(REFINEMENT_STEPS);
      for (int i = 0; i < REFINEMENT_STEPS; i++) {
        float levelScale;
        vec4 colorSample = sample_color_with_scale(iloc, levelScale);
        float refinedRaw = luminance(colorSample);
        float refined = normalize_intensity(refinedRaw);
        if (refined > max_val) {
          max_val = refined;
          max_color = colorSample;
          max_loc = iloc;
        }
        iloc += istep;
      }

      vec4 color = compose_color(max_val, max_color);

      if (u_hoverActive > 0.5 && length(u_hoverScale) > 0.0) {
        float pulse = clamp(u_hoverPulse, 0.0, 1.0);
        bool segmentationHover = u_hoverSegmentationMode > 0.5;
        if (segmentationHover) {
          float sampleLabel = texture(u_segmentationLabels, max_loc).r;
          if (abs(sampleLabel - u_hoverLabel) <= 0.5) {
            color.rgb = mix(color.rgb, vec3(1.0), pulse * 0.6);
          }
        } else if (u_hoverRadius > 0.0) {
          vec3 delta = (max_loc - u_hoverPos) * u_hoverScale;
          float falloff = smoothstep(0.0, u_hoverRadius, length(delta));
          float highlight = (1.0 - falloff) * pulse;
          color.rgb = mix(color.rgb, vec3(1.0), highlight * 0.6);
        }
      }

      gl_FragColor = apply_blending_mode(color);
    }

    void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      vec4 hitColor = vec4(0.0);
      vec3 loc = start_loc;

      float low_threshold = u_renderthreshold - 0.02 * (u_clim[1] - u_clim[0]);
      bool hasHit = false;

      for (int iter = 0; iter < MAX_STEPS; iter++) {
        if (iter >= nsteps) {
          break;
        }

        float levelScale;
        vec4 colorSample = sample_color_with_scale(loc, levelScale);
        float val = adjust_intensity(luminance(colorSample));
        vec3 dstep = (1.5 * levelScale) / u_size;

        if (!hasHit && val > low_threshold) {
          vec3 iloc = loc - 0.5 * step;
          vec3 istep = step / float(REFINEMENT_STEPS);
          for (int i = 0; i < REFINEMENT_STEPS; i++) {
            float refineScale;
            vec4 colorSample = sample_color_with_scale(iloc, refineScale);
            float refinedRaw = luminance(colorSample);
            float refined = normalize_intensity(refinedRaw);
            float adjustedRefined = apply_inversion(refined);
            if (adjustedRefined > u_renderthreshold) {
              vec3 gradientStep = (1.5 * refineScale) / u_size;
              hitColor = add_lighting(refined, iloc, gradientStep, view_ray, colorSample);
              hasHit = true;
              break;
            }
            iloc += istep;
          }
          if (hasHit) {
            break;
          }
        }

        vec3 scaledStep = step * levelScale;
        loc += scaledStep;
      }

      gl_FragColor = apply_blending_mode(hitColor);
    }

    vec4 add_lighting(float val, vec3 loc, vec3 step, vec3 view_ray, vec4 colorSample) {
      vec3 V = normalize(view_ray);

      vec3 N;
      float val1 = normalize_intensity(luminance(sample_color(loc + vec3(-step[0], 0.0, 0.0))));
      float val2 = normalize_intensity(luminance(sample_color(loc + vec3(+step[0], 0.0, 0.0))));
      N[0] = val1 - val2;
      val = max(max(val1, val2), val);
      val1 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, -step[1], 0.0))));
      val2 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, +step[1], 0.0))));
      N[1] = val1 - val2;
      val = max(max(val1, val2), val);
      val1 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, 0.0, -step[2]))));
      val2 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, 0.0, +step[2]))));
      N[2] = val1 - val2;
      val = max(max(val1, val2), val);

      float gm = length(N);
      if (gm > 0.0) {
        N = normalize(N);
      }

      float Nselect = float(dot(N, V) > 0.0);
      N = (2.0 * Nselect - 1.0) * N;

      vec3 L = normalize(view_ray);
      if (length(L) == 0.0) {
        L = vec3(0.0, 0.0, 1.0);
      }
      float lambertTerm = clamp(dot(N, L), 0.0, 1.0);
      vec3 H = normalize(L + V);
      float specularTerm = pow(max(dot(H, N), 0.0), shininess);

      vec4 baseColor = compose_color(val, colorSample);
      vec3 litColor = baseColor.rgb * (ambientStrength + diffuseStrength * lambertTerm) + specularTerm * specularColor;
      return vec4(litColor, baseColor.a);
    }
  `
};

export type VolumeRenderShaderType = typeof VolumeRenderShader;
