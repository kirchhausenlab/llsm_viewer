export const DEFAULT_FPS = 12;
export const DEFAULT_PLAYBACK_BUFFER_FRAMES = 3;
export const MIN_PLAYBACK_BUFFER_FRAMES = 0;
export const MAX_PLAYBACK_BUFFER_FRAMES = 30;

export function clampPlaybackBufferFrames(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PLAYBACK_BUFFER_FRAMES;
  }
  return Math.min(
    MAX_PLAYBACK_BUFFER_FRAMES,
    Math.max(MIN_PLAYBACK_BUFFER_FRAMES, Math.round(value))
  );
}
