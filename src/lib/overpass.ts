import { haversineMeters } from "./distance";
import type { WaterSpot } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

export function buildOverpassQuery(
  lat: number,
  lon: number,
  radius: number,
): string {
  return `
[out:json][timeout:25];
(
  node(around:${radius},${lat},${lon})["amenity"="drinking_water"];
  node(around:${radius},${lat},${lon})["man_made"="drinking_fountain"];
  node(around:${radius},${lat},${lon})["amenity"="fountain"]["drinking_water"="yes"];
  way(around:${radius},${lat},${lon})["amenity"="drinking_water"];
  way(around:${radius},${lat},${lon})["man_made"="drinking_fountain"];
  way(around:${radius},${lat},${lon})["amenity"="fountain"]["drinking_water"="yes"];
);
out body center;
`.trim();
}

function spotType(tags: Record<string, string>): string {
  if (tags.amenity === "drinking_water") return "Drinking water";
  if (tags.man_made === "drinking_fountain") return "Drinking fountain";
  if (tags.amenity === "fountain") return "Fountain";
  return "Water point";
}

export function normalizeOverpassElements(
  elements: OverpassElement[],
  centerLat: number,
  centerLon: number,
): WaterSpot[] {
  const seen = new Set<string>();
  const spots: WaterSpot[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const tags = el.tags ?? {};
    spots.push({
      id,
      lat,
      lon,
      name: tags.name ?? null,
      type: spotType(tags),
      tags,
      distanceMeters: Math.round(haversineMeters(centerLat, centerLon, lat, lon)),
    });
  }

  spots.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return spots;
}

const OVERPASS_ENDPOINTS = [
  OVERPASS_URL,
  "https://overpass.kumi.systems/api/interpreter",
] as const;

export async function fetchNearbyWater(
  lat: number,
  lon: number,
  radius: number,
  signal?: AbortSignal,
): Promise<WaterSpot[]> {
  const query = buildOverpassQuery(lat, lon, radius);
  const body = new URLSearchParams({ data: query }).toString();
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent": "FindWater/0.1 (https://github.com/local/findwater; free drinking water finder)",
        },
        body,
        signal,
        cache: "no-store",
      });

      if (!res.ok) {
        lastError = new Error(`Overpass request failed (${res.status})`);
        continue;
      }

      const data = (await res.json()) as OverpassResponse;
      return normalizeOverpassElements(data.elements ?? [], lat, lon);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      lastError = err instanceof Error ? err : new Error("Overpass request failed");
    }
  }

  throw lastError ?? new Error("Overpass request failed");
}
