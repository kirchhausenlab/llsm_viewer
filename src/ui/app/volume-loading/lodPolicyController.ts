import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type {
  LODPolicyDiagnosticsSnapshot,
  LODPolicyLayerDiagnostics,
  LODPromotionState
} from '../../../core/lodPolicyDiagnostics';
import type { PreprocessedLayerScaleManifestEntry } from '../../../shared/utils/preprocessedDataset/types';
import type { LaunchViewerOptions } from './types';
import {
  CAMERA_PROJECTED_PIXELS_AT_REFERENCE,
  CAMERA_PROJECTED_PIXELS_REFERENCE_DISTANCE,
  LOD_MIN_PROJECTED_PIXELS_PER_VOXEL,
  LOD_POLICY_THRASH_WINDOW_MS,
  LOD_POLICY_WINDOW_MS,
  LOD_PROMOTE_COOLDOWN_MS,
  LOD_THRASH_AUTO_DISABLE_PER_MINUTE,
  MAX_ADAPTIVE_DEMOTION_STEPS,
  MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER,
  applyScaleSelectionModeOverrides,
  downsampleMagnitude,
  nowMs
} from './policy';

export type LayerPolicyRuntimeState = LODPolicyLayerDiagnostics;

type CreateLodPolicyControllerOptions = {
  layerScaleLevelsByKey: Map<string, number[]>;
  layerScalesByLevelByKey: Map<string, Map<number, PreprocessedLayerScaleManifestEntry>>;
  isPerformanceMode: boolean;
  isPlaying: boolean;
  viewerCameraSample: {
    distanceToTarget: number;
    isMoving: boolean;
    capturedAtMs: number;
  } | null;
  lod0Flags: {
    adaptiveScaleSelector: boolean;
    promotionStateMachine: boolean;
  };
  layerPolicyStateByLayerKeyRef: MutableRefObject<Map<string, LayerPolicyRuntimeState>>;
  lodPolicyStartedAtMsRef: MutableRefObject<number>;
  lodPolicyThrashEventsRef: MutableRefObject<number[]>;
  adaptivePolicyDisabledRef: MutableRefObject<boolean>;
  setLodPolicyDiagnostics: Dispatch<SetStateAction<LODPolicyDiagnosticsSnapshot | null>>;
};

export function createLodPolicyController({
  layerScaleLevelsByKey,
  layerScalesByLevelByKey,
  isPerformanceMode,
  isPlaying,
  viewerCameraSample,
  lod0Flags,
  layerPolicyStateByLayerKeyRef,
  lodPolicyStartedAtMsRef,
  lodPolicyThrashEventsRef,
  adaptivePolicyDisabledRef,
  setLodPolicyDiagnostics
}: CreateLodPolicyControllerOptions) {
  const captureLodPolicyDiagnosticsSnapshot = () => {
    const states = Array.from(layerPolicyStateByLayerKeyRef.current.values()).sort((left, right) =>
      left.layerKey.localeCompare(right.layerKey)
    );
    if (states.length === 0) {
      setLodPolicyDiagnostics(null);
      return;
    }

    const now = nowMs();
    const recentThrashEvents = lodPolicyThrashEventsRef.current;
    while (recentThrashEvents.length > 0 && now - (recentThrashEvents[0] ?? 0) > LOD_POLICY_WINDOW_MS) {
      recentThrashEvents.shift();
    }
    const sessionDurationMs = Math.max(1, now - lodPolicyStartedAtMsRef.current);
    const effectiveDurationMs = Math.min(LOD_POLICY_WINDOW_MS, sessionDurationMs);
    const thrashEventsPerMinute = recentThrashEvents.length / (effectiveDurationMs / 60_000);

    setLodPolicyDiagnostics({
      capturedAt: new Date(now).toISOString(),
      layerCount: states.length,
      promotedLayers: states.filter((state) => state.promotionState === 'promoted').length,
      warmingLayers: states.filter((state) => state.promotionState === 'warming').length,
      thrashEventsPerMinute: Number.isFinite(thrashEventsPerMinute)
        ? Math.max(0, thrashEventsPerMinute)
        : 0,
      adaptivePolicyDisabled: adaptivePolicyDisabledRef.current,
      layers: states
    });
  };

  const updateLayerPolicyState = ({
    layerKey,
    desiredScaleLevel,
    activeScaleLevel,
    fallbackScaleLevel,
    readyLatencyMs,
    promotionStateOverride
  }: {
    layerKey: string;
    desiredScaleLevel: number;
    activeScaleLevel: number | null;
    fallbackScaleLevel: number | null;
    readyLatencyMs: number | null;
    promotionStateOverride?: LODPromotionState;
  }) => {
    const now = nowMs();
    const previousState = layerPolicyStateByLayerKeyRef.current.get(layerKey) ?? {
      layerKey,
      desiredScaleLevel,
      activeScaleLevel: null,
      fallbackScaleLevel: null,
      promotionState: 'idle' as LODPromotionState,
      lastPromoteMs: null,
      lastDemoteMs: null,
      promoteCount: 0,
      demoteCount: 0,
      thrashEvents: 0,
      lastReadyLatencyMs: null
    };

    let promoteCount = previousState.promoteCount;
    let demoteCount = previousState.demoteCount;
    let thrashEvents = previousState.thrashEvents;
    let lastPromoteMs = previousState.lastPromoteMs;
    let lastDemoteMs = previousState.lastDemoteMs;

    const previousActive = previousState.activeScaleLevel;
    if (
      previousActive !== null &&
      activeScaleLevel !== null &&
      previousActive !== activeScaleLevel
    ) {
      const isPromotion = activeScaleLevel < previousActive;
      const oppositeTransitionMs = isPromotion ? previousState.lastDemoteMs : previousState.lastPromoteMs;
      if (oppositeTransitionMs !== null && now - oppositeTransitionMs <= LOD_POLICY_THRASH_WINDOW_MS) {
        thrashEvents += 1;
        lodPolicyThrashEventsRef.current.push(now);
      }
      if (isPromotion) {
        promoteCount += 1;
        lastPromoteMs = now;
      } else {
        demoteCount += 1;
        lastDemoteMs = now;
      }
    }

    const promotionState: LODPromotionState =
      promotionStateOverride ??
      (activeScaleLevel === null
        ? 'warming'
        : activeScaleLevel === desiredScaleLevel
          ? 'promoted'
          : 'warming');

    const nextState: LayerPolicyRuntimeState = {
      layerKey,
      desiredScaleLevel,
      activeScaleLevel,
      fallbackScaleLevel,
      promotionState,
      lastPromoteMs,
      lastDemoteMs,
      promoteCount,
      demoteCount,
      thrashEvents,
      lastReadyLatencyMs: readyLatencyMs ?? previousState.lastReadyLatencyMs
    };
    layerPolicyStateByLayerKeyRef.current.set(layerKey, nextState);
    const nowForThrashRate = nowMs();
    const recentThrashEvents = lodPolicyThrashEventsRef.current;
    while (recentThrashEvents.length > 0 && nowForThrashRate - (recentThrashEvents[0] ?? 0) > LOD_POLICY_WINDOW_MS) {
      recentThrashEvents.shift();
    }
    const thrashEventsPerMinute = recentThrashEvents.length / (LOD_POLICY_WINDOW_MS / 60_000);
    if (
      lod0Flags.adaptiveScaleSelector &&
      !adaptivePolicyDisabledRef.current &&
      thrashEventsPerMinute >= LOD_THRASH_AUTO_DISABLE_PER_MINUTE
    ) {
      adaptivePolicyDisabledRef.current = true;
    }
    captureLodPolicyDiagnosticsSnapshot();
  };

  const resolveDesiredScaleLevel = (layerKey: string, options?: LaunchViewerOptions): number => {
    const performanceMode = Boolean(options?.performanceMode ?? isPerformanceMode);
    const levels = layerScaleLevelsByKey.get(layerKey) ?? [0];
    const finestLevel = levels[0] ?? 0;
    const previousState = layerPolicyStateByLayerKeyRef.current.get(layerKey) ?? null;
    const fallbackBaseDesired = applyScaleSelectionModeOverrides({
      levels,
      resolvedScaleLevel: finestLevel,
      isPlaying,
      isPerformanceMode: performanceMode
    });
    if (isPlaying) {
      return fallbackBaseDesired;
    }
    if (!lod0Flags.adaptiveScaleSelector || adaptivePolicyDisabledRef.current) {
      return fallbackBaseDesired;
    }

    const cameraDistance = Number.isFinite(viewerCameraSample?.distanceToTarget)
      ? Math.max(0.05, Number(viewerCameraSample?.distanceToTarget))
      : Number.NaN;
    const projectedPixelsFromCamera = Number.isFinite(cameraDistance)
      ? Math.max(
          0.2,
          Math.min(
            6,
            (CAMERA_PROJECTED_PIXELS_AT_REFERENCE * CAMERA_PROJECTED_PIXELS_REFERENCE_DISTANCE) / cameraDistance
          )
        )
      : Number.NaN;
    const baseProjectedPixelsPerVoxel = Number.isFinite(projectedPixelsFromCamera) ? projectedPixelsFromCamera : 1.4;
    const motionPenalty = viewerCameraSample?.isMoving ? 0.9 : 1;
    const projectedPixelsPerVoxel = baseProjectedPixelsPerVoxel * motionPenalty;

    let projectedChoice = finestLevel;
    for (const level of levels) {
      const scale = layerScalesByLevelByKey.get(layerKey)?.get(level) ?? null;
      const projectedPixels = projectedPixelsPerVoxel * downsampleMagnitude(scale);
      if (projectedPixels >= LOD_MIN_PROJECTED_PIXELS_PER_VOXEL) {
        projectedChoice = level;
        break;
      }
    }
    projectedChoice = applyScaleSelectionModeOverrides({
      levels,
      resolvedScaleLevel: projectedChoice,
      isPlaying,
      isPerformanceMode: performanceMode
    });
    const fallbackIndex = Math.max(
      0,
      levels.findIndex((level) => level === fallbackBaseDesired)
    );
    const fallbackDownsampleMagnitude = downsampleMagnitude(
      layerScalesByLevelByKey.get(layerKey)?.get(fallbackBaseDesired) ?? null
    );
    const maxAdaptiveDownsampleMagnitude = fallbackDownsampleMagnitude * MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER;
    let magnitudeBoundedDemotionIndex = fallbackIndex;
    for (let levelIndex = fallbackIndex; levelIndex < levels.length; levelIndex += 1) {
      const level = levels[levelIndex];
      if (level === undefined) {
        continue;
      }
      const magnitude = downsampleMagnitude(layerScalesByLevelByKey.get(layerKey)?.get(level) ?? null);
      if (magnitude <= maxAdaptiveDownsampleMagnitude + 1e-6) {
        magnitudeBoundedDemotionIndex = levelIndex;
      }
    }
    const maxAdaptiveDemotionIndex = Math.min(
      levels.length - 1,
      fallbackIndex + MAX_ADAPTIVE_DEMOTION_STEPS,
      magnitudeBoundedDemotionIndex
    );
    const projectedChoiceIndex = Math.max(
      0,
      levels.findIndex((level) => level === projectedChoice)
    );
    projectedChoice = levels[Math.min(maxAdaptiveDemotionIndex, projectedChoiceIndex)] ?? projectedChoice;

    if (!previousState || previousState.activeScaleLevel === null) {
      return projectedChoice;
    }

    const activeScaleLevel = previousState.activeScaleLevel;
    if (projectedChoice === activeScaleLevel) {
      return projectedChoice;
    }
    const activeScaleIndex = levels.findIndex((level) => level === activeScaleLevel);
    const projectedScaleIndex = levels.findIndex((level) => level === projectedChoice);
    if (activeScaleIndex >= 0 && projectedScaleIndex >= 0 && Math.abs(projectedScaleIndex - activeScaleIndex) > 1) {
      const stepDirection = projectedScaleIndex > activeScaleIndex ? 1 : -1;
      const isPromotionToFinerScale = projectedScaleIndex < activeScaleIndex;
      const shouldStepTransition = !isPromotionToFinerScale || viewerCameraSample?.isMoving;
      projectedChoice = shouldStepTransition
        ? levels[activeScaleIndex + stepDirection] ?? projectedChoice
        : projectedChoice;
    }

    const now = nowMs();
    const isPromotion = projectedChoice < activeScaleLevel;
    if (isPromotion) {
      const lastDemoteMs = previousState.lastDemoteMs ?? 0;
      if (now - lastDemoteMs < LOD_PROMOTE_COOLDOWN_MS) {
        return activeScaleLevel;
      }
    }

    return projectedChoice;
  };

  const resetLodPolicyState = () => {
    layerPolicyStateByLayerKeyRef.current.clear();
    lodPolicyThrashEventsRef.current.length = 0;
    lodPolicyStartedAtMsRef.current = nowMs();
    adaptivePolicyDisabledRef.current = false;
    setLodPolicyDiagnostics(null);
  };

  return {
    captureLodPolicyDiagnosticsSnapshot,
    updateLayerPolicyState,
    resolveDesiredScaleLevel,
    resetLodPolicyState
  };
}
