import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';

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
      subtitle="Or drop folder here"
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
      subtitle="Or drop file here"
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

test('channel uploads switches to selected-state summary', () => {
  let callCount = 0;
  const renderer = TestRenderer.create(
    <ChannelUploads
      variant="layers"
      accept=".tif"
      multiple
      disabled={false}
      browseLabel="From Files"
      subtitle="Or drop folder here"
      hasSelection
      selectedSummary="3 files selected"
      onFilesSelected={() => {
        callCount += 1;
      }}
      onDropDataTransfer={() => {}}
      actionSlot={<span id="dropbox-action">From Dropbox</span>}
      rightSlot={<button type="button">Clear</button>}
    />
  );

  const root = renderer.root;
  const browseButtons = root.findAll(
    (node: ReactTestInstance) => node.type === 'button' && node.props.children === 'From Files'
  );
  const dropboxActions = root.findAll(
    (node: ReactTestInstance) => node.type === 'span' && node.props.id === 'dropbox-action'
  );
  const subtitle = root.findByProps({ className: 'channel-layer-drop-subtitle' });

  assert.equal(browseButtons.length, 0);
  assert.equal(dropboxActions.length, 0);
  assert.equal(subtitle.children.join(''), '3 files selected');

  const fileInput = root.findByType('input');
  act(() => {
    fileInput.props.onChange({
      target: {
        files: [new File(['a'], 'a.tif')],
        value: 'mock-value'
      }
    });
  });

  assert.equal(callCount, 0);

  renderer.unmount();
});
