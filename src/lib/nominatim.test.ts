import { describe, expect, it } from "vitest";
import { normalizeNominatimResults } from "./nominatim";

describe("normalizeNominatimResults", () => {
  it("maps Nominatim items to place results", () => {
    const places = normalizeNominatimResults([
      {
        place_id: 123,
        display_name: "Paris, Île-de-France, France",
        lat: "48.8566",
        lon: "2.3522",
        name: "Paris",
      },
    ]);

    expect(places).toEqual([
      {
        id: "123",
        name: "Paris",
        label: "Paris, Île-de-France, France",
        latitude: 48.8566,
        longitude: 2.3522,
      },
    ]);
  });

  it("caps results at five", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      place_id: i,
      display_name: `Place ${i}`,
      lat: "0",
      lon: String(i),
    }));

    expect(normalizeNominatimResults(items)).toHaveLength(5);
  });

  it("skips invalid coordinates", () => {
    const places = normalizeNominatimResults([
      {
        place_id: 1,
        display_name: "Bad",
        lat: "not-a-number",
        lon: "0",
      },
      {
        place_id: 2,
        display_name: "Good, Earth",
        lat: "1",
        lon: "2",
      },
    ]);

    expect(places).toHaveLength(1);
    expect(places[0].id).toBe("2");
  });

  it("falls back to first label segment when name is missing", () => {
    const places = normalizeNominatimResults([
      {
        place_id: 9,
        display_name: "Tokyo, Japan",
        lat: "35.68",
        lon: "139.76",
      },
    ]);

    expect(places[0].name).toBe("Tokyo");
  });
});
