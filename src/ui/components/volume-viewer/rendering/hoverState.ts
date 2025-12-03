import * as THREE from 'three';

export const MIP_MAX_STEPS = 887;
export const MIP_REFINEMENT_STEPS = 4;
export const HOVER_HIGHLIGHT_RADIUS_VOXELS = 1.5;
export const HOVER_PULSE_SPEED = 0.009;

export const hoverPointerVector = new THREE.Vector2();
export const hoverInverseMatrix = new THREE.Matrix4();
export const hoverStart = new THREE.Vector3();
export const hoverEnd = new THREE.Vector3();
export const hoverStep = new THREE.Vector3();
export const hoverSample = new THREE.Vector3();
export const hoverRefineStep = new THREE.Vector3();
export const hoverMaxPosition = new THREE.Vector3();
export const hoverStartNormalized = new THREE.Vector3();
export const hoverVolumeSize = new THREE.Vector3();
export const hoverEntryPoint = new THREE.Vector3();
export const hoverExitPoint = new THREE.Vector3();
export const hoverEntryOffset = new THREE.Vector3();
export const hoverRayDirection = new THREE.Vector3();
export const hoverLocalRay = new THREE.Ray();
export const hoverExitRay = new THREE.Ray();
export const hoverBoundingBox = new THREE.Box3();
export const hoverLayerMatrix = new THREE.Matrix4();
export const hoverLayerOffsetMatrix = new THREE.Matrix4();
