export type WaterSpot = {
  id: string;
  latitude: number;
  longitude: number;
  name: string | null;
  type: string;
  tags: Record<string, string>;
  distanceMeters: number;
  /** Best display title: name, operator, or type. */
  displayName: string;
  /** e.g. "Near Brickell Ave" / "In Bayfront Park" */
  locationHint: string | null;
};

export type WaterApiResponse = {
  spots: WaterSpot[];
  radius: number;
  center: { latitude: number; longitude: number };
};

export type WaterHintResponse = {
  locationHint: string | null;
  center: { latitude: number; longitude: number };
};

export type WaterApiError = {
  error: string;
};
