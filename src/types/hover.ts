export type HoveredIntensityComponent = { text: string; color?: string | null };

export type HoveredVoxelInfo = {
  intensity: string;
  components: HoveredIntensityComponent[];
  coordinates: {
    x: number;
    y: number;
    z: number;
  };
};
