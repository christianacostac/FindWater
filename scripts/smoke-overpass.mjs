const q = `[out:json][timeout:25];
(node(around:1500,52.3676,4.9041)["amenity"="drinking_water"];);
out body;`;

async function tryEndpoint(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
      "User-Agent":
        "FindWater/0.1 (https://github.com/local/findwater; free drinking water finder)",
    },
    body: new URLSearchParams({ data: q }).toString(),
  });
  const text = await res.text();
  console.log(url, "status", res.status, "bytes", text.length);
  console.log(text.slice(0, 250));
}

(async () => {
  await tryEndpoint("https://overpass-api.de/api/interpreter");
  await tryEndpoint("https://overpass.kumi.systems/api/interpreter");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
