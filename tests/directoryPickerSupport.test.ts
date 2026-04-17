import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getDirectoryPickerUnavailableMessage,
  inspectDirectoryPickerSupport
} from '../src/shared/utils/directoryPickerSupport.ts';

test('reports insecure contexts explicitly', () => {
  const support = inspectDirectoryPickerSupport({
    isSecureContext: false,
    self: {},
    top: {}
  });

  assert.deepEqual(support, { supported: false, reason: 'insecure-context' });
  assert.match(getDirectoryPickerUnavailableMessage(support), /not running in a secure context/i);
  assert.match(getDirectoryPickerUnavailableMessage(support), /http:\/\/localhost/i);
});

test('reports embedded contexts explicitly', () => {
  const self = {};
  const top = {};
  const support = inspectDirectoryPickerSupport({
    isSecureContext: true,
    self,
    top
  });

  assert.deepEqual(support, { supported: false, reason: 'embedded-context' });
  assert.match(getDirectoryPickerUnavailableMessage(support), /embedded browser context/i);
});

test('treats an exposed directory picker as supported', () => {
  const support = inspectDirectoryPickerSupport({
    isSecureContext: true,
    self: {},
    top: {},
    showDirectoryPicker: async () => ({}) as FileSystemDirectoryHandle
  });

  assert.deepEqual(support, { supported: true });
});
