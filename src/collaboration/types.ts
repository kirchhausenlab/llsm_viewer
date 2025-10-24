import type { TrackColorMode, TrackDefinition } from '../types/tracks';

export type CollaborationRole = 'host' | 'guest';

export type SerializedVolume = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  min: number;
  max: number;
  data: string;
};

export type SerializedLayer = {
  key: string;
  label: string;
  channelId: string;
  channelName: string;
  isSegmentation: boolean;
  volumes: SerializedVolume[];
};

export type SerializedLayerSettings = {
  contrast: number;
  gamma: number;
  brightness: number;
  color: string;
  xOffset: number;
  yOffset: number;
  renderStyle: 0 | 1;
  invert: boolean;
};

export type SerializedChannelState = {
  channelId: string;
  visibility: boolean;
  activeLayerKey: string | null;
};

export type SerializedTrackState = {
  channelId: string;
  opacity: number;
  lineWidth: number;
  colorMode: TrackColorMode;
  visibility: Record<string, boolean>;
};

export type SerializedTracks = {
  definitions: TrackDefinition[];
};

export type SerializedViewerState = {
  selectedIndex: number;
  isPlaying: boolean;
  fps: number;
  viewerMode: '3d' | '2d';
  sliceIndex: number;
  followedTrackId: string | null;
};

export type SerializedDataset = {
  layers: SerializedLayer[];
  layerSettings: Record<string, SerializedLayerSettings>;
  channels: SerializedChannelState[];
  tracks: SerializedTracks;
  trackStates: SerializedTrackState[];
  viewerState: SerializedViewerState;
  createdAt: number;
};

export type CollaborationSessionSummary = {
  sessionId: string;
  roomCode: string;
};

export type CollaborationError = {
  message: string;
  recoverable?: boolean;
};

export type ParticipantPose = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

export type ControllerState = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  triggerPressed: boolean;
  squeezePressed: boolean;
};

export type ParticipantSnapshot = {
  id: string;
  displayName: string;
  role: CollaborationRole;
  head: ParticipantPose | null;
  leftController: ControllerState | null;
  rightController: ControllerState | null;
  lastUpdated: number;
};

export type CollaborationMessage =
  | { type: 'welcome'; participantId: string; participants: ParticipantSnapshot[]; viewerState: SerializedViewerState | null }
  | { type: 'participants'; participants: ParticipantSnapshot[] }
  | { type: 'participant-joined'; participant: ParticipantSnapshot }
  | { type: 'participant-left'; participantId: string }
  | { type: 'state-update'; patch: Partial<SerializedViewerState> }
  | { type: 'pose-update'; participantId: string; head: ParticipantPose | null; leftController: ControllerState | null; rightController: ControllerState | null }
  | { type: 'dataset-ready'; dataset: SerializedDataset }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'identify'; roomCode: string; role: CollaborationRole; displayName: string }
  | { type: 'state-update'; state: SerializedViewerState }
  | { type: 'pose-update'; head: ParticipantPose | null; leftController: ControllerState | null; rightController: ControllerState | null }
  | { type: 'request-dataset' };

export type DatasetTransferRequest = {
  roomCode?: string;
  dataset: SerializedDataset;
};
