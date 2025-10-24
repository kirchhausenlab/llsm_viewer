import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyParticipantPoseToAvatar,
  createRemoteAvatar
} from '../src/components/collaborationAvatars.ts';
import type { ParticipantSnapshot } from '../src/collaboration/types.ts';

console.log('Starting VolumeViewer collaboration avatar tests');

await (async () => {
  try {
    const avatar = createRemoteAvatar('Guest', new THREE.Color('#ff6600').getHex());
    const userData = avatar.userData as {
      head: THREE.Mesh;
      left: THREE.Mesh;
      right: THREE.Mesh;
    };

    assert.ok(userData.head instanceof THREE.Mesh);
    assert.ok(userData.left instanceof THREE.Mesh);
    assert.ok(userData.right instanceof THREE.Mesh);

    const participant: ParticipantSnapshot = {
      id: 'guest-1',
      displayName: 'Guest',
      role: 'guest',
      head: { position: [1, 2, 3], quaternion: [0.1, 0.2, 0.3, 0.9] },
      leftController: {
        position: [4, 5, 6],
        quaternion: [0.4, 0.5, 0.6, 0.7],
        triggerPressed: true,
        squeezePressed: false
      },
      rightController: {
        position: [7, 8, 9],
        quaternion: [0.7, 0.8, 0.9, 1],
        triggerPressed: false,
        squeezePressed: true
      },
      lastUpdated: Date.now()
    };

    applyParticipantPoseToAvatar(avatar, participant);

    assert.ok(avatar.visible);
    assert.ok(userData.head.visible);
    assert.ok(userData.left.visible);
    assert.ok(userData.right.visible);
    assert.deepStrictEqual(userData.head.position.toArray(), [1, 2, 3]);
    assert.deepStrictEqual(userData.left.position.toArray(), [4, 5, 6]);
    assert.deepStrictEqual(userData.right.position.toArray(), [7, 8, 9]);

    const cleared: ParticipantSnapshot = {
      ...participant,
      head: null,
      leftController: null,
      rightController: null,
      lastUpdated: Date.now()
    };

    applyParticipantPoseToAvatar(avatar, cleared);

    assert.ok(!avatar.visible);
    assert.ok(!userData.head.visible);
    assert.ok(!userData.left.visible);
    assert.ok(!userData.right.visible);

    console.log('VolumeViewer collaboration avatar tests passed');
  } catch (error) {
    console.error('VolumeViewer collaboration avatar tests failed');
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
})();

