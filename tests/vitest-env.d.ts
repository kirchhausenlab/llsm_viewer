/// <reference types="vitest" />

declare global {
  var __resizeObserverMock: {
    observe: (target: Element, callback: ResizeObserverCallback) => void;
    unobserve: (target: Element) => void;
    trigger: (target: Element) => void;
    reset: () => void;
  };
}

export {};
