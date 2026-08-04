import { fetchNearbyWater } from "@/lib/overpass";
import type { WaterApiError, WaterApiResponse } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_RADIUS = 2000;
const MIN_RADIUS = 200;
const MAX_RADIUS = 10000;

function parseNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latitude = parseNumber(searchParams.get("latitude"));
  const longitude = parseNumber(searchParams.get("longitude"));
  const radiusParam = parseNumber(searchParams.get("radius"));

  if (latitude == null || longitude == null) {
    const body: WaterApiError = {
      error: "Query params latitude and longitude are required.",
    };
    return NextResponse.json(body, { status: 400 });
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    const body: WaterApiError = {
      error:
        "latitude must be between -90 and 90; longitude between -180 and 180.",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const radius = Math.min(
    MAX_RADIUS,
    Math.max(MIN_RADIUS, radiusParam ?? DEFAULT_RADIUS),
  );

  try {
    const controller = new AbortController();
    // Water-only budget; location hints use a separate short timeout.
    const timeout = setTimeout(() => controller.abort(), 22_000);

    try {
      const spots = await fetchNearbyWater(
        latitude,
        longitude,
        radius,
        controller.signal,
      );

      const body: WaterApiResponse = {
        spots,
        radius,
        center: { latitude, longitude },
      };
      return NextResponse.json(body);
    } finally {
      clearTimeout(timeout);
    }
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
