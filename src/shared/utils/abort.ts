export function isAbortLikeError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export function createAbortError(reason?: unknown, message = 'The operation was aborted.'): Error {
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof DOMException !== 'undefined') {
    try {
      return new DOMException(message, 'AbortError');
    } catch {
      // Fall back to Error below.
    }
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function throwIfAborted(signal: AbortSignal | null | undefined, message?: string): void {
  if (!signal?.aborted) {
    return;
  }
  throw createAbortError(signal.reason, message);
}
