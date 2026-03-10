export function encodeInt32ArrayLE(values: Int32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < values.length; index += 1) {
    view.setInt32(index * 4, values[index] ?? 0, true);
  }
  return bytes;
}

export function decodeInt32ArrayLE(bytes: Uint8Array, expectedLength?: number): Int32Array {
  if (bytes.byteLength % 4 !== 0) {
    throw new Error(`Invalid Int32 payload length: ${bytes.byteLength}.`);
  }
  const length = bytes.byteLength / 4;
  if (expectedLength !== undefined && length !== expectedLength) {
    throw new Error(`Invalid Int32 payload length: expected ${expectedLength}, got ${length}.`);
  }
  const decoded = new Int32Array(length);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    decoded[index] = view.getInt32(index * 4, true);
  }
  return decoded;
}
