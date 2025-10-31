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
  u_cameraPos: { value: Vector3 };
  u_windowMin: { value: number };
  u_windowMax: { value: number };
  u_invert: { value: number };
  u_stepScale: { value: number };
};

const uniforms = {
  u_size: { value: new Vector3(1, 1, 1) },
  u_renderstyle: { value: 0 },
  u_renderthreshold: { value: 0.5 },
  u_clim: { value: new Vector2(1, 1) },
  u_data: { value: null as Data3DTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_cameraPos: { value: new Vector3() },
  u_windowMin: { value: 0 },
  u_windowMax: { value: 1 },
  u_invert: { value: 0 },
  u_stepScale: { value: 1 }
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

    uniform vec3 u_size;
    uniform int u_renderstyle;
    uniform float u_renderthreshold;
    uniform vec2 u_clim;
    uniform int u_channels;
    uniform float u_windowMin;
    uniform float u_windowMax;
    uniform float u_invert;
    uniform float u_stepScale;

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

    vec4 sample_color(vec3 texcoords) {
      return texture(u_data, texcoords.xyz);
    }

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

    float sample1(vec3 texcoords) {
      vec4 colorSample = sample_color(texcoords);
      float intensity = luminance(colorSample);
      return adjust_intensity(intensity);
    }

    vec4 apply_colormap(float val) {
      float normalized = (val - u_clim[0]) / (u_clim[1] - u_clim[0]);
      return texture2D(u_cmdata, vec2(normalized, 0.5));
    }

    vec4 compose_color(float intensity, vec4 colorSample) {
      float adjustedIntensity = adjust_intensity(intensity);
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

      float safeStepScale = max(u_stepScale, 1e-3);
      float travelDistance = tEnd - tStart;
      int nsteps = int(travelDistance * safeStepScale + 0.5);
      nsteps = clamp(nsteps, 1, MAX_STEPS);

      vec3 step = ((back - front) / u_size) / float(nsteps);
      vec3 start_loc = front / u_size;
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

      const float HIGH_WATER_NON_INVERTED = 0.999;
      const float HIGH_WATER_INVERTED = 0.001;

      for (int iter = 0; iter < MAX_STEPS; iter++) {
        if (iter >= nsteps) {
          break;
        }
        vec4 colorSample = sample_color(loc);
        float rawVal = luminance(colorSample);
        float val = adjust_intensity(rawVal);
        if (val > max_val) {
          max_val = val;
          max_i = iter;
          max_color = colorSample;

          bool reachedHighWaterMark;
          if (u_invert > 0.5) {
            reachedHighWaterMark = max_val <= HIGH_WATER_INVERTED;
          } else {
            reachedHighWaterMark = max_val >= HIGH_WATER_NON_INVERTED;
          }

          if (reachedHighWaterMark) {
            break;
          }
        }
        loc += step;
      }

      vec3 iloc = start_loc + step * (float(max_i) - 0.5);
      vec3 istep = step / float(REFINEMENT_STEPS);
      for (int i = 0; i < REFINEMENT_STEPS; i++) {
        vec4 colorSample = sample_color(iloc);
        float refinedRaw = luminance(colorSample);
        float refined = adjust_intensity(refinedRaw);
        if (refined > max_val) {
          max_val = refined;
          max_color = colorSample;
        }
        iloc += istep;
      }

      gl_FragColor = compose_color(max_val, max_color);
    }

    void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      gl_FragColor = vec4(0.0);
      vec3 dstep = 1.5 / u_size;
      vec3 loc = start_loc;

      float low_threshold = u_renderthreshold - 0.02 * (u_clim[1] - u_clim[0]);

      for (int iter = 0; iter < MAX_STEPS; iter++) {
        if (iter >= nsteps) {
          break;
        }

        float val = sample1(loc);

        if (val > low_threshold) {
          vec3 iloc = loc - 0.5 * step;
          vec3 istep = step / float(REFINEMENT_STEPS);
          for (int i = 0; i < REFINEMENT_STEPS; i++) {
            vec4 colorSample = sample_color(iloc);
            float refined = adjust_intensity(luminance(colorSample));
            if (refined > u_renderthreshold) {
              gl_FragColor = add_lighting(refined, iloc, dstep, view_ray, colorSample);
              return;
            }
            iloc += istep;
          }
        }

        loc += step;
      }
    }

    vec4 add_lighting(float val, vec3 loc, vec3 step, vec3 view_ray, vec4 colorSample) {
      vec3 V = normalize(view_ray);

      vec3 N;
      float val1 = adjust_intensity(luminance(sample_color(loc + vec3(-step[0], 0.0, 0.0))));
      float val2 = adjust_intensity(luminance(sample_color(loc + vec3(+step[0], 0.0, 0.0))));
      N[0] = val1 - val2;
      val = max(max(val1, val2), val);
      val1 = adjust_intensity(luminance(sample_color(loc + vec3(0.0, -step[1], 0.0))));
      val2 = adjust_intensity(luminance(sample_color(loc + vec3(0.0, +step[1], 0.0))));
      N[1] = val1 - val2;
      val = max(max(val1, val2), val);
      val1 = adjust_intensity(luminance(sample_color(loc + vec3(0.0, 0.0, -step[2]))));
      val2 = adjust_intensity(luminance(sample_color(loc + vec3(0.0, 0.0, +step[2]))));
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
