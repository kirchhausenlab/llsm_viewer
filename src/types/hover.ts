export type HoveredIntensityComponent = {
  text: string;
  channelLabel?: string | null;
  color?: string | null;
};

export type HoverType = 'default' | 'crosshair';

export type HoverSettings = {
  enabled: boolean;
  type: HoverType;
  strength: number;
  radius: number;
};

export type HoveredVoxelInfo = {
  intensity: string;
  components: HoveredIntensityComponent[];
  coordinates: {
    x: number;
    y: number;
    z: number;
  };
};
