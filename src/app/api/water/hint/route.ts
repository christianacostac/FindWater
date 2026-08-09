import { fetchLocationHint } from "@/lib/overpass";
import type { WaterApiError, WaterHintResponse } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

function parseNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const locationHint = await fetchLocationHint(
        latitude,
        longitude,
        controller.signal,
      );
      const body: WaterHintResponse = {
        locationHint,
        center: { latitude, longitude },
      };
      return NextResponse.json(body);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Location hint timed out."
        : err instanceof Error
          ? err.message
          : "Failed to fetch location hint.";

    const body: WaterApiError = { error: message };
    return NextResponse.json(body, { status: 502 });
  }
}
