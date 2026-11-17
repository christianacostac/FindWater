import { fetchLocationHint } from "@/lib/overpass";
import type { WaterApiError, WaterHintResponse } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

function parseNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hintResponse(
  latitude: number,
  longitude: number,
  locationHint: string | null,
): NextResponse<WaterHintResponse> {
  return NextResponse.json({
    locationHint,
    center: { latitude, longitude },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const latitude = parseNumber(searchParams.get("latitude"));
  const longitude = parseNumber(searchParams.get("longitude"));

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

  const controller = new AbortController();
  // Budget covers one Overpass attempt + one silent retry.
  const timeout = setTimeout(() => controller.abort(), 9_000);

  try {
    const locationHint = await fetchLocationHint(
      latitude,
      longitude,
      controller.signal,
    );
    return hintResponse(latitude, longitude, locationHint);
  } catch {
    // Hints are optional. Overpass downtime must not 502 the selected spot.
    return hintResponse(latitude, longitude, null);
  } finally {
    clearTimeout(timeout);
  }
}
