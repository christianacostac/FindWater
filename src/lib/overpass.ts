import { haversineMeters } from "./distance";
import type { WaterSpot } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CONTEXT_MATCH_METERS = 80;
/** Context enrichment stays small so it cannot blow the request budget. */
const CONTEXT_RADIUS_CAP_M = 600;
const CONTEXT_TIMEOUT_MS = 8_000;
const ENDPOINT_TIMEOUT_MS = 12_000;

/** Raw Overpass JSON shape — OSM uses `lat` / `lon` field names. */
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

type NamedFeature = {
  latitude: number;
  longitude: number;
  name: string;
  kind: "park" | "road";
};

const OVERPASS_ENDPOINTS = [
  OVERPASS_URL,
  "https://overpass.kumi.systems/api/interpreter",
] as const;

export function buildOverpassQuery(
  latitude: number,
  longitude: number,
  radius: number,
): string {
  return `
[out:json][timeout:20];
(
  node(around:${radius},${latitude},${longitude})["amenity"="drinking_water"];
  node(around:${radius},${latitude},${longitude})["man_made"="drinking_fountain"];
  node(around:${radius},${latitude},${longitude})["amenity"="fountain"]["drinking_water"="yes"];
  way(around:${radius},${latitude},${longitude})["amenity"="drinking_water"];
  way(around:${radius},${latitude},${longitude})["man_made"="drinking_fountain"];
  way(around:${radius},${latitude},${longitude})["amenity"="fountain"]["drinking_water"="yes"];
);
out body center;
`.trim();
}

function buildContextQuery(
  latitude: number,
  longitude: number,
  radius: number,
): string {
  const r = Math.min(radius, CONTEXT_RADIUS_CAP_M);
  return `
[out:json][timeout:8];
(
  way(around:${r},${latitude},${longitude})["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|footway)$"]["name"];
  node(around:${r},${latitude},${longitude})["leisure"~"^(park|playground)$"]["name"];
  way(around:${r},${latitude},${longitude})["leisure"~"^(park|playground)$"]["name"];
);
out tags center;
`.trim();
}

function spotType(tags: Record<string, string>): string {
  if (tags.amenity === "drinking_water") return "Drinking water";
  if (tags.man_made === "drinking_fountain") return "Drinking fountain";
  if (tags.amenity === "fountain") return "Fountain";
  return "Water point";
}

function buildDisplayName(
  tags: Record<string, string>,
  type: string,
): string {
  if (tags.name?.trim()) return tags.name.trim();
  if (tags.operator?.trim()) return tags.operator.trim();
  return type;
}

function addressHint(tags: Record<string, string>): string | null {
  const street = tags["addr:street"]?.trim();
  if (!street) return null;
  const number = tags["addr:housenumber"]?.trim();
  return number ? `Near ${number} ${street}` : `Near ${street}`;
}

function elementCoords(
  element: OverpassElement,
): { latitude: number; longitude: number } | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

function parseNamedFeatures(elements: OverpassElement[]): NamedFeature[] {
  const features: NamedFeature[] = [];
  const seen = new Set<string>();

  for (const element of elements) {
    const coords = elementCoords(element);
    const name = element.tags?.name?.trim();
    if (!coords || !name) continue;

    const tags = element.tags ?? {};
    const isPark =
      tags.leisure === "park" || tags.leisure === "playground";
    const isRoad = Boolean(tags.highway);

    if (!isPark && !isRoad) continue;

    const id = `${element.type}/${element.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    features.push({
      ...coords,
      name,
      kind: isPark ? "park" : "road",
    });
  }

  return features;
}

function nearestHint(
  latitude: number,
  longitude: number,
  features: NamedFeature[],
): string | null {
  let bestPark: { name: string; distance: number } | null = null;
  let bestRoad: { name: string; distance: number } | null = null;

  for (const feature of features) {
    const distance = haversineMeters(
      latitude,
      longitude,
      feature.latitude,
      feature.longitude,
    );
    if (distance > CONTEXT_MATCH_METERS) continue;

    if (feature.kind === "park") {
      if (!bestPark || distance < bestPark.distance) {
        bestPark = { name: feature.name, distance };
      }
    } else if (!bestRoad || distance < bestRoad.distance) {
      bestRoad = { name: feature.name, distance };
    }
  }

  if (bestPark) return `In ${bestPark.name}`;
  if (bestRoad) return `Near ${bestRoad.name}`;
  return null;
}

export function normalizeOverpassElements(
  elements: OverpassElement[],
  centerLatitude: number,
  centerLongitude: number,
  contextFeatures: NamedFeature[] = [],
): WaterSpot[] {
  const seen = new Set<string>();
  const spots: WaterSpot[] = [];

  for (const element of elements) {
    const coords = elementCoords(element);
    if (!coords) continue;

    const id = `${element.type}/${element.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const tags = element.tags ?? {};
    const type = spotType(tags);
    const displayName = buildDisplayName(tags, type);
    const locationHint =
      addressHint(tags) ??
      nearestHint(coords.latitude, coords.longitude, contextFeatures);

    spots.push({
      id,
      latitude: coords.latitude,
      longitude: coords.longitude,
      name: tags.name ?? null,
      type,
      tags,
      distanceMeters: Math.round(
        haversineMeters(
          centerLatitude,
          centerLongitude,
          coords.latitude,
          coords.longitude,
        ),
      ),
      displayName,
      locationHint,
    });
  }

  spots.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return spots;
}

async function postOverpass(
  query: string,
  signal?: AbortSignal,
): Promise<OverpassElement[]> {
  const body = new URLSearchParams({ data: query }).toString();
  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const endpointController = new AbortController();
    const onParentAbort = () => endpointController.abort();
    signal?.addEventListener("abort", onParentAbort, { once: true });
    const endpointTimer = setTimeout(
      () => endpointController.abort(),
      ENDPOINT_TIMEOUT_MS,
    );

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
          "User-Agent":
            "FindWater/0.1 (https://github.com/local/findwater; free drinking water finder)",
        },
        body,
        signal: endpointController.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        lastError = new Error(`Overpass request failed (${res.status})`);
        continue;
      }

      const data = (await res.json()) as OverpassResponse;
      return data.elements ?? [];
    } catch (err) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      // Endpoint-level abort/timeout → try the next mirror.
      lastError =
        err instanceof Error ? err : new Error("Overpass request failed");
    } finally {
      clearTimeout(endpointTimer);
      signal?.removeEventListener("abort", onParentAbort);
    }
  }

  throw lastError ?? new Error("Overpass request failed");
}

/** Best-effort only — never fails the water response. */
async function fetchContextFeatures(
  latitude: number,
  longitude: number,
  radius: number,
): Promise<NamedFeature[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTEXT_TIMEOUT_MS);
  try {
    const elements = await postOverpass(
      buildContextQuery(latitude, longitude, radius),
      controller.signal,
    );
    return parseNamedFeatures(elements);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNearbyWater(
  latitude: number,
  longitude: number,
  radius: number,
  signal?: AbortSignal,
): Promise<WaterSpot[]> {
  const waterElements = await postOverpass(
    buildOverpassQuery(latitude, longitude, radius),
    signal,
  );

  // Enrichment is optional and uses its own short timeout so it cannot
  // turn a successful water search into a timeout error.
  const contextFeatures =
    waterElements.length > 0
      ? await fetchContextFeatures(latitude, longitude, radius)
      : [];

  return normalizeOverpassElements(
    waterElements,
    latitude,
    longitude,
    contextFeatures,
  );
}
