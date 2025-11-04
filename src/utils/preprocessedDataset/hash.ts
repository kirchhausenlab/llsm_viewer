import { ensureArrayBuffer } from '../buffer';

export async function computeSha256Hex(data: Uint8Array): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) {
    throw new Error('Web Crypto API is not available in this environment.');
  }
  const digest = await subtle.digest('SHA-256', ensureArrayBuffer(data));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
