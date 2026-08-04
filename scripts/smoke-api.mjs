async function hit(label, url) {
  const res = await fetch(url);
  const data = await res.json();
  console.log(label, "status", res.status);
  if (data.error) {
    console.log("error:", data.error);
    return;
  }
  console.log(label, "count", data.spots.length, "radius", data.radius);
  for (const spot of data.spots.slice(0, 5)) {
    console.log(
      `  ${spot.distanceMeters}m | ${spot.displayName} | ${spot.locationHint ?? spot.type}`,
    );
  }
}

await hit(
  "Miami",
  "http://localhost:3000/api/water?latitude=25.7617&longitude=-80.1918&radius=3000",
);
await hit(
  "Amsterdam",
  "http://localhost:3000/api/water?latitude=52.3676&longitude=4.9041&radius=1500",
);
