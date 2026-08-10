import { haversineMeters } from "./distance";
import type { WaterSpot } from "./types";

/** How long a cached search stays valid in this browser tab. */
export const WATER_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * ~220 m cells — small pin nudges reuse the same entry; big moves miss.
 * 1/500 degree ≈ 222 m at the equator.
 */
const BUCKET_SCALE = 500;

export type WaterCacheEntry = {
  center: { latitude: number; longitude: number };
  /** Radius (m) that was actually fetched from the API. */
  radius: number;
  spots: WaterSpot[];
  fetchedAt: number;
};

const cache = new Map<string, WaterCacheEntry>();

export function bucketCoord(value: number): number {
  return Math.round(value * BUCKET_SCALE) / BUCKET_SCALE;
}

export function waterCacheKey(
  latitude: number,
  longitude: number,
  radius: number,
): string {
  return `${bucketCoord(latitude)}:${bucketCoord(longitude)}:${radius}`;
}

function sameCell(
  a: { latitude: number; longitude: number },
  latitude: number,
  longitude: number,
): boolean {
  return (
    bucketCoord(a.latitude) === bucketCoord(latitude) &&
    bucketCoord(a.longitude) === bucketCoord(longitude)
  );
}

function isFresh(entry: WaterCacheEntry, now: number): boolean {
  return now - entry.fetchedAt < WATER_CACHE_TTL_MS;
}

/** Recompute distances for the request center and keep spots inside radius. */
export function projectSpotsForCenter(
  spots: WaterSpot[],
  latitude: number,
  longitude: number,
  radius: number,
): WaterSpot[] {
  return spots
    .map((spot) => ({
      ...spot,
      distanceMeters: Math.round(
        haversineMeters(latitude, longitude, spot.latitude, spot.longitude),
      ),
    }))
    .filter((spot) => spot.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Store a successful /api/water response for this tab session. */
export function rememberWaterSearch(
  latitude: number,
  longitude: number,
  radius: number,
  spots: WaterSpot[],
): void {
  const key = waterCacheKey(latitude, longitude, radius);
  cache.set(key, {
    center: { latitude, longitude },
    radius,
    spots: spots.map((s) => ({ ...s })),
    fetchedAt: Date.now(),
  });
}

/**
 * Lookup:
 * 1) exact radius for this cell
 * 2) else a larger cached radius in the same cell (shrink → filter, no network)
 */
export function readWaterSearch(
  latitude: number,
  longitude: number,
  radius: number,
  now = Date.now(),
): WaterSpot[] | null {
  const exact = cache.get(waterCacheKey(latitude, longitude, radius));
  if (exact && isFresh(exact, now)) {
    return projectSpotsForCenter(exact.spots, latitude, longitude, radius);
  }

  let best: WaterCacheEntry | null = null;
  for (const entry of cache.values()) {
    if (!isFresh(entry, now)) continue;
    if (!sameCell(entry.center, latitude, longitude)) continue;
    if (entry.radius < radius) continue;
    if (!best || entry.radius < best.radius) best = entry;
  }

  if (!best) return null;
  return projectSpotsForCenter(best.spots, latitude, longitude, radius);
}

/** Keep lazy location hints on cached spots when they load. */
export function patchWaterCacheHint(
  spotId: string,
  locationHint: string,
): void {
  for (const entry of cache.values()) {
    const index = entry.spots.findIndex((s) => s.id === spotId);
    if (index === -1) continue;
    entry.spots[index] = { ...entry.spots[index], locationHint };
  }
}

/** Test helper — clears the module cache. */
export function clearWaterCache(): void {
  cache.clear();
}
