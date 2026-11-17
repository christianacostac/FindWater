import { searchPlaces } from "@/lib/nominatim";
import type { PlaceApiError, PlaceSearchResponse } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < MIN_QUERY_LENGTH) {
    const body: PlaceApiError = {
      error: `Query must be at least ${MIN_QUERY_LENGTH} characters.`,
    };
    return NextResponse.json(body, { status: 400 });
  }

  if (q.length > MAX_QUERY_LENGTH) {
    const body: PlaceApiError = {
      error: `Query must be at most ${MAX_QUERY_LENGTH} characters.`,
    };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const places = await searchPlaces(q, controller.signal);
      const body: PlaceSearchResponse = { places };
      return NextResponse.json(body);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Place search timed out."
        : err instanceof Error
          ? err.message
          : "Failed to search places.";

    const body: PlaceApiError = { error: message };
    return NextResponse.json(body, { status: 502 });
  }
}
