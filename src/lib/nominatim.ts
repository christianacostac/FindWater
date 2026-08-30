import type { NominatimSearchItem, PlaceResult } from "./types";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  "FindWater/0.1 (https://github.com/christianacostac/FindWater; place search)";
const MAX_RESULTS = 5;

let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1100;

export function normalizeNominatimResults(
  items: NominatimSearchItem[],
): PlaceResult[] {
  const places: PlaceResult[] = [];

  for (const item of items) {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const label = item.display_name?.trim();
    if (!label) continue;

    const name =
      item.name?.trim() || label.split(",")[0]?.trim() || label;

    places.push({
      id: String(item.place_id),
      name,
      label,
      latitude,
      longitude,
    });

    if (places.length >= MAX_RESULTS) break;
  }

  return places;
}

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_INTERVAL_MS - elapsed),
    );
  }
  lastRequestAt = Date.now();
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  await waitForRateLimit();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(MAX_RESULTS));
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Place search failed (${res.status})`);
  }

  const data = (await res.json()) as NominatimSearchItem[];
  return normalizeNominatimResults(Array.isArray(data) ? data : []);
}

/** Test helper — reset server-side Nominatim throttle. */
export function resetNominatimRateLimit(): void {
  lastRequestAt = 0;
}
