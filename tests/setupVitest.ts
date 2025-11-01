import { afterEach, vi } from 'vitest';
import type * as ThreeTypes from 'three';

type ObserverRecord = {
  instance: ResizeObserver;
  callback: ResizeObserverCallback;
};

const resizeObservers = new Map<Element, ObserverRecord[]>();

class MockResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.targets.add(target);
    const records = resizeObservers.get(target) ?? [];
    records.push({ instance: this, callback: this.callback });
    resizeObservers.set(target, records);
    globalThis.__resizeObserverMock.observe(target, this.callback);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
    const records = resizeObservers.get(target);
    if (!records) {
      return;
    }
    resizeObservers.set(
      target,
      records.filter((record) => record.instance !== this)
    );
    globalThis.__resizeObserverMock.unobserve(target);
  }

  disconnect() {
    for (const target of Array.from(this.targets)) {
      this.unobserve(target);
    }
  }
}

if (!globalThis.__resizeObserverMock) {
  const registry = new Map<Element, ResizeObserverCallback>();
  globalThis.__resizeObserverMock = {
    observe(target, callback) {
      registry.set(target, callback);
    },
    unobserve(target) {
      registry.delete(target);
    },
    trigger(target) {
      const callback = registry.get(target);
      if (callback) {
        callback([], new MockResizeObserver(callback));
      }
    },
    reset() {
      registry.clear();
    }
  };
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: MockResizeObserver
});

afterEach(() => {
  globalThis.__resizeObserverMock.reset();
  resizeObservers.clear();
});

const controllerFactory = () => {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    visible: false,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(listener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      const set = listeners.get(type);
      if (!set) {
        return;
      }
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(type);
      }
    }),
    dispatch(type: string, event: Event) {
      const set = listeners.get(type);
      if (!set) {
        return;
      }
      for (const listener of set) {
        listener.call(null, event);
      }
    }
  };
};

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class MockWebGLRenderer {
    public readonly domElement: HTMLCanvasElement;
    public outputColorSpace: unknown = null;
    public readonly xr: {
      enabled: boolean;
      isPresenting: boolean;
      setSession: (session: XRSession | null) => void;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      getController: ReturnType<typeof vi.fn>;
      getControllerGrip: ReturnType<typeof vi.fn>;
      setFoveation?: ReturnType<typeof vi.fn>;
      getFoveation?: ReturnType<typeof vi.fn>;
    };
    public animationLoop: ((timestamp: number) => void) | null = null;
    public size: { width: number; height: number } = { width: 0, height: 0 };

    public readonly setPixelRatio = vi.fn();
    public readonly setSize = vi.fn((width: number, height: number) => {
      this.size = { width, height };
    });
    public readonly setClearColor = vi.fn();
    public readonly dispose = vi.fn();
    public readonly render = vi.fn();

    private readonly controllers: Array<ReturnType<typeof controllerFactory>> = [];
    private readonly grips: Array<ReturnType<typeof controllerFactory>> = [];

    constructor(_parameters?: unknown) {
      this.domElement = document.createElement('canvas');
      Object.defineProperty(this.domElement, 'style', {
        value: {},
        writable: true
      });

      this.controllers = [controllerFactory(), controllerFactory()];
      this.grips = [controllerFactory(), controllerFactory()];

      const sessionState = { session: null as XRSession | null };
      this.xr = {
        enabled: false,
        isPresenting: false,
        setSession: vi.fn((session: XRSession | null) => {
          sessionState.session = session;
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getController: vi.fn((index: number) => this.controllers[index]),
        getControllerGrip: vi.fn((index: number) => this.grips[index]),
        setFoveation: vi.fn(),
        getFoveation: vi.fn()
      };
    }

    setAnimationLoop = vi.fn((loop: ((timestamp: number) => void) | null) => {
      this.animationLoop = loop ?? null;
    });
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer
  };
});

vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockOrbitControls {
    public static instances: MockOrbitControls[] = [];
    public readonly target = new actual.Vector3();
    public enabled = true;
    public enableDamping = false;
    public enablePan = false;
    public readonly update = vi.fn();
    public readonly dispose = vi.fn();
    public readonly camera: unknown;
    public readonly domElement: unknown;

    constructor(camera: unknown, domElement: unknown) {
      this.camera = camera;
      this.domElement = domElement;
      MockOrbitControls.instances.push(this);
    }
  }

  return { OrbitControls: MockOrbitControls };
});

vi.mock('three/examples/jsm/lines/Line2', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockLine2 extends actual.Object3D {
    public frustumCulled = false;
    public geometry: unknown;
    public material: unknown;

    constructor(geometry: unknown, material: unknown) {
      super();
      this.geometry = geometry;
      this.material = material;
    }

    computeLineDistances() {}
  }

  return { Line2: MockLine2 };
});

vi.mock('three/examples/jsm/lines/LineGeometry', async () => {
  class MockLineGeometry {
    public instanceCount = 0;
    private positions: Float32Array | null = null;
    setPositions(positions: Float32Array) {
      this.positions = positions;
    }
    dispose() {}
  }
  return { LineGeometry: MockLineGeometry };
});

vi.mock('three/examples/jsm/lines/LineMaterial', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockLineMaterial {
    public readonly color: ThreeTypes.Color;
    public linewidth: number;
    public transparent: boolean;
    public opacity: number;
    public depthTest: boolean;
    public depthWrite: boolean;
    public readonly resolution: ThreeTypes.Vector2;
    public needsUpdate = false;

    constructor(options: {
      color: import('three').Color;
      linewidth: number;
      transparent: boolean;
      opacity: number;
      depthTest: boolean;
      depthWrite: boolean;
    }) {
      this.color = options.color;
      this.linewidth = options.linewidth;
      this.transparent = options.transparent;
      this.opacity = options.opacity;
      this.depthTest = options.depthTest;
      this.depthWrite = options.depthWrite;
      this.resolution = new actual.Vector2(1, 1);
    }

    dispose() {
      this.needsUpdate = true;
    }
  }

  return { LineMaterial: MockLineMaterial };
});

if (!globalThis.HTMLCanvasElement.prototype.getContext) {
  globalThis.HTMLCanvasElement.prototype.getContext = vi.fn();
}
