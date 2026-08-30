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

export type PlaceResult = {
  id: string;
  name: string;
  label: string;
  latitude: number;
  longitude: number;
};

export type PlaceSearchResponse = {
  places: PlaceResult[];
};

export type PlaceApiError = {
  error: string;
};

/** Raw Nominatim search JSON item. */
export type NominatimSearchItem = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  type?: string;
};
