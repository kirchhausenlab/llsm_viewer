import assert from 'node:assert/strict';

import { WebSocket } from 'ws';

import { createCollaborationServer } from '../server/collabServer.ts';
import { CollaborationClient } from '../src/collaboration/client.ts';
import type { CollaborationMessage, SerializedViewerState } from '../src/collaboration/types.ts';
import { serializeDataset } from '../src/collaboration/serialization.ts';
import { createSampleDataset } from './helpers/sampleDataset.ts';

console.log('Starting collaboration client/server integration tests');

type MessagePredicate = (message: CollaborationMessage) => boolean;

function waitForMessage(socket: WebSocket, predicate: MessagePredicate, timeoutMs = 2000) {
  return new Promise<CollaborationMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for message'));
    }, timeoutMs);

    const handleMessage = (raw: WebSocket.RawData) => {
      let parsed: CollaborationMessage | null = null;
      try {
        parsed = JSON.parse(raw.toString()) as CollaborationMessage;
      } catch (error) {
        console.warn('Failed to parse WebSocket message', error);
        return;
      }
      if (parsed && predicate(parsed)) {
        cleanup();
        resolve(parsed);
      }
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const handleClose = () => {
      cleanup();
      reject(new Error('Socket closed before receiving expected message'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', handleMessage as any);
      socket.off('error', handleError as any);
      socket.off('close', handleClose);
    };

    socket.on('message', handleMessage as any);
    socket.once('error', handleError as any);
    socket.once('close', handleClose);
  });
}

function waitForOpen(socket: WebSocket, timeoutMs = 2000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out opening WebSocket connection'));
    }, timeoutMs);

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('open', handleOpen);
      socket.off('error', handleError as any);
    };

    socket.once('open', handleOpen);
    socket.once('error', handleError as any);
  });
}

async function closeSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
    return;
  }
  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

await (async () => {
  const server = createCollaborationServer();
  let baseUrl = '';
  let wsUrl = '';
  let originalFetch: typeof globalThis.fetch | null = null;
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;

  const dataset = createSampleDataset();
  const serialized = serializeDataset(dataset);

  try {
    const port = await server.start(0);
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}${'/api/collaboration/ws'}`;

    const hostSocket = new WebSocket(wsUrl);
    await waitForOpen(hostSocket);
    hostSocket.send(
      JSON.stringify({
        type: 'identify',
        roomCode: 'INVALID',
        role: 'host',
        displayName: 'Host'
      })
    );
    await waitForMessage(hostSocket, (message) => message.type === 'error');
    await closeSocket(hostSocket);

    const response = await fetch(`${baseUrl}/api/collaboration/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: serialized })
    });
    assert.strictEqual(response.status, 200);
    const { roomCode } = (await response.json()) as { roomCode: string };

    const datasetResponse = await fetch(`${baseUrl}/api/collaboration/sessions/${roomCode}`);
    assert.strictEqual(datasetResponse.status, 200);
    const fetched = await datasetResponse.json();
    assert.deepStrictEqual(fetched.dataset, serialized);

    const hostLiveSocket = new WebSocket(wsUrl);
    await waitForOpen(hostLiveSocket);
    hostLiveSocket.send(
      JSON.stringify({
        type: 'identify',
        roomCode,
        role: 'host',
        displayName: 'Host'
      })
    );
    const hostWelcome = await waitForMessage(hostLiveSocket, (message) => message.type === 'welcome');
    assert.strictEqual(hostWelcome.participants.length, 0);

    const guestSocket = new WebSocket(wsUrl);
    await waitForOpen(guestSocket);
    guestSocket.send(
      JSON.stringify({
        type: 'identify',
        roomCode,
        role: 'guest',
        displayName: 'Guest'
      })
    );

    const hostParticipantJoined = await waitForMessage(
      hostLiveSocket,
      (message) => message.type === 'participant-joined'
    );
    assert.strictEqual(hostParticipantJoined.participant.displayName, 'Guest');

    const guestWelcome = await waitForMessage(guestSocket, (message) => message.type === 'welcome');
    assert.strictEqual(guestWelcome.participants.length, 1);

    const viewerState: SerializedViewerState = {
      selectedIndex: 3,
      isPlaying: true,
      fps: 24,
      viewerMode: '2d',
      sliceIndex: 5,
      followedTrackId: 'track-123'
    };
    hostLiveSocket.send(JSON.stringify({ type: 'state-update', state: viewerState }));
    const guestState = await waitForMessage(guestSocket, (message) => message.type === 'state-update');
    assert.deepStrictEqual(guestState.patch, viewerState);

    const posePayload = {
      head: { position: [1, 2, 3], quaternion: [0, 0, 0, 1] } as const,
      leftController: {
        position: [4, 5, 6] as const,
        quaternion: [0, 0, 0, 1] as const,
        triggerPressed: true,
        squeezePressed: false
      },
      rightController: {
        position: [7, 8, 9] as const,
        quaternion: [0, 0, 0, 1] as const,
        triggerPressed: false,
        squeezePressed: true
      }
    };
    guestSocket.send(JSON.stringify({ type: 'pose-update', ...posePayload }));
    const hostPose = await waitForMessage(hostLiveSocket, (message) => message.type === 'pose-update');
    assert.deepStrictEqual(hostPose.head, posePayload.head);
    assert.deepStrictEqual(hostPose.leftController, posePayload.leftController);
    assert.deepStrictEqual(hostPose.rightController, posePayload.rightController);

    guestSocket.send(JSON.stringify({ type: 'request-dataset' }));
    const datasetReady = await waitForMessage(guestSocket, (message) => message.type === 'dataset-ready');
    assert.deepStrictEqual(datasetReady.dataset, serialized);

    // Exercise the browser collaboration client using mocked globals.
    originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && input.startsWith('/')) {
        return originalFetch!(new URL(input, baseUrl), init);
      }
      return originalFetch!(input, init);
    };

    globalThis.window = {
      location: {
        protocol: 'http:',
        host: `127.0.0.1:${port}`
      }
    } as unknown as Window & typeof globalThis;

    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;

    const hostClient = new CollaborationClient({ displayName: 'HostUser' });
    const guestClient = new CollaborationClient({ displayName: 'GuestUser' });

    const session = await hostClient.createSession(dataset);
    assert.ok(session.roomCode);

    const fetchedDataset = await guestClient.fetchDataset(session.roomCode);
    assert.strictEqual(fetchedDataset.layers.length, dataset.layers.length);

    const hostWelcomePromise = new Promise<void>((resolve) => {
      const remove = hostClient.addListener({
        onWelcome() {
          remove();
          resolve();
        }
      });
    });

    hostClient.connect(session.roomCode, 'host');
    await hostWelcomePromise;

    const guestWelcomePromise = new Promise<void>((resolve) => {
      const remove = guestClient.addListener({
        onWelcome(payload) {
          if (payload.participants.length === 1) {
            remove();
            resolve();
          }
        }
      });
    });

    const hostJoinedPromise = new Promise<void>((resolve) => {
      const remove = hostClient.addListener({
        onParticipantJoined() {
          remove();
          resolve();
        }
      });
    });

    guestClient.connect(session.roomCode, 'guest');
    await Promise.all([guestWelcomePromise, hostJoinedPromise]);

    const stateUpdatePromise = new Promise<SerializedViewerState>((resolve) => {
      const remove = guestClient.addListener({
        onStateUpdate(patch) {
          remove();
          resolve({
            selectedIndex: patch.selectedIndex ?? 0,
            isPlaying: patch.isPlaying ?? false,
            fps: patch.fps ?? 0,
            viewerMode: patch.viewerMode ?? '3d',
            sliceIndex: patch.sliceIndex ?? 0,
            followedTrackId: patch.followedTrackId ?? null
          });
        }
      });
    });

    const updateState: SerializedViewerState = {
      selectedIndex: 2,
      isPlaying: true,
      fps: 60,
      viewerMode: '3d',
      sliceIndex: 1,
      followedTrackId: null
    };
    hostClient.sendViewerState(updateState);
    const receivedState = await stateUpdatePromise;
    assert.deepStrictEqual(receivedState, updateState);

    const poseUpdatePromise = new Promise<void>((resolve) => {
      const remove = hostClient.addListener({
        onPoseUpdate(payload) {
          if (payload.head) {
            remove();
            resolve();
          }
        }
      });
    });

    guestClient.sendPoseUpdate(
      { position: [0.1, 0.2, 0.3], quaternion: [0, 0, 0, 1] },
      null,
      null
    );
    await poseUpdatePromise;

    const datasetReadyPromise = new Promise<void>((resolve) => {
      const remove = guestClient.addListener({
        onDatasetReady(hydrated) {
          if (hydrated.layers.length === dataset.layers.length) {
            remove();
            resolve();
          }
        }
      });
    });

    guestClient.requestDataset();
    await datasetReadyPromise;

    hostClient.disconnect();
    guestClient.disconnect();

    await Promise.all([closeSocket(hostLiveSocket), closeSocket(guestSocket)]);
  } catch (error) {
    console.error('Collaboration client/server integration tests failed');
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  } finally {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      // @ts-expect-error - clean up the mock window when none existed before.
      delete (globalThis as any).window;
    }
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    } else {
      // @ts-expect-error - clean up the mock WebSocket when none existed before.
      delete (globalThis as any).WebSocket;
    }
    await server.stop();
  }
})();

