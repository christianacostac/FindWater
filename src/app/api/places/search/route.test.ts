import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/nominatim", () => ({
  searchPlaces: vi.fn(),
}));

import { searchPlaces } from "@/lib/nominatim";

const mockSearchPlaces = vi.mocked(searchPlaces);

function placeRequest(q: string) {
  return new NextRequest(
    `http://localhost/api/places/search?q=${encodeURIComponent(q)}`,
  );
}

describe("GET /api/places/search", () => {
  beforeEach(() => {
    mockSearchPlaces.mockReset();
  });

  it("returns 400 for short queries", async () => {
    const res = await GET(placeRequest("a"));
    expect(res.status).toBe(400);
  });

  it("returns up to five places on success", async () => {
    mockSearchPlaces.mockResolvedValue([
      {
        id: "1",
        name: "Paris",
        label: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
      },
    ]);

    const res = await GET(placeRequest("paris"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.places).toHaveLength(1);
    expect(mockSearchPlaces).toHaveBeenCalledWith("paris", expect.any(AbortSignal));
  });

  it("returns 502 when Nominatim fails", async () => {
    mockSearchPlaces.mockRejectedValue(new Error("Place search failed (503)"));

    const res = await GET(placeRequest("paris"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Place search failed/i);
  });
});
