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
      `  ${spot.distanceMeters}m | ${spot.type} | ${spot.name ?? "(unnamed)"}`,
    );
  }
}

await hit(
  "Miami",
  "http://localhost:3000/api/water?lat=25.7617&lon=-80.1918&radius=3000",
);
await hit(
  "Amsterdam",
  "http://localhost:3000/api/water?lat=52.3676&lon=4.9041&radius=1500",
);
