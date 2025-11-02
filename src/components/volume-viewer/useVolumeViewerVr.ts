import { MutableRefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';

import type {
  MovementState,
  PointerState,
  TrackLineResource,
  VolumeResources,
  VolumeViewerVrProps,
} from '../VolumeViewer.types';
import type {
  ControllerEntry,
  RaycasterLike,
  VrChannelsHud,
  VrChannelsState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksState,
} from './vr';
import {
  VR_CHANNELS_CAMERA_ANCHOR_OFFSET,
  VR_CHANNELS_PANEL_WIDTH,
  VR_CHANNELS_VERTICAL_OFFSET,
  VR_HUD_FRONT_MARGIN,
  VR_HUD_LATERAL_MARGIN,
  VR_HUD_MIN_HEIGHT,
  VR_HUD_PLACEMENT_EPSILON,
  VR_PITCH_HANDLE_FORWARD_OFFSET,
  VR_PLAYBACK_CAMERA_ANCHOR_OFFSET,
  VR_PLAYBACK_PANEL_WIDTH,
  VR_PLAYBACK_VERTICAL_OFFSET,
  VR_ROTATION_HANDLE_OFFSET,
  VR_ROTATION_HANDLE_RADIUS,
  VR_SCALE_HANDLE_OFFSET,
  VR_SCALE_HANDLE_RADIUS,
  VR_TRACKS_CAMERA_ANCHOR_OFFSET,
  VR_TRACKS_PANEL_WIDTH,
  VR_TRACKS_VERTICAL_OFFSET,
  VR_TRANSLATION_HANDLE_OFFSET,
  VR_TRANSLATION_HANDLE_RADIUS,
  VR_VOLUME_MAX_SCALE,
  VR_VOLUME_MIN_SCALE,
} from './vr';

export type PlaybackState = {
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  timeIndex: number;
  totalTimepoints: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  onFpsChange: (value: number) => void;
  passthroughSupported: boolean;
  preferredSessionMode: 'immersive-vr' | 'immersive-ar';
  currentSessionMode: 'immersive-vr' | 'immersive-ar' | null;
};

export type PlaybackLoopState = { lastTimestamp: number | null; accumulator: number };

export type VrHoverState = {
  play: boolean;
  playbackSlider: boolean;
  playbackSliderActive: boolean;
  fpsSlider: boolean;
  fpsSliderActive: boolean;
  resetVolume: boolean;
  resetHud: boolean;
  exit: boolean;
  mode: boolean;
};

export type UseVolumeViewerVrParams = {
  vrProps?: VolumeViewerVrProps | null;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef: MutableRefObject<THREE.Vector3>;
  volumeNormalizationScaleRef: MutableRefObject<number>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeRootRotatedCenterTempRef: MutableRefObject<THREE.Vector3>;
  volumeStepScaleRef: MutableRefObject<number>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  timeIndexRef: MutableRefObject<number>;
  movementStateRef: MutableRefObject<MovementState>;
  pointerStateRef: MutableRefObject<PointerState | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  trackFollowOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  hasActive3DLayerRef: MutableRefObject<boolean>;
  playbackStateDefaults: {
    isPlaying: boolean;
    playbackDisabled: boolean;
    playbackLabel: string;
    fps: number;
    timeIndex: number;
    totalTimepoints: number;
    onTogglePlayback: () => void;
    onTimeIndexChange: (nextIndex: number) => void;
    onFpsChange: (value: number) => void;
    passthroughSupported: boolean;
  };
};

export type UseVolumeViewerVrResult = {
  onRegisterVrSession: (
    handlers: Parameters<NonNullable<VolumeViewerVrProps['onRegisterVrSession']>>[0]
  ) => void;
  onVrSessionStarted: () => void;
  onVrSessionEnded: () => void;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrHudPlaneRef: MutableRefObject<THREE.Plane>;
  vrHudPlanePointRef: MutableRefObject<THREE.Vector3>;
  vrPlaybackHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrChannelsHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrTracksHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrHudOffsetTempRef: MutableRefObject<THREE.Vector3>;
  vrHudIntersectionRef: MutableRefObject<THREE.Vector3>;
  vrChannelsLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrTracksLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrHudForwardRef: MutableRefObject<THREE.Vector3>;
  vrHudYawEulerRef: MutableRefObject<THREE.Euler>;
  vrHudYawQuaternionRef: MutableRefObject<THREE.Quaternion>;
  vrHudYawVectorRef: MutableRefObject<THREE.Vector3>;
  vrHudPitchVectorRef: MutableRefObject<THREE.Vector3>;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeYawHandlesRef: MutableRefObject<THREE.Mesh[]>;
  vrVolumePitchHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrHandleLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleQuaternionTempRef: MutableRefObject<THREE.Quaternion>;
  vrHandleQuaternionTemp2Ref: MutableRefObject<THREE.Quaternion>;
  sliderLocalPointRef: MutableRefObject<THREE.Vector3>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackLoopRef: MutableRefObject<PlaybackLoopState>;
  vrHoverStateRef: MutableRefObject<VrHoverState>;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  raycasterRef: MutableRefObject<RaycasterLike | null>;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
  preVrCameraStateRef: MutableRefObject<
    | {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        target: THREE.Vector3;
      }
    | null
  >;
  xrPreferredSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar'>;
  xrCurrentSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPendingModeSwitchRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPassthroughSupportedRef: MutableRefObject<boolean>;
  xrFoveationAppliedRef: MutableRefObject<boolean>;
  xrPreviousFoveationRef: MutableRefObject<number | undefined>;
  updateVolumeHandles: () => void;
  applyVolumeYawPitch: (yaw: number, pitch: number) => void;
  updateHudGroupFromPlacement: (
    hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
    placement: VrHudPlacement | null,
  ) => void;
  setHudPlacement: (
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
    position: THREE.Vector3,
    yaw: number,
    pitch: number,
  ) => void;
  computeVolumeHudFrame: () => {
    center: THREE.Vector3;
    forward: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
    yaw: number;
    pitch: number;
  } | null;
  resetVrPlaybackHudPlacement: () => void;
  resetVrChannelsHudPlacement: () => void;
  resetVrTracksHudPlacement: () => void;
  applyVolumeRootTransform: (
    dimensions: { width: number; height: number; depth: number } | null,
  ) => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
};

export function useVolumeViewerVr({
  vrProps,
  rendererRef,
  cameraRef,
  sceneRef,
  volumeRootGroupRef,
  currentDimensionsRef,
  volumeRootBaseOffsetRef,
  volumeRootCenterOffsetRef,
  volumeRootCenterUnscaledRef,
  volumeRootHalfExtentsRef,
  volumeNormalizationScaleRef,
  volumeUserScaleRef,
  volumeRootRotatedCenterTempRef,
  volumeStepScaleRef,
  volumeYawRef,
  volumePitchRef,
  trackGroupRef,
  resourcesRef,
  timeIndexRef,
  movementStateRef,
  pointerStateRef,
  trackLinesRef,
  trackFollowOffsetRef,
  hasActive3DLayerRef,
  playbackStateDefaults,
}: UseVolumeViewerVrParams): UseVolumeViewerVrResult {
  const controllersRef = useRef<ControllerEntry[]>([]);
  const raycasterRef = useRef<RaycasterLike | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const preVrCameraStateRef = useRef<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    target: THREE.Vector3;
  } | null>(null);
  const xrPreferredSessionModeRef = useRef<'immersive-vr' | 'immersive-ar'>('immersive-vr');
  const xrCurrentSessionModeRef = useRef<'immersive-vr' | 'immersive-ar' | null>(null);
  const xrPendingModeSwitchRef = useRef<'immersive-vr' | 'immersive-ar' | null>(null);
  const xrPassthroughSupportedRef = useRef(playbackStateDefaults.passthroughSupported);
  const xrFoveationAppliedRef = useRef(false);
  const xrPreviousFoveationRef = useRef<number | undefined>(undefined);

  const vrPlaybackHudRef = useRef<VrPlaybackHud | null>(null);
  const vrChannelsHudRef = useRef<VrChannelsHud | null>(null);
  const vrTracksHudRef = useRef<VrTracksHud | null>(null);
  const vrPlaybackHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrChannelsHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrTracksHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrHudPlaneRef = useRef(new THREE.Plane());
  const vrHudPlanePointRef = useRef(new THREE.Vector3());
  const vrPlaybackHudDragTargetRef = useRef(new THREE.Vector3());
  const vrChannelsHudDragTargetRef = useRef(new THREE.Vector3());
  const vrTracksHudDragTargetRef = useRef(new THREE.Vector3());
  const vrHudOffsetTempRef = useRef(new THREE.Vector3());
  const vrHudIntersectionRef = useRef(new THREE.Vector3());
  const vrChannelsLocalPointRef = useRef(new THREE.Vector3());
  const vrTracksLocalPointRef = useRef(new THREE.Vector3());
  const vrHudForwardRef = useRef(new THREE.Vector3(0, 0, 1));
  const vrHudYawEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const vrHudYawQuaternionRef = useRef(new THREE.Quaternion());
  const vrHudYawVectorRef = useRef(new THREE.Vector3());
  const vrHudPitchVectorRef = useRef(new THREE.Vector3());
  const vrTranslationHandleRef = useRef<THREE.Mesh | null>(null);
  const vrVolumeScaleHandleRef = useRef<THREE.Mesh | null>(null);
  const vrVolumeYawHandlesRef = useRef<THREE.Mesh[]>([]);
  const vrVolumePitchHandleRef = useRef<THREE.Mesh | null>(null);
  const vrHandleLocalPointRef = useRef(new THREE.Vector3());
  const vrHandleWorldPointRef = useRef(new THREE.Vector3());
  const vrHandleSecondaryPointRef = useRef(new THREE.Vector3());
  const vrHandleQuaternionTempRef = useRef(new THREE.Quaternion());
  const vrHandleQuaternionTemp2Ref = useRef(new THREE.Quaternion());
  const sliderLocalPointRef = useRef(new THREE.Vector3());
  const playbackStateRef = useRef<PlaybackState>({
    isPlaying: playbackStateDefaults.isPlaying,
    playbackDisabled: playbackStateDefaults.playbackDisabled,
    playbackLabel: playbackStateDefaults.playbackLabel,
    fps: playbackStateDefaults.fps,
    timeIndex: playbackStateDefaults.timeIndex,
    totalTimepoints: playbackStateDefaults.totalTimepoints,
    onTogglePlayback: playbackStateDefaults.onTogglePlayback,
    onTimeIndexChange: playbackStateDefaults.onTimeIndexChange,
    onFpsChange: playbackStateDefaults.onFpsChange,
    passthroughSupported: playbackStateDefaults.passthroughSupported,
    preferredSessionMode: 'immersive-vr',
    currentSessionMode: null,
  });
  const playbackLoopRef = useRef<PlaybackLoopState>({ lastTimestamp: null, accumulator: 0 });
  const vrHoverStateRef = useRef<VrHoverState>({
    play: false,
    playbackSlider: false,
    playbackSliderActive: false,
    fpsSlider: false,
    fpsSliderActive: false,
    resetVolume: false,
    resetHud: false,
    exit: false,
    mode: false,
  });
  const vrChannelsStateRef = useRef<VrChannelsState>({ channels: [], activeChannelId: null });
  const vrTracksStateRef = useRef<VrTracksState>({ channels: [], activeChannelId: null });

  const onRegisterVrSession = useCallback<UseVolumeViewerVrResult['onRegisterVrSession']>(
    (handlers) => {
      vrProps?.onRegisterVrSession?.(handlers ?? null);
    },
    [vrProps]
  );

  const onVrSessionStarted = useCallback(() => {
    vrProps?.onVrSessionStarted?.();
  }, [vrProps]);

  const onVrSessionEnded = useCallback(() => {
    vrProps?.onVrSessionEnded?.();
  }, [vrProps]);

  const updateVolumeHandles = useCallback(() => {
    const translationHandle = vrTranslationHandleRef.current;
    const scaleHandle = vrVolumeScaleHandleRef.current;
    const yawHandles = vrVolumeYawHandlesRef.current;
    const pitchHandle = vrVolumePitchHandleRef.current;
    if (!translationHandle && !scaleHandle && yawHandles.length === 0 && !pitchHandle) {
      return;
    }

    const renderer = rendererRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    const dimensions = currentDimensionsRef.current;
    const has3D = hasActive3DLayerRef.current;
    const presenting = renderer?.xr?.isPresenting ?? false;

    const hideHandles = () => {
      if (translationHandle) {
        translationHandle.visible = false;
      }
      if (scaleHandle) {
        scaleHandle.visible = false;
      }
      yawHandles.forEach((handle) => {
        handle.visible = false;
      });
      if (pitchHandle) {
        pitchHandle.visible = false;
      }
    };

    if (!presenting || !has3D || !dimensions || !volumeRootGroup || dimensions.depth <= 1) {
      hideHandles();
      return;
    }

    const { width, height, depth } = dimensions;
    const maxDimension = Math.max(width, height, depth);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
      hideHandles();
      return;
    }

    const scale = 1 / maxDimension;
    const userScale = volumeUserScaleRef.current;
    const totalScale = scale * userScale;
    const safeScale = totalScale > 1e-6 ? totalScale : 1e-6;
    const centerUnscaled = volumeRootCenterUnscaledRef.current;
    const halfExtents = volumeRootHalfExtentsRef.current;
    const translationLocal = vrHandleLocalPointRef.current;

    translationLocal.set(
      centerUnscaled.x,
      centerUnscaled.y + (halfExtents.y + VR_TRANSLATION_HANDLE_OFFSET) / scale,
      centerUnscaled.z,
    );
    if (translationHandle) {
      translationHandle.position.copy(translationLocal);
      translationHandle.scale.setScalar(VR_TRANSLATION_HANDLE_RADIUS / safeScale);
      translationHandle.visible = true;
    }

    const lateralOffset = (halfExtents.x + VR_ROTATION_HANDLE_OFFSET) / scale;
    const verticalOffset = -(halfExtents.y + VR_ROTATION_HANDLE_OFFSET) / scale;
    const forwardOffset = (halfExtents.z + VR_PITCH_HANDLE_FORWARD_OFFSET) / scale;
    const handleScale = VR_ROTATION_HANDLE_RADIUS / safeScale;

    yawHandles.forEach((handle, index) => {
      if (!handle) {
        return;
      }
      const direction = index === 0 ? 1 : -1;
      handle.position.set(
        centerUnscaled.x + direction * lateralOffset,
        centerUnscaled.y,
        centerUnscaled.z,
      );
      handle.scale.setScalar(handleScale);
      handle.visible = true;
    });

    if (pitchHandle) {
      pitchHandle.position.set(
        centerUnscaled.x,
        centerUnscaled.y + verticalOffset,
        centerUnscaled.z - forwardOffset,
      );
      pitchHandle.scale.setScalar(handleScale);
      pitchHandle.visible = true;
    }

    if (scaleHandle) {
      scaleHandle.position.set(
        centerUnscaled.x + (halfExtents.x + VR_SCALE_HANDLE_OFFSET) / scale,
        centerUnscaled.y + (halfExtents.y + VR_SCALE_HANDLE_OFFSET) / scale,
        centerUnscaled.z,
      );
      scaleHandle.scale.setScalar(VR_SCALE_HANDLE_RADIUS / safeScale);
      scaleHandle.visible = true;
    }
  }, [
    currentDimensionsRef,
    hasActive3DLayerRef,
    rendererRef,
    volumeRootCenterUnscaledRef,
    volumeRootGroupRef,
    volumeRootHalfExtentsRef,
    volumeUserScaleRef,
    vrHandleLocalPointRef,
    vrTranslationHandleRef,
    vrVolumePitchHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
  ]);

  const applyVolumeStepScaleToResources = useCallback(
    (stepScale: number) => {
      volumeStepScaleRef.current = stepScale;
      for (const resource of resourcesRef.current.values()) {
        if (resource.mode !== '3d') {
          continue;
        }
        const material = resource.mesh.material;
        const materialList = Array.isArray(material) ? material : [material];
        for (const entry of materialList) {
          const shaderMaterial = entry as THREE.ShaderMaterial | undefined;
          const uniforms = shaderMaterial?.uniforms as
            | Record<string, { value: unknown }>
            | undefined;
          if (uniforms && 'u_stepScale' in uniforms) {
            const stepUniform = uniforms.u_stepScale as { value: number };
            stepUniform.value = stepScale;
          }
        }
      }
    },
    [resourcesRef, volumeStepScaleRef],
  );

  const applyVolumeYawPitch = useCallback(
    (yaw: number, pitch: number) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }
      volumeYawRef.current = yaw;
      volumePitchRef.current = pitch;
      const euler = vrHudYawEulerRef.current;
      const quaternion = vrHandleQuaternionTempRef.current;
      euler.set(pitch, yaw, 0, 'YXZ');
      quaternion.setFromEuler(euler);
      volumeRootGroup.quaternion.copy(quaternion);
      const baseOffset = volumeRootBaseOffsetRef.current;
      const centerOffset = volumeRootCenterOffsetRef.current;
      const rotatedCenter = volumeRootRotatedCenterTempRef.current;
      const userScale = volumeUserScaleRef.current;
      rotatedCenter
        .copy(centerOffset)
        .multiplyScalar(userScale)
        .applyQuaternion(volumeRootGroup.quaternion);
      volumeRootGroup.position.set(
        baseOffset.x - rotatedCenter.x,
        baseOffset.y - rotatedCenter.y,
        baseOffset.z - rotatedCenter.z,
      );
      volumeRootGroup.updateMatrixWorld(true);
      updateVolumeHandles();
    },
    [
      updateVolumeHandles,
      volumePitchRef,
      volumeRootBaseOffsetRef,
      volumeRootCenterOffsetRef,
      volumeRootGroupRef,
      volumeRootRotatedCenterTempRef,
      volumeUserScaleRef,
      volumeYawRef,
      vrHandleQuaternionTempRef,
      vrHudYawEulerRef,
    ],
  );

  const constrainHudPlacementPosition = useCallback((target: THREE.Vector3) => {
    target.y = Math.max(target.y, VR_HUD_MIN_HEIGHT);
  }, []);

  const getHudQuaternionFromAngles = useCallback((yaw: number, pitch: number) => {
    const yawQuaternion = vrHudYawQuaternionRef.current;
    const yawEuler = vrHudYawEulerRef.current;
    yawEuler.set(pitch, yaw, 0, 'YXZ');
    yawQuaternion.setFromEuler(yawEuler);
    return yawQuaternion;
  }, []);

  const updateHudGroupFromPlacement = useCallback(
    (
      hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
      placement: VrHudPlacement | null,
    ) => {
      if (!hud || !placement) {
        return;
      }
      const positionChanged =
        hud.cacheDirty ||
        Math.abs(hud.cachedPosition.x - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(hud.cachedPosition.y - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(hud.cachedPosition.z - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      const yawChanged =
        hud.cacheDirty || Math.abs(hud.cachedYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      const pitchChanged =
        hud.cacheDirty || Math.abs(hud.cachedPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      if (!positionChanged && !yawChanged && !pitchChanged) {
        return;
      }
      hud.group.position.copy(placement.position);
      if (yawChanged || pitchChanged || hud.cacheDirty) {
        const quaternion = getHudQuaternionFromAngles(placement.yaw + Math.PI, placement.pitch);
        hud.group.quaternion.copy(quaternion);
      }
      hud.group.updateMatrixWorld(true);
      hud.cachedPosition.copy(placement.position);
      hud.cachedYaw = placement.yaw;
      hud.cachedPitch = placement.pitch;
      hud.cacheDirty = false;
    },
    [getHudQuaternionFromAngles],
  );

  const setHudPlacement = useCallback(
    (
      placementRef: MutableRefObject<VrHudPlacement | null>,
      dragTargetRef: MutableRefObject<THREE.Vector3>,
      hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
      position: THREE.Vector3,
      yaw: number,
      pitch: number,
    ) => {
      const placement =
        placementRef.current ?? ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      const prevYaw = placement.yaw;
      const prevPitch = placement.pitch;
      placement.position.copy(position);
      constrainHudPlacementPosition(placement.position);
      placement.yaw = yaw;
      placement.pitch = pitch;
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      placementRef.current = placement;
      dragTargetRef.current.copy(placement.position);
      const hud = hudRef.current;
      if (hud && (positionChanged || yawChanged || pitchChanged)) {
        hud.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hud, placement);
    },
    [constrainHudPlacementPosition, updateHudGroupFromPlacement],
  );

  const computeVolumeHudFrame = useCallback(() => {
    const baseOffset = volumeRootBaseOffsetRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    const halfExtents = volumeRootHalfExtentsRef.current;
    if (!volumeRootGroup || baseOffset.lengthSq() <= 1e-6) {
      return null;
    }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(volumeRootGroup.quaternion);
    if (forward.lengthSq() <= 1e-8) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(volumeRootGroup.quaternion);
    if (right.lengthSq() <= 1e-8) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }
    const up = new THREE.Vector3(0, 1, 0);
    const frontDistance = (halfExtents ? halfExtents.z : 0) + VR_HUD_FRONT_MARGIN;
    const center = new THREE.Vector3().copy(baseOffset).addScaledVector(forward, -frontDistance);
    const horizontalForward = new THREE.Vector3(forward.x, 0, forward.z);
    if (horizontalForward.lengthSq() <= 1e-8) {
      horizontalForward.set(0, 0, -1);
    } else {
      horizontalForward.normalize();
    }
    const yaw = Math.atan2(horizontalForward.x, horizontalForward.z);
    const pitch = 0;
    return { center, forward, right, up, yaw, pitch };
  }, [volumeRootBaseOffsetRef, volumeRootGroupRef, volumeRootHalfExtentsRef]);

  const resetHudPlacement = useCallback(
    (
      placementRef: MutableRefObject<VrHudPlacement | null>,
      dragTargetRef: MutableRefObject<THREE.Vector3>,
      hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
      fallbackOffset: THREE.Vector3,
      verticalOffset: number,
      lateralOffset: number,
    ) => {
      const camera = cameraRef.current;
      const hud = hudRef.current;
      if (!camera || !hud) {
        return;
      }
      const frame = computeVolumeHudFrame();
      const target = vrHudOffsetTempRef.current;
      if (frame) {
        target
          .copy(frame.center)
          .addScaledVector(frame.right, lateralOffset)
          .addScaledVector(frame.up, verticalOffset);
        setHudPlacement(placementRef, dragTargetRef, hudRef, target, frame.yaw, frame.pitch);
        return;
      }
      target.copy(fallbackOffset);
      const q = camera.quaternion;
      const sinYaw = 2 * (q.w * q.y + q.x * q.z);
      const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
      const yaw = Math.atan2(sinYaw, cosYaw);
      const cosValue = Math.cos(yaw);
      const sinValue = Math.sin(yaw);
      const rotatedX = target.x * cosValue - target.z * sinValue;
      const rotatedZ = target.x * sinValue + target.z * cosValue;
      target.set(rotatedX, target.y, rotatedZ);
      target.add(camera.position);
      setHudPlacement(placementRef, dragTargetRef, hudRef, target, yaw, 0);
    },
    [cameraRef, computeVolumeHudFrame, setHudPlacement],
  );

  const resetVrPlaybackHudPlacement = useCallback(() => {
    const playbackVerticalOffset = VR_PLAYBACK_VERTICAL_OFFSET;
    resetHudPlacement(
      vrPlaybackHudPlacementRef,
      vrPlaybackHudDragTargetRef,
      vrPlaybackHudRef,
      VR_PLAYBACK_CAMERA_ANCHOR_OFFSET,
      playbackVerticalOffset,
      0,
    );
  }, [resetHudPlacement, vrPlaybackHudDragTargetRef, vrPlaybackHudPlacementRef, vrPlaybackHudRef]);

  const resetVrChannelsHudPlacement = useCallback(() => {
    const lateralDistance =
      VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_CHANNELS_PANEL_WIDTH / 2;
    resetHudPlacement(
      vrChannelsHudPlacementRef,
      vrChannelsHudDragTargetRef,
      vrChannelsHudRef,
      VR_CHANNELS_CAMERA_ANCHOR_OFFSET,
      VR_CHANNELS_VERTICAL_OFFSET,
      lateralDistance,
    );
  }, [resetHudPlacement, vrChannelsHudDragTargetRef, vrChannelsHudPlacementRef, vrChannelsHudRef]);

  const resetVrTracksHudPlacement = useCallback(() => {
    const lateralDistance =
      -(VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_TRACKS_PANEL_WIDTH / 2);
    resetHudPlacement(
      vrTracksHudPlacementRef,
      vrTracksHudDragTargetRef,
      vrTracksHudRef,
      VR_TRACKS_CAMERA_ANCHOR_OFFSET,
      VR_TRACKS_VERTICAL_OFFSET,
      lateralDistance,
    );
  }, [resetHudPlacement, vrTracksHudDragTargetRef, vrTracksHudPlacementRef, vrTracksHudRef]);

  const applyVolumeRootTransform = useCallback(
    (dimensions: { width: number; height: number; depth: number } | null) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }

      if (!dimensions) {
        volumeRootCenterOffsetRef.current.set(0, 0, 0);
        volumeRootCenterUnscaledRef.current.set(0, 0, 0);
        volumeRootHalfExtentsRef.current.set(0, 0, 0);
        volumeNormalizationScaleRef.current = 1;
        volumeUserScaleRef.current = 1;
        volumeRootGroup.scale.set(1, 1, 1);
        volumeYawRef.current = 0;
        volumePitchRef.current = 0;
        applyVolumeYawPitch(0, 0);
        return;
      }

      const { width, height, depth } = dimensions;
      const maxDimension = Math.max(width, height, depth);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
        volumeRootCenterOffsetRef.current.set(0, 0, 0);
        volumeRootCenterUnscaledRef.current.set(0, 0, 0);
        volumeRootHalfExtentsRef.current.set(0, 0, 0);
        volumeNormalizationScaleRef.current = 1;
        volumeUserScaleRef.current = 1;
        volumeRootGroup.scale.set(1, 1, 1);
        volumeYawRef.current = 0;
        volumePitchRef.current = 0;
        applyVolumeYawPitch(0, 0);
        return;
      }

      const scale = 1 / maxDimension;
      volumeNormalizationScaleRef.current = scale;
      const clampedUserScale = Math.min(
        VR_VOLUME_MAX_SCALE,
        Math.max(VR_VOLUME_MIN_SCALE, volumeUserScaleRef.current),
      );
      volumeUserScaleRef.current = clampedUserScale;
      const centerUnscaled = volumeRootCenterUnscaledRef.current;
      centerUnscaled.set(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5);
      const centerOffset = volumeRootCenterOffsetRef.current;
      centerOffset.copy(centerUnscaled).multiplyScalar(scale);
      const halfExtents = volumeRootHalfExtentsRef.current;
      halfExtents.set(
        ((width - 1) / 2) * scale,
        ((height - 1) / 2) * scale,
        ((depth - 1) / 2) * scale,
      );

      volumeRootGroup.scale.setScalar(scale * clampedUserScale);
      applyVolumeYawPitch(volumeYawRef.current, volumePitchRef.current);
    },
    [
      applyVolumeYawPitch,
      volumeNormalizationScaleRef,
      volumePitchRef,
      volumeRootCenterOffsetRef,
      volumeRootCenterUnscaledRef,
      volumeRootGroupRef,
      volumeRootHalfExtentsRef,
      volumeUserScaleRef,
      volumeYawRef,
    ],
  );

  return {
    onRegisterVrSession,
    onVrSessionStarted,
    onVrSessionEnded,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    vrHudPlaneRef,
    vrHudPlanePointRef,
    vrPlaybackHudDragTargetRef,
    vrChannelsHudDragTargetRef,
    vrTracksHudDragTargetRef,
    vrHudOffsetTempRef,
    vrHudIntersectionRef,
    vrChannelsLocalPointRef,
    vrTracksLocalPointRef,
    vrHudForwardRef,
    vrHudYawEulerRef,
    vrHudYawQuaternionRef,
    vrHudYawVectorRef,
    vrHudPitchVectorRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
    vrHandleLocalPointRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    vrHandleQuaternionTempRef,
    vrHandleQuaternionTemp2Ref,
    sliderLocalPointRef,
    playbackStateRef,
    playbackLoopRef,
    vrHoverStateRef,
    vrChannelsStateRef,
    vrTracksStateRef,
    controllersRef,
    raycasterRef,
    xrSessionRef,
    sessionCleanupRef,
    preVrCameraStateRef,
    xrPreferredSessionModeRef,
    xrCurrentSessionModeRef,
    xrPendingModeSwitchRef,
    xrPassthroughSupportedRef,
    xrFoveationAppliedRef,
    xrPreviousFoveationRef,
    updateVolumeHandles,
    applyVolumeYawPitch,
    updateHudGroupFromPlacement,
    setHudPlacement,
    computeVolumeHudFrame,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
  };
}
