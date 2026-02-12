import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import ChannelUploads from '../../src/components/pages/ChannelUploads.tsx';

test('channel uploads forwards selected files', () => {
  const selectedBatches: File[][] = [];
  const renderer = TestRenderer.create(
    <ChannelUploads
      variant="layers"
      accept=".tif"
      multiple
      disabled={false}
      browseLabel="From Files"
      subtitle="Or drop sequence folder here"
      onFilesSelected={(files) => {
        selectedBatches.push(files);
      }}
      onDropDataTransfer={() => {}}
    />
  );

  const fileInput = renderer.root.findByType('input');
  const files = [new File(['a'], 'a.tif'), new File(['b'], 'b.tif')];

  act(() => {
    fileInput.props.onChange({
      target: {
        files,
        value: 'mock-value'
      }
    });
  });

  assert.equal(selectedBatches.length, 1);
  assert.equal(selectedBatches[0]?.length, 2);
  assert.equal(selectedBatches[0]?.[0]?.name, 'a.tif');
  assert.equal(selectedBatches[0]?.[1]?.name, 'b.tif');

  renderer.unmount();
});

test('channel uploads suppresses file selection while disabled', () => {
  let callCount = 0;
  const renderer = TestRenderer.create(
    <ChannelUploads
      variant="tracks"
      accept=".csv"
      multiple
      disabled
      browseLabel="From Files"
      subtitle="Or drop one or more tracks files here"
      onFilesSelected={() => {
        callCount += 1;
      }}
      onDropDataTransfer={() => {}}
    />
  );

  const fileInput = renderer.root.findByType('input');

  act(() => {
    fileInput.props.onChange({
      target: {
        files: [new File(['x'], 'tracks.csv')],
        value: 'mock-value'
      }
    });
  });

  assert.equal(callCount, 0);

  renderer.unmount();
});
