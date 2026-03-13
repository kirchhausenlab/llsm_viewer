export function resolveInitialHttpLaunchTargetScaleLevel({
  layerKey,
  desiredScaleLevelByLayerKey,
  finestScaleLevelByLayerKey
}: {
  layerKey: string;
  desiredScaleLevelByLayerKey: Record<string, number>;
  finestScaleLevelByLayerKey: ReadonlyMap<string, number>;
}): number | null {
  const desiredScaleLevel = desiredScaleLevelByLayerKey[layerKey];
  if (typeof desiredScaleLevel === 'number' && Number.isFinite(desiredScaleLevel)) {
    return Math.max(0, Math.floor(desiredScaleLevel));
  }
  const finestScaleLevel = finestScaleLevelByLayerKey.get(layerKey);
  return typeof finestScaleLevel === 'number' && Number.isFinite(finestScaleLevel)
    ? Math.max(0, Math.floor(finestScaleLevel))
    : null;
}

export function collectInitialHttpLaunchTrackedTargets({
  layerKeys,
  loadedScaleLevelByLayerKey,
  desiredScaleLevelByLayerKey,
  finestScaleLevelByLayerKey
}: {
  layerKeys: readonly string[];
  loadedScaleLevelByLayerKey: Readonly<Record<string, number | null | undefined>>;
  desiredScaleLevelByLayerKey: Record<string, number>;
  finestScaleLevelByLayerKey: ReadonlyMap<string, number>;
}): Map<string, number> {
  const trackedTargets = new Map<string, number>();
  for (const layerKey of layerKeys) {
    const targetScaleLevel = resolveInitialHttpLaunchTargetScaleLevel({
      layerKey,
      desiredScaleLevelByLayerKey,
      finestScaleLevelByLayerKey
    });
    if (targetScaleLevel === null) {
      continue;
    }
    const loadedScaleLevel = loadedScaleLevelByLayerKey[layerKey] ?? null;
    if (loadedScaleLevel === null || loadedScaleLevel > targetScaleLevel) {
      trackedTargets.set(layerKey, targetScaleLevel);
    }
  }
  return trackedTargets;
}
