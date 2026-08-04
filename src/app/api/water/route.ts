import { fetchNearbyWater } from "@/lib/overpass";
import type { WaterApiError, WaterApiResponse } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_RADIUS = 1500;
const MIN_RADIUS = 200;
const MAX_RADIUS = 10000;

function parseNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseNumber(searchParams.get("lat"));
  const lon = parseNumber(searchParams.get("lon"));
  const radiusParam = parseNumber(searchParams.get("radius"));

  if (lat == null || lon == null) {
    const body: WaterApiError = {
      error: "Query params lat and lon are required.",
    };
    return NextResponse.json(body, { status: 400 });
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const body: WaterApiError = {
      error: "lat must be between -90 and 90; lon between -180 and 180.",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const radius = Math.min(
    MAX_RADIUS,
    Math.max(MIN_RADIUS, radiusParam ?? DEFAULT_RADIUS),
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28_000);

    const spots = await fetchNearbyWater(lat, lon, radius, controller.signal);
    clearTimeout(timeout);

    const body: WaterApiResponse = {
      spots,
      radius,
      center: { lat, lon },
    };
    return NextResponse.json(body);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Overpass request timed out. Try again in a moment."
        : err instanceof Error
          ? err.message
          : "Failed to fetch nearby water.";

    const body: WaterApiError = { error: message };
    return NextResponse.json(body, { status: 502 });
  }
}
