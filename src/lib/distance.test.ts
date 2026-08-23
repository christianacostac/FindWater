import { describe, expect, it } from "vitest";
import { formatDistance, haversineMeters } from "./distance";

describe("haversineMeters", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMeters(25.76, -80.19, 25.76, -80.19)).toBe(0);
  });

  it("computes a known short distance", () => {
    // ~111 m per 0.001° latitude at the equator
    const meters = haversineMeters(0, 0, 0.001, 0);
    expect(meters).toBeGreaterThan(100);
    expect(meters).toBeLessThan(120);
  });
});

describe("formatDistance", () => {
  it("formats sub-kilometer distances in meters", () => {
    expect(formatDistance(450)).toBe("450 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("formats kilometer distances with one decimal", () => {
    expect(formatDistance(1500)).toBe("1.5 km");
    expect(formatDistance(10000)).toBe("10.0 km");
  });
});
