import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ClientMessage,
  CollaborationMessage,
  CollaborationRole,
  CollaborationSessionSummary,
  ControllerState,
  DatasetTransferRequest,
  ParticipantPose,
  ParticipantSnapshot,
  SerializedDataset,
  SerializedViewerState
} from '../src/collaboration/types';

const API_BASE = '/api/collaboration';

type ParticipantConnection = {
  id: string;
  role: CollaborationRole;
  displayName: string;
  socket: WebSocket;
  lastPose: {
    head: ParticipantPose | null;
    leftController: ControllerState | null;
    rightController: ControllerState | null;
  };
};

type Session = {
  id: string;
  roomCode: string;
  dataset: SerializedDataset;
  participants: Map<string, ParticipantConnection>;
  latestViewerState: SerializedViewerState | null;
};

type PendingConnection = {
  socket: WebSocket;
  session: Session | null;
  participant: ParticipantConnection | null;
};

export type CollaborationServerControls = {
  app: express.Express;
  server: HttpServer;
  wss: WebSocketServer;
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
};

function createRoomCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function createSessionId(): string {
  return crypto.randomUUID();
}

function buildParticipantSnapshot(connection: ParticipantConnection): ParticipantSnapshot {
  return {
    id: connection.id,
    displayName: connection.displayName,
    role: connection.role,
    head: connection.lastPose.head,
    leftController: connection.lastPose.leftController,
    rightController: connection.lastPose.rightController,
    lastUpdated: Date.now()
  };
}

function broadcast(session: Session, message: CollaborationMessage, excludeId?: string) {
  const payload = JSON.stringify(message);
  for (const participant of session.participants.values()) {
    if (excludeId && participant.id === excludeId) {
      continue;
    }
    if (participant.socket.readyState === WebSocket.OPEN) {
      participant.socket.send(payload);
    }
  }
}

function buildSummary(session: Session): CollaborationSessionSummary {
  return { sessionId: session.id, roomCode: session.roomCode };
}

export function createCollaborationServer(): CollaborationServerControls {
  const app = express();
  app.use(express.json({ limit: '300mb' }));

  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const sessions = new Map<string, Session>();
  const sessionsByRoom = new Map<string, Session>();

  app.post(`${API_BASE}/sessions`, (req, res) => {
    const payload = req.body as DatasetTransferRequest | undefined;
    if (!payload || !payload.dataset) {
      res.status(400).json({ message: 'Missing dataset payload' });
      return;
    }

    const session: Session = {
      id: createSessionId(),
      roomCode: createRoomCode(),
      dataset: payload.dataset,
      participants: new Map(),
      latestViewerState: payload.dataset.viewerState ?? null
    };

    sessions.set(session.id, session);
    sessionsByRoom.set(session.roomCode.toUpperCase(), session);

    res.json(buildSummary(session));
  });

  app.get(`${API_BASE}/sessions/:roomCode`, (req, res) => {
    const { roomCode } = req.params;
    const session = sessionsByRoom.get((roomCode ?? '').toUpperCase());
    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }
    res.json({ dataset: session.dataset });
  });

  function attachConnection(session: Session, participant: ParticipantConnection) {
    session.participants.set(participant.id, participant);
    const snapshot = buildParticipantSnapshot(participant);
    broadcast(session, { type: 'participant-joined', participant: snapshot }, participant.id);
    const welcome: CollaborationMessage = {
      type: 'welcome',
      participantId: participant.id,
      participants: Array.from(session.participants.values())
        .filter((connection) => connection.id !== participant.id)
        .map(buildParticipantSnapshot),
      viewerState: session.latestViewerState
    };
    if (participant.socket.readyState === WebSocket.OPEN) {
      participant.socket.send(JSON.stringify(welcome));
    }
  }

  wss.on('connection', (socket) => {
    const pending: PendingConnection = { socket, session: null, participant: null };

    socket.on('message', (rawData) => {
      let message: ClientMessage | null = null;
      try {
        message = JSON.parse(rawData.toString()) as ClientMessage;
      } catch (error) {
        console.warn('Invalid collaboration message', error);
      }
      if (!message) {
        return;
      }

      if (message.type === 'identify') {
        const session = sessionsByRoom.get((message.roomCode ?? '').toUpperCase());
        if (!session) {
          const response: CollaborationMessage = { type: 'error', message: 'Session not found' };
          socket.send(JSON.stringify(response));
          socket.close();
          return;
        }
        const participant: ParticipantConnection = {
          id: createSessionId(),
          role: message.role,
          displayName: message.displayName || 'Viewer user',
          socket,
          lastPose: { head: null, leftController: null, rightController: null }
        };
        pending.session = session;
        pending.participant = participant;
        attachConnection(session, participant);
        return;
      }

      const session = pending.session;
      const participant = pending.participant;
      if (!session || !participant) {
        const response: CollaborationMessage = { type: 'error', message: 'Identify before sending messages' };
        socket.send(JSON.stringify(response));
        return;
      }

      switch (message.type) {
        case 'state-update':
          session.latestViewerState = message.state;
          broadcast(session, { type: 'state-update', patch: message.state }, participant.id);
          break;
        case 'pose-update':
          participant.lastPose = {
            head: message.head ?? null,
            leftController: message.leftController ?? null,
            rightController: message.rightController ?? null
          };
          broadcast(
            session,
            {
              type: 'pose-update',
              participantId: participant.id,
              head: participant.lastPose.head,
              leftController: participant.lastPose.leftController,
              rightController: participant.lastPose.rightController
            },
            participant.id
          );
          break;
        case 'request-dataset':
          if (participant.socket.readyState === WebSocket.OPEN) {
            const payload: CollaborationMessage = { type: 'dataset-ready', dataset: session.dataset };
            participant.socket.send(JSON.stringify(payload));
          }
          break;
        default:
          break;
      }
    });

    socket.on('close', () => {
      const session = pending.session;
      const participant = pending.participant;
      if (session && participant) {
        session.participants.delete(participant.id);
        broadcast(session, { type: 'participant-left', participantId: participant.id });
        if (session.participants.size === 0) {
          sessions.delete(session.id);
          sessionsByRoom.delete(session.roomCode.toUpperCase());
        }
      }
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const url = request.url ?? '';
    if (!url.startsWith(`${API_BASE}/ws`)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  const start = (port?: number) =>
    new Promise<number>((resolveStart, rejectStart) => {
      const desiredPort = port ?? Number(process.env.PORT ?? 8080);
      const onError = (error: Error) => {
        server.off('error', onError);
        rejectStart(error);
      };
      server.once('error', onError);
      server.listen(desiredPort, () => {
        server.off('error', onError);
        const address = server.address();
        if (typeof address === 'object' && address) {
          resolveStart(address.port);
        } else {
          resolveStart(desiredPort);
        }
      });
    });

  const stop = async () => {
    const closeClients = Array.from(wss.clients).map(
      (client) =>
        new Promise<void>((resolveClient) => {
          if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
            resolveClient();
            return;
          }
          client.once('close', () => resolveClient());
          client.close(1001, 'Server shutdown');
        })
    );
    await Promise.all(closeClients);

    await new Promise<void>((resolveWss) => {
      wss.close(() => resolveWss());
    });

    await new Promise<void>((resolveServer, rejectServer) => {
      server.close((error) => {
        if (error) {
          rejectServer(error);
          return;
        }
        resolveServer();
      });
    });

    sessions.clear();
    sessionsByRoom.clear();
  };

  return { app, server, wss, start, stop };
}

const isMainModule = (() => {
  if (typeof process === 'undefined' || !process.argv || process.argv.length < 2) {
    return false;
  }
  const entryUrl = pathToFileURL(resolve(process.argv[1])).href;
  return import.meta.url === entryUrl;
})();

if (isMainModule) {
  const controls = createCollaborationServer();
  const desiredPort = Number(process.env.PORT ?? 8080);
  controls
    .start(desiredPort)
    .then((port) => {
      console.log(`Collaboration server listening on http://0.0.0.0:${port}`);
    })
    .catch((error) => {
      console.error('Failed to start collaboration server', error);
      process.exitCode = 1;
    });
}

