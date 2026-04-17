export const ROI_MEASUREMENT_METRIC_ORDER = [
  'count',
  'std',
  'min',
  'max',
  'mean',
  'median',
] as const;

export type RoiMeasurementMetricKey = (typeof ROI_MEASUREMENT_METRIC_ORDER)[number];

export type RoiMeasurementSettings = {
  enabledMetrics: Record<RoiMeasurementMetricKey, boolean>;
  decimalPlaces: number;
};

export type RoiMeasurementChannelSnapshot = {
  id: string;
  name: string;
};

export type RoiMeasurementRow = {
  roiOrder: number;
  roiId: string;
  roiName: string;
  channelId: string;
  channelName: string;
  values: Record<RoiMeasurementMetricKey, number | null>;
};

export type RoiMeasurementsSnapshot = {
  createdAt: string;
  timepoint: number;
  channels: RoiMeasurementChannelSnapshot[];
  rows: RoiMeasurementRow[];
};

export const DEFAULT_ROI_MEASUREMENT_SETTINGS: RoiMeasurementSettings = {
  enabledMetrics: {
    count: true,
    std: false,
    min: true,
    max: true,
    mean: true,
    median: false,
  },
  decimalPlaces: 3,
};
