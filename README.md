# FindWater

Mobile-friendly web app that finds the **nearest free drinking water** near you using [OpenStreetMap](https://www.openstreetmap.org/) data via the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API).

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), allow location access, and nearby fountains will appear on the map and list.

If location is denied, tap the map to pin a search point, or use the downtown Miami shortcut.

## How data works

FindWater does not maintain its own fountain database for the MVP. It queries OSM tags around your coordinates:

- `amenity=drinking_water`
- `man_made=drinking_fountain`
- `amenity=fountain` + `drinking_water=yes`

API: `GET /api/water?latitude=…&longitude=…&radius=2000`

Results are sorted by walking distance (haversine). Unnamed spots get a **location hint** when possible (nearby named road or park from OSM), e.g. “Near Brickell Ave” or “In Bayfront Park”.

## Search radius

Use the stepped slider in the bottom sheet to choose **1 / 2 / 5 / 10 km** (default **2 km**). Sliding left shrinks the search; sliding right expands it. There are no fractional stops between those values.

## Results sheet

Drag the bottom sheet handle up or down to snap between peek and mid (~45% of the screen). When there are many spots, scroll the list inside the sheet. Tap a map marker to open the sheet to mid.

## Coverage caveat

OpenStreetMap coverage is uneven. Dense cities often have many mapped points; other areas may return **zero results even when water exists nearby**. An empty list means “nothing mapped in this radius,” not necessarily “no water.” Expanding the search radius can help when coverage is sparse.

## Stack

- Next.js (App Router) + TypeScript
- Leaflet + react-leaflet (OSM tiles)
- Overpass API (server route proxy)

## Later phases (not in MVP)

- Reviews / ratings
- Paid / cheapest bottled water options
- Native mobile app
