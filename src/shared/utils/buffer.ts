export function ensureArrayBuffer(view: Uint8Array): ArrayBuffer {
  if (view.byteLength === 0) {
    return new ArrayBuffer(0);
  }
  const { buffer, byteOffset, byteLength } = view;
  if (buffer instanceof ArrayBuffer) {
    if (byteOffset === 0 && byteLength === buffer.byteLength) {
      return buffer;
    }
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  const copy = new Uint8Array(byteLength);
  copy.set(view);
  return copy.buffer;
}

export function cloneUint8Array(view: Uint8Array): Uint8Array {
  if (view.byteLength === 0) {
    return new Uint8Array(0);
  }
  const buffer = ensureArrayBuffer(view);
  return new Uint8Array(buffer);
}
