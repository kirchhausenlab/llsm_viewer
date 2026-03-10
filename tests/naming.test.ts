import assert from 'node:assert/strict';

import { CHANNEL_NAME_MAX_LENGTH, TRACK_NAME_MAX_LENGTH } from '../src/constants/naming.ts';

console.log('Starting naming tests');

(() => {
  assert.equal(CHANNEL_NAME_MAX_LENGTH, 20);
  assert.equal(TRACK_NAME_MAX_LENGTH, 9);
})();

console.log('naming tests passed');
