import type { VrUiTargetType } from './vr';

export function getHudCategoryFromTarget(
  type: VrUiTargetType | null,
): 'playback' | 'channels' | 'tracks' | null {
  if (!type) {
    return null;
  }
  if (type.startsWith('playback-')) {
    return 'playback';
  }
  if (type.startsWith('channels-')) {
    return 'channels';
  }
  if (type.startsWith('tracks-')) {
    return 'tracks';
  }
  return null;
}
