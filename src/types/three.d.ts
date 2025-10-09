declare module 'three' {
  export class Vector2 {
    constructor(x?: number, y?: number);
    set(x: number, y: number): this;
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    multiplyScalar(s: number): this;
    distanceTo(v: Vector3): number;
    copy(v: Vector3): this;
  }

  export class Color {
    constructor(hex?: number);
  }

  export class Object3D {
    position: Vector3;
  }

  export class Scene extends Object3D {
    background: Color | null;
    add(object: Object3D): void;
    remove(object: Object3D): void;
  }

  export class BoxGeometry {
    constructor(width: number, height: number, depth: number);
    translate(x: number, y: number, z: number): void;
    dispose(): void;
  }

  export class Material {
    dispose(): void;
  }

  export class ShaderMaterial extends Material {
    uniforms: Record<string, { value: any }>;
    constructor(parameters: {
      uniforms: Record<string, { value: unknown }>;
      vertexShader: string;
      fragmentShader: string;
      side?: number;
      transparent?: boolean;
    });
  }

  export class Mesh<TGeometry = BoxGeometry, TMaterial = ShaderMaterial> extends Object3D {
    constructor(geometry: TGeometry, material: TMaterial);
    geometry: TGeometry;
    material: TMaterial;
    scale: { setScalar(value: number): void };
  }

  export class PerspectiveCamera extends Object3D {
    constructor(fov: number, aspect: number, near: number, far: number);
    fov: number;
    aspect: number;
    near: number;
    far: number;
    position: Vector3;
    updateProjectionMatrix(): void;
    getWorldDirection(target: Vector3): Vector3;
  }

  export class WebGLRenderer {
    constructor(parameters?: { antialias?: boolean; alpha?: boolean });
    domElement: HTMLCanvasElement;
    outputColorSpace: number;
    setPixelRatio(value: number): void;
    setSize(width: number, height: number): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }

  export class DataTexture {
    constructor(data: Uint8Array, width: number, height: number, format?: number);
    needsUpdate: boolean;
    minFilter: number;
    magFilter: number;
    colorSpace: number;
    dispose(): void;
  }

  export class Data3DTexture extends DataTexture {
    constructor(data: Uint8Array, width: number, height: number, depth: number);
    image: { data: Uint8Array };
    format: number;
    type: number;
    unpackAlignment: number;
    needsUpdate: boolean;
    colorSpace: number;
  }

  export namespace UniformsUtils {
    function clone<T>(uniforms: T): T;
  }

  export namespace MathUtils {
    function degToRad(degrees: number): number;
  }

  export const LinearFilter: number;
  export const BackSide: number;
  export const RedFormat: number;
  export const RGFormat: number;
  export const RGBFormat: number;
  export const RGBAFormat: number;
  export const UnsignedByteType: number;
  export const SRGBColorSpace: number;
  export const LinearSRGBColorSpace: number;
}

declare module 'three/examples/jsm/controls/OrbitControls' {
  import type { PerspectiveCamera } from 'three';

  export class OrbitControls {
    constructor(camera: PerspectiveCamera, domElement: HTMLElement);
    enabled: boolean;
    enablePan: boolean;
    target: import('three').Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    rotateSpeed: number;
    zoomSpeed: number;
    update(): void;
    reset(): void;
    saveState(): void;
    dispose(): void;
  }
}
