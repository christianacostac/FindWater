import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/overpass", () => ({
  fetchLocationHint: vi.fn(),
}));

import { fetchLocationHint } from "@/lib/overpass";

const mockFetchLocationHint = vi.mocked(fetchLocationHint);

function hintRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/water/hint");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe("GET /api/water/hint", () => {
  beforeEach(() => {
    mockFetchLocationHint.mockReset();
  });

  it("returns 400 when coordinates are missing", async () => {
    const res = await GET(hintRequest({ latitude: "25.7" }));
    expect(res.status).toBe(400);
  });

  it("returns location hint on success", async () => {
    mockFetchLocationHint.mockResolvedValue("Near Brickell Ave");

    const res = await GET(
      hintRequest({ latitude: "25.7617", longitude: "-80.1918" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locationHint).toBe("Near Brickell Ave");
    expect(body.center).toEqual({ latitude: 25.7617, longitude: -80.1918 });
    expect(mockFetchLocationHint).toHaveBeenCalledWith(
      25.7617,
      -80.1918,
      expect.any(AbortSignal),
    );
  });

  it("returns null hint when none is found", async () => {
    mockFetchLocationHint.mockResolvedValue(null);

    const res = await GET(
      hintRequest({ latitude: "25.7617", longitude: "-80.1918" }),
    );

    const body = await res.json();
    expect(body.locationHint).toBeNull();
  });

  it("returns 502 when hint fetch fails", async () => {
    mockFetchLocationHint.mockRejectedValue(new Error("Overpass request failed"));

    const res = await GET(
      hintRequest({ latitude: "25.7617", longitude: "-80.1918" }),
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Overpass request failed/i);
  });
});
