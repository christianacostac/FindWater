export type WaterSpot = {
  id: string;
  lat: number;
  lon: number;
  name: string | null;
  type: string;
  tags: Record<string, string>;
  distanceMeters: number;
};

export type WaterApiResponse = {
  spots: WaterSpot[];
  radius: number;
  center: { lat: number; lon: number };
};

export type WaterApiError = {
  error: string;
};
