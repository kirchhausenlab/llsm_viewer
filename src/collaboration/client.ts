import { deserializeDataset, serializeDataset, type HydratedDataset } from './serialization';
import type {
  ClientMessage,
  CollaborationMessage,
  CollaborationRole,
  CollaborationSessionSummary,
  ParticipantSnapshot,
  ParticipantPose,
  ControllerState,
  SerializedDataset,
  SerializedViewerState
} from './types';

export type CollaborationClientListener = {
  onWelcome?: (payload: { participantId: string; participants: ParticipantSnapshot[]; viewerState: SerializedViewerState | null }) => void;
  onParticipants?: (participants: ParticipantSnapshot[]) => void;
  onParticipantJoined?: (participant: ParticipantSnapshot) => void;
  onParticipantLeft?: (participantId: string) => void;
  onStateUpdate?: (patch: Partial<SerializedViewerState>) => void;
  onDatasetReady?: (dataset: HydratedDataset) => void;
  onPoseUpdate?: (payload: {
    participantId: string;
    head: ParticipantPose | null;
    leftController: ControllerState | null;
    rightController: ControllerState | null;
  }) => void;
  onError?: (message: string) => void;
};

export type CollaborationClientOptions = {
  basePath?: string;
  displayName?: string;
};

const DEFAULT_BASE_PATH = '/api/collaboration';

export class CollaborationClient {
  private socket: WebSocket | null = null;

  private readonly listeners = new Set<CollaborationClientListener>();

  private readonly basePath: string;

  private displayName: string;

  private roomCode: string | null = null;

  private role: CollaborationRole | null = null;

  constructor(options: CollaborationClientOptions = {}) {
    this.basePath = options.basePath ?? DEFAULT_BASE_PATH;
    this.displayName = options.displayName ?? 'Viewer user';
  }

  setDisplayName(name: string): void {
    this.displayName = name.trim() || 'Viewer user';
  }

  addListener(listener: CollaborationClientListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async createSession(dataset: HydratedDataset): Promise<CollaborationSessionSummary> {
    const serialized = serializeDataset(dataset);
    const response = await fetch(`${this.basePath}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: serialized })
    });
    if (!response.ok) {
      throw new Error(`Failed to create session (${response.status})`);
    }
    const summary = (await response.json()) as CollaborationSessionSummary;
    return summary;
  }

  async fetchDataset(roomCode: string): Promise<HydratedDataset> {
    const response = await fetch(`${this.basePath}/sessions/${encodeURIComponent(roomCode)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch dataset (${response.status})`);
    }
    const payload = (await response.json()) as { dataset: SerializedDataset };
    return deserializeDataset(payload.dataset);
  }

  connect(roomCode: string, role: CollaborationRole): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.roomCode = roomCode;
    this.role = role;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}${this.basePath}/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      const hello: ClientMessage = {
        type: 'identify',
        roomCode,
        role,
        displayName: this.displayName
      };
      socket.send(JSON.stringify(hello));
    });

    socket.addEventListener('message', (event) => {
      let message: CollaborationMessage | null = null;
      try {
        message = JSON.parse(event.data) as CollaborationMessage;
      } catch (error) {
        console.warn('Failed to parse collaboration message', error);
      }
      if (!message) {
        return;
      }
      this.handleServerMessage(message);
    });

    socket.addEventListener('close', () => {
      this.socket = null;
    });

    socket.addEventListener('error', (event) => {
      console.error('Collaboration socket error', event);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.roomCode = null;
    this.role = null;
  }

  sendViewerState(state: SerializedViewerState): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: ClientMessage = {
      type: 'state-update',
      state
    };
    this.socket.send(JSON.stringify(message));
  }

  sendPoseUpdate(
    head: ParticipantPose | null,
    leftController: ControllerState | null,
    rightController: ControllerState | null
  ): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: ClientMessage = {
      type: 'pose-update',
      head,
      leftController,
      rightController
    };
    this.socket.send(JSON.stringify(message));
  }

  requestDataset(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const message: ClientMessage = { type: 'request-dataset' };
    this.socket.send(JSON.stringify(message));
  }

  private handleServerMessage(message: CollaborationMessage): void {
    switch (message.type) {
      case 'welcome':
        this.listeners.forEach((listener) => listener.onWelcome?.(message));
        break;
      case 'participants':
        this.listeners.forEach((listener) => listener.onParticipants?.(message.participants));
        break;
      case 'participant-joined':
        this.listeners.forEach((listener) => listener.onParticipantJoined?.(message.participant));
        break;
      case 'participant-left':
        this.listeners.forEach((listener) => listener.onParticipantLeft?.(message.participantId));
        break;
      case 'state-update':
        this.listeners.forEach((listener) => listener.onStateUpdate?.(message.patch));
        break;
      case 'dataset-ready': {
        const hydrated = deserializeDataset(message.dataset);
        this.listeners.forEach((listener) => listener.onDatasetReady?.(hydrated));
        break;
      }
      case 'pose-update':
        this.listeners.forEach((listener) =>
          listener.onPoseUpdate?.({
            participantId: message.participantId,
            head: message.head,
            leftController: message.leftController,
            rightController: message.rightController
          })
        );
        break;
      case 'error':
        this.listeners.forEach((listener) => listener.onError?.(message.message));
        break;
      default:
        break;
    }
  }
}
