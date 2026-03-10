export type LODPromotionState = 'idle' | 'warming' | 'ready' | 'promoted';

export type LODPolicyLayerDiagnostics = {
  layerKey: string;
  desiredScaleLevel: number;
  activeScaleLevel: number | null;
  fallbackScaleLevel: number | null;
  promotionState: LODPromotionState;
  lastPromoteMs: number | null;
  lastDemoteMs: number | null;
  promoteCount: number;
  demoteCount: number;
  thrashEvents: number;
  lastReadyLatencyMs: number | null;
};

export type LODPolicyDiagnosticsSnapshot = {
  capturedAt: string;
  layerCount: number;
  promotedLayers: number;
  warmingLayers: number;
  thrashEventsPerMinute: number;
  adaptivePolicyDisabled: boolean;
  layers: LODPolicyLayerDiagnostics[];
};
