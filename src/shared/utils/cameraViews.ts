import type {
  CameraCoordinate,
  CameraRotation,
  SavedCameraView,
  SavedCameraViewsFile,
  SerializedSavedCameraView,
} from '../../types/camera';

export const CAMERA_VIEWS_FILE_VERSION = 1;

export function normalizeSignedAngleDegrees(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  let normalized = ((value + 180) % 360 + 360) % 360 - 180;
  if (Object.is(normalized, -0)) {
    normalized = 0;
  }
  return normalized;
}

function sanitizeCoordinateValue(value: number): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function sanitizeCameraCoordinate(input: CameraCoordinate): CameraCoordinate {
  return {
    x: sanitizeCoordinateValue(input.x),
    y: sanitizeCoordinateValue(input.y),
    z: sanitizeCoordinateValue(input.z),
  };
}

export function sanitizeCameraRotation(input: CameraRotation): CameraRotation {
  return {
    yaw: normalizeSignedAngleDegrees(input.yaw),
    pitch: normalizeSignedAngleDegrees(input.pitch),
    roll: normalizeSignedAngleDegrees(input.roll),
  };
}

export function createSavedCameraViewId(indexSeed = Date.now()): string {
  return `camera-view-${indexSeed}`;
}

export function buildAutoCameraViewLabel(
  views: SavedCameraView[],
  _mode: SavedCameraView['mode'],
  _followedVoxel?: CameraCoordinate | null,
): string {
  const count = views.length + 1;
  return `view-${count}`;
}

function serializeView(view: SavedCameraView): SerializedSavedCameraView {
  if (view.mode === 'voxel-follow') {
    return {
      label: view.label,
      mode: view.mode,
      cameraPosition: sanitizeCameraCoordinate(view.cameraPosition),
      cameraRotation: sanitizeCameraRotation(view.cameraRotation),
      followedVoxel: sanitizeCameraCoordinate(view.followedVoxel),
    };
  }
  return {
    label: view.label,
    mode: view.mode,
    cameraPosition: sanitizeCameraCoordinate(view.cameraPosition),
    cameraRotation: sanitizeCameraRotation(view.cameraRotation),
  };
}

export function serializeSavedCameraViews({
  shapeZYX,
  views,
}: {
  shapeZYX: [number, number, number];
  views: SavedCameraView[];
}): string {
  const payload: SavedCameraViewsFile = {
    version: CAMERA_VIEWS_FILE_VERSION,
    shapeZYX,
    views: views.map((view) => serializeView(view)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function parseCoordinate(value: unknown, label: string): CameraCoordinate {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object.`);
  }
  const candidate = value as Partial<Record<keyof CameraCoordinate, unknown>>;
  return sanitizeCameraCoordinate({
    x: Number(candidate.x),
    y: Number(candidate.y),
    z: Number(candidate.z),
  });
}

function parseRotation(value: unknown): CameraRotation {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Camera rotation must be an object.');
  }
  const candidate = value as Partial<Record<keyof CameraRotation, unknown>>;
  return sanitizeCameraRotation({
    yaw: Number(candidate.yaw),
    pitch: Number(candidate.pitch),
    roll: Number(candidate.roll),
  });
}

export function parseSavedCameraViewsFromJson(
  input: string,
  expectedShapeZYX: [number, number, number],
): SavedCameraView[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('Failed to parse camera views file.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Camera views file must contain an object.');
  }

  const candidate = parsed as Partial<SavedCameraViewsFile>;
  if (candidate.version !== CAMERA_VIEWS_FILE_VERSION) {
    throw new Error(`Unsupported camera views file version: ${String(candidate.version)}.`);
  }
  if (
    !Array.isArray(candidate.shapeZYX) ||
    candidate.shapeZYX.length !== 3 ||
    !candidate.shapeZYX.every((value) => isFiniteInteger(value) && value > 0)
  ) {
    throw new Error('Camera views file is missing a valid shapeZYX metadata field.');
  }
  if (
    candidate.shapeZYX[0] !== expectedShapeZYX[0] ||
    candidate.shapeZYX[1] !== expectedShapeZYX[1] ||
    candidate.shapeZYX[2] !== expectedShapeZYX[2]
  ) {
    throw new Error(
      `Camera views file shape ${candidate.shapeZYX.join('x')} does not match the current experiment shape ${expectedShapeZYX.join('x')}.`,
    );
  }
  if (!Array.isArray(candidate.views)) {
    throw new Error('Camera views file must contain a views array.');
  }

  return candidate.views.map((view, index) => {
    if (typeof view !== 'object' || view === null) {
      throw new Error(`Camera view #${index + 1} must be an object.`);
    }
    const viewCandidate = view as Partial<SerializedSavedCameraView>;
    const label = typeof viewCandidate.label === 'string' && viewCandidate.label.trim() ? viewCandidate.label.trim() : '';
    if (!label) {
      throw new Error(`Camera view #${index + 1} is missing a valid label.`);
    }
    const mode = viewCandidate.mode;
    if (mode !== 'free-roam' && mode !== 'voxel-follow') {
      throw new Error(`Camera view #${index + 1} has an unsupported mode.`);
    }

    const base = {
      id: createSavedCameraViewId(index + 1),
      label,
      mode,
      cameraPosition: parseCoordinate(viewCandidate.cameraPosition, 'Camera position'),
      cameraRotation: parseRotation(viewCandidate.cameraRotation),
    } as const;

    if (mode === 'voxel-follow') {
      return {
        ...base,
        mode,
        followedVoxel: parseCoordinate(viewCandidate.followedVoxel, 'Followed voxel'),
      };
    }

    return {
      ...base,
      mode,
    };
  });
}
