import { describe, expect, it } from "vitest";
import {
  addressHintFromTags,
  buildOverpassQuery,
  normalizeOverpassElements,
} from "./overpass";

describe("buildOverpassQuery", () => {
  it("includes center coordinates and radius", () => {
    const query = buildOverpassQuery(25.7617, -80.1918, 2000);
    expect(query).toContain("around:2000,25.7617,-80.1918");
    expect(query).toContain('amenity"="drinking_water"');
    expect(query).toContain('man_made"="drinking_fountain"');
    expect(query).toContain("out body center");
  });
});

describe("addressHintFromTags", () => {
  it("returns null when no street tag", () => {
    expect(addressHintFromTags({})).toBeNull();
  });

  it("formats street without house number", () => {
    expect(addressHintFromTags({ "addr:street": "Brickell Ave" })).toBe(
      "Near Brickell Ave",
    );
  });

  it("formats street with house number", () => {
    expect(
      addressHintFromTags({
        "addr:street": "Brickell Ave",
        "addr:housenumber": "100",
      }),
    ).toBe("Near 100 Brickell Ave");
  });
});

describe("normalizeOverpassElements", () => {
  const centerLat = 25.7617;
  const centerLon = -80.1918;

  it("sorts spots by distance from center", () => {
    const spots = normalizeOverpassElements(
      [
        {
          type: "node",
          id: 1,
          lat: centerLat + 0.001,
          lon: centerLon,
          tags: { amenity: "drinking_water" },
        },
        {
          type: "node",
          id: 2,
          lat: centerLat + 0.0002,
          lon: centerLon,
          tags: { amenity: "drinking_water" },
        },
      ],
      centerLat,
      centerLon,
    );

    expect(spots).toHaveLength(2);
    expect(spots[0].id).toBe("node/2");
    expect(spots[1].id).toBe("node/1");
    expect(spots[0].distanceMeters).toBeLessThan(spots[1].distanceMeters);
  });

  it("deduplicates elements with the same id", () => {
    const element = {
      type: "node",
      id: 42,
      lat: centerLat,
      lon: centerLon,
      tags: { amenity: "drinking_water" },
    };
    const spots = normalizeOverpassElements(
      [element, element],
      centerLat,
      centerLon,
    );
    expect(spots).toHaveLength(1);
  });

  it("uses named tags for displayName and addr tags for locationHint", () => {
    const spots = normalizeOverpassElements(
      [
        {
          type: "node",
          id: 7,
          lat: centerLat,
          lon: centerLon,
          tags: {
            amenity: "drinking_water",
            name: "Bayfront Fountain",
            "addr:street": "Biscayne Blvd",
          },
        },
      ],
      centerLat,
      centerLon,
    );

    expect(spots[0].displayName).toBe("Bayfront Fountain");
    expect(spots[0].locationHint).toBe("Near Biscayne Blvd");
    expect(spots[0].type).toBe("Drinking water");
  });

  it("reads coordinates from way center", () => {
    const spots = normalizeOverpassElements(
      [
        {
          type: "way",
          id: 99,
          center: { lat: centerLat, lon: centerLon },
          tags: { man_made: "drinking_fountain", operator: "City Parks" },
        },
      ],
      centerLat,
      centerLon,
    );

    expect(spots[0].id).toBe("way/99");
    expect(spots[0].displayName).toBe("City Parks");
    expect(spots[0].distanceMeters).toBe(0);
  });

  it("skips elements without coordinates", () => {
    const spots = normalizeOverpassElements(
      [{ type: "node", id: 1, tags: { amenity: "drinking_water" } }],
      centerLat,
      centerLon,
    );
    expect(spots).toHaveLength(0);
  });
});
