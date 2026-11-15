import { haversineMeters } from "./distance";
import type { WaterSpot } from "./types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CONTEXT_MATCH_METERS = 80;
/** Small around-query for a single selected spot — cheaper than search-wide enrichment. */
const HINT_QUERY_RADIUS_M = 120;
/** Per-attempt budget — room for one silent retry under the route timeout. */
const HINT_ATTEMPT_TIMEOUT_MS = 3_500;
const HINT_RETRY_DELAY_MS = 300;
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

function buildHintQuery(latitude: number, longitude: number): string {
  const r = HINT_QUERY_RADIUS_M;
  return `
[out:json][timeout:6];
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

/** Free hint from tags already on the water element — no extra Overpass call. */
export function addressHintFromTags(
  tags: Record<string, string>,
): string | null {
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
      // Address tags only here; road/park hints load on select.
      locationHint: addressHintFromTags(tags),
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
            "FindWater/0.1 (https://github.com/christianacostac/FindWater; free drinking water finder)",
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Nearby named road/park for one spot. Used on-demand when the user selects
 * a result — keeps the main water search to a single Overpass round trip.
 *
 * Soft-fails after one silent retry: returns `null` when Overpass is down/slow
 * instead of throwing, so the spot list stays usable without a hint.
 */
export async function fetchLocationHint(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const attempt = async (): Promise<string | null> => {
    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    signal?.addEventListener("abort", onParentAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(),
      HINT_ATTEMPT_TIMEOUT_MS,
    );

    try {
      const elements = await postOverpass(
        buildHintQuery(latitude, longitude),
        controller.signal,
      );
      return nearestHint(latitude, longitude, parseNamedFeatures(elements));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onParentAbort);
    }
  };

  try {
    return await attempt();
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      await sleep(HINT_RETRY_DELAY_MS, signal);
      return await attempt();
    } catch (retryErr) {
      if (signal?.aborted || (retryErr instanceof Error && retryErr.name === "AbortError")) {
        throw new DOMException("Aborted", "AbortError");
      }
      // Optional enrichment — never fail the selected-spot UX over a hint.
      return null;
    }
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

  return normalizeOverpassElements(waterElements, latitude, longitude);
}
