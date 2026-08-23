import { describe, expect, it, beforeEach } from "vitest";
import type { WaterSpot } from "./types";
import {
  WATER_CACHE_TTL_MS,
  bucketCoord,
  clearWaterCache,
  patchWaterCacheHint,
  projectSpotsForCenter,
  readWaterSearch,
  rememberWaterSearch,
  waterCacheKey,
} from "./waterCache";

const CENTER = { latitude: 25.7617, longitude: -80.1918 };

function spot(
  id: string,
  latitude: number,
  longitude: number,
  distanceMeters: number,
): WaterSpot {
  return {
    id,
    latitude,
    longitude,
    name: null,
    type: "Drinking water",
    tags: { amenity: "drinking_water" },
    distanceMeters,
    displayName: "Drinking water",
    locationHint: null,
  };
}

describe("waterCacheKey", () => {
  it("buckets coordinates into stable keys", () => {
    expect(waterCacheKey(25.76171, -80.19181, 2000)).toBe(
      waterCacheKey(25.76172, -80.19182, 2000),
    );
  });
});

describe("readWaterSearch", () => {
  beforeEach(() => {
    clearWaterCache();
  });

  it("returns null on cache miss", () => {
    expect(readWaterSearch(CENTER.latitude, CENTER.longitude, 2000)).toBeNull();
  });

  it("returns exact match within TTL", () => {
    const spots = [spot("node/1", CENTER.latitude, CENTER.longitude, 0)];
    rememberWaterSearch(CENTER.latitude, CENTER.longitude, 2000, spots);

    const cached = readWaterSearch(CENTER.latitude, CENTER.longitude, 2000);
    expect(cached).toHaveLength(1);
    expect(cached?.[0].id).toBe("node/1");
  });

  it("filters a larger cached radius when shrinking", () => {
    const near = spot("node/near", CENTER.latitude + 0.001, CENTER.longitude, 100);
    const far = spot("node/far", CENTER.latitude + 0.03, CENTER.longitude, 3000);
    rememberWaterSearch(CENTER.latitude, CENTER.longitude, 5000, [near, far]);

    const cached = readWaterSearch(CENTER.latitude, CENTER.longitude, 2000);
    expect(cached?.map((s) => s.id)).toEqual(["node/near"]);
  });

  it("misses when requesting a larger radius than cached", () => {
    rememberWaterSearch(CENTER.latitude, CENTER.longitude, 2000, [
      spot("node/1", CENTER.latitude, CENTER.longitude, 0),
    ]);

    expect(readWaterSearch(CENTER.latitude, CENTER.longitude, 5000)).toBeNull();
  });

  it("expires entries after TTL", () => {
    rememberWaterSearch(CENTER.latitude, CENTER.longitude, 2000, [
      spot("node/1", CENTER.latitude, CENTER.longitude, 0),
    ]);

    const staleNow = Date.now() + WATER_CACHE_TTL_MS + 1;
    expect(
      readWaterSearch(CENTER.latitude, CENTER.longitude, 2000, staleNow),
    ).toBeNull();
  });
});

describe("patchWaterCacheHint", () => {
  beforeEach(() => {
    clearWaterCache();
  });

  it("updates locationHint on cached spots", () => {
    rememberWaterSearch(CENTER.latitude, CENTER.longitude, 2000, [
      spot("node/1", CENTER.latitude, CENTER.longitude, 0),
    ]);

    patchWaterCacheHint("node/1", "Near Brickell Ave");
    const cached = readWaterSearch(CENTER.latitude, CENTER.longitude, 2000);
    expect(cached?.[0].locationHint).toBe("Near Brickell Ave");
  });
});

describe("projectSpotsForCenter", () => {
  it("recomputes distances and filters by radius", () => {
    const near = spot("node/near", 25.762, -80.1918, 0);
    const far = spot("node/far", 25.8, -80.1918, 0);

    const projected = projectSpotsForCenter(
      [near, far],
      CENTER.latitude,
      CENTER.longitude,
      2000,
    );

    expect(projected.map((s) => s.id)).toEqual(["node/near"]);
    expect(projected[0].distanceMeters).toBeGreaterThan(0);
  });
});

describe("bucketCoord", () => {
  it("rounds to ~220 m cells", () => {
    expect(bucketCoord(25.76171)).toBe(bucketCoord(25.76172));
    expect(bucketCoord(25.76171)).not.toBe(bucketCoord(25.765));
  });
});
