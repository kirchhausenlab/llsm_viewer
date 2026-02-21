import { RENDER_STYLE_SLICED, type RenderStyle } from '../../../state/layerSettings';

export type ViewerQualityProfile = 'inspect' | 'interactive' | 'playback';

type ResolvePreferredScaleLevelOptions = {
  knownScaleLevels?: readonly number[] | null;
  configuredScaleLevel?: number | null;
  qualityProfile: ViewerQualityProfile;
  renderStyle?: RenderStyle | null;
};

const DEFAULT_DESIRED_SCALE_BY_PROFILE: Record<ViewerQualityProfile, number> = {
  inspect: 0,
  interactive: 0,
  playback: 1
};

function normalizeScaleLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function normalizeKnownScaleLevels(levels?: readonly number[] | null): number[] {
  if (!levels || levels.length === 0) {
    return [0];
  }
  const normalized = Array.from(
    new Set(levels.filter((level) => Number.isFinite(level)).map((level) => normalizeScaleLevel(level as number)))
  ).sort((left, right) => left - right);
  return normalized.length > 0 ? normalized : [0];
}

export function resolvePreferredScaleLevel({
  knownScaleLevels,
  configuredScaleLevel,
  qualityProfile,
  renderStyle
}: ResolvePreferredScaleLevelOptions): number {
  if (Number.isFinite(configuredScaleLevel)) {
    return normalizeScaleLevel(configuredScaleLevel as number);
  }

  const desiredProfileLevel = DEFAULT_DESIRED_SCALE_BY_PROFILE[qualityProfile];
  const desired = renderStyle === RENDER_STYLE_SLICED ? 0 : desiredProfileLevel;
  if (!knownScaleLevels || knownScaleLevels.length === 0) {
    return desired;
  }

  const levels = normalizeKnownScaleLevels(knownScaleLevels);
  let resolved = levels[0] ?? 0;
  for (const level of levels) {
    if (level <= desired) {
      resolved = level;
    }
  }
  return resolved;
}

export function buildCandidateScaleLevels({
  knownScaleLevels,
  preferredScaleLevel
}: {
  knownScaleLevels?: readonly number[] | null;
  preferredScaleLevel: number;
}): number[] {
  const levels = normalizeKnownScaleLevels(knownScaleLevels);
  const preferred = normalizeScaleLevel(preferredScaleLevel);
  const candidates = levels.filter((level) => level >= preferred);
  if (candidates.length > 0) {
    return candidates;
  }
  return [preferred];
}
