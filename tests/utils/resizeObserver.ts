export function triggerResize(target: Element) {
  globalThis.__resizeObserverMock.trigger(target);
}

export function resetResizeObservers() {
  globalThis.__resizeObserverMock.reset();
}
