import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/overpass", () => ({
  fetchNearbyWater: vi.fn(),
}));

import { fetchNearbyWater } from "@/lib/overpass";

const mockFetchNearbyWater = vi.mocked(fetchNearbyWater);

function waterRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/water");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe("GET /api/water", () => {
  beforeEach(() => {
    mockFetchNearbyWater.mockReset();
  });

  it("returns 400 when latitude or longitude is missing", async () => {
    const res = await GET(waterRequest({ latitude: "25.7" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/latitude and longitude are required/i);
  });

  it("returns 400 for out-of-range coordinates", async () => {
    const res = await GET(
      waterRequest({ latitude: "95", longitude: "0", radius: "2000" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/between -90 and 90/i);
  });

  it("clamps radius to 200–10000 m", async () => {
    mockFetchNearbyWater.mockResolvedValue([]);

    await GET(
      waterRequest({
        latitude: "25.7617",
        longitude: "-80.1918",
        radius: "50",
      }),
    );
    expect(mockFetchNearbyWater).toHaveBeenCalledWith(
      25.7617,
      -80.1918,
      200,
      expect.any(AbortSignal),
    );

    await GET(
      waterRequest({
        latitude: "25.7617",
        longitude: "-80.1918",
        radius: "99999",
      }),
    );
    expect(mockFetchNearbyWater).toHaveBeenLastCalledWith(
      25.7617,
      -80.1918,
      10000,
      expect.any(AbortSignal),
    );
  });

  it("returns spots on success", async () => {
    mockFetchNearbyWater.mockResolvedValue([
      {
        id: "node/1",
        latitude: 25.7617,
        longitude: -80.1918,
        name: null,
        type: "Drinking water",
        tags: {},
        distanceMeters: 0,
        displayName: "Drinking water",
        locationHint: null,
      },
    ]);

    const res = await GET(
      waterRequest({
        latitude: "25.7617",
        longitude: "-80.1918",
        radius: "2000",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.radius).toBe(2000);
    expect(body.center).toEqual({ latitude: 25.7617, longitude: -80.1918 });
    expect(body.spots).toHaveLength(1);
  });

  it("returns 502 when Overpass fails", async () => {
    mockFetchNearbyWater.mockRejectedValue(new Error("Overpass request failed"));

    const res = await GET(
      waterRequest({
        latitude: "25.7617",
        longitude: "-80.1918",
        radius: "2000",
      }),
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Overpass request failed/i);
  });
});
