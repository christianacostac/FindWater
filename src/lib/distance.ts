const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters between two WGS84 points. */
export function haversineMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const deltaLatitude = toRad(latitude2 - latitude1);
  const deltaLongitude = toRad(longitude2 - longitude1);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRad(latitude1)) *
      Math.cos(toRad(latitude2)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
