import assert from 'node:assert/strict';
import * as THREE from 'three';

import { VolumeRenderShaderVariants } from '../src/shaders/volumeRenderShader.ts';
import { assignVolumeMeshOnBeforeRender } from '../src/components/viewers/volume-viewer/useVolumeResources.ts';

console.log('Starting volume stereo rendering tests');

function assertMatrixClose(actual: THREE.Matrix4, expected: THREE.Matrix4, message: string): void {
  const actualElements = actual.elements;
  const expectedElements = expected.elements;
  for (let index = 0; index < actualElements.length; index += 1) {
    const delta = Math.abs(actualElements[index] - expectedElements[index]);
    assert.ok(delta <= 1e-9, `${message}: element ${index} differed by ${delta}`);
  }
}

(() => {
  const perspectiveShader = VolumeRenderShaderVariants.mip.fragmentShader;
  assert.match(
    perspectiveShader,
    /vec3 rayOrigin = u_cameraPos;\s*vec3 rawDir = farpos - rayOrigin;/s,
  );
  assert.doesNotMatch(
    perspectiveShader,
    /#define VOLUME_CAMERA_ORTHOGRAPHIC/,
  );
})();

(() => {
  const uniforms = {
    u_cameraPos: { value: new THREE.Vector3() },
    u_modelViewProjectionMatrix: { value: new THREE.Matrix4() },
    u_modelViewMatrixVolume: { value: new THREE.Matrix4() },
    u_cameraNearFar: { value: new THREE.Vector2() },
  };
  const material = new THREE.ShaderMaterial({ uniforms });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(2, 3, -4);
  mesh.rotation.set(0.2, -0.4, 0.1);
  mesh.scale.set(1.5, 0.75, 2);
  mesh.updateMatrixWorld(true);
  assignVolumeMeshOnBeforeRender(mesh);

  const leftEyeCamera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
  leftEyeCamera.position.set(-0.032, 1.6, 2.5);
  leftEyeCamera.lookAt(new THREE.Vector3(0, 0.5, -1));
  leftEyeCamera.updateMatrixWorld(true);

  const rightEyeCamera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
  rightEyeCamera.position.set(0.032, 1.6, 2.5);
  rightEyeCamera.lookAt(new THREE.Vector3(0, 0.5, -1));
  rightEyeCamera.updateMatrixWorld(true);

  mesh.modelViewMatrix.makeTranslation(100, 200, 300);
  mesh.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), leftEyeCamera, mesh.geometry, material, null);

  const expectedLeftModelView = new THREE.Matrix4().multiplyMatrices(
    leftEyeCamera.matrixWorldInverse,
    mesh.matrixWorld,
  );
  const expectedLeftMvp = new THREE.Matrix4().multiplyMatrices(
    leftEyeCamera.projectionMatrix,
    expectedLeftModelView,
  );
  assertMatrixClose(uniforms.u_modelViewMatrixVolume.value, expectedLeftModelView, 'left-eye model-view');
  assertMatrixClose(uniforms.u_modelViewProjectionMatrix.value, expectedLeftMvp, 'left-eye MVP');
  assert.deepEqual(uniforms.u_cameraNearFar.value.toArray(), [0.05, 50]);

  mesh.modelViewMatrix.copy(expectedLeftModelView);
  mesh.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), rightEyeCamera, mesh.geometry, material, null);

  const expectedRightModelView = new THREE.Matrix4().multiplyMatrices(
    rightEyeCamera.matrixWorldInverse,
    mesh.matrixWorld,
  );
  const expectedRightMvp = new THREE.Matrix4().multiplyMatrices(
    rightEyeCamera.projectionMatrix,
    expectedRightModelView,
  );
  assertMatrixClose(uniforms.u_modelViewMatrixVolume.value, expectedRightModelView, 'right-eye model-view');
  assertMatrixClose(uniforms.u_modelViewProjectionMatrix.value, expectedRightMvp, 'right-eye MVP');
})();

console.log('volume stereo rendering tests passed');
