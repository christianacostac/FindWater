# Project Logs

## 2026-08-09 — API Latency & Caching

### Problem

The current API calls are taking a significant amount of time, which is creating noticeable delays in the UI when retrieving water-fountain locations.

### Current API Flow

```text
Browser
└─ GET /api/water?lat&lon&radius
   └─ Overpass water query
      1. Try overpass-api.de (up to 12 seconds)
      2. If it fails → overpass.kumi.systems (up to 12 seconds)
   └─ Return water-fountain locations
      └─ Results displayed on the list/map

When a spot is selected (including auto-nearest):

└─ GET /api/water/hint?lat&lon
   └─ Small Overpass query around the selected spot (~120m)
   └─ "Near..." information is populated
```

### Current Investigation

I'm investigating ways to reduce the amount of time required to retrieve water-fountain data.

One possibility is implementing a **cache**.

**Cache:** A small temporary storage area that holds previously retrieved data so it can be accessed faster instead of making the same request again.

I'm also considering whether the search radius can be handled more efficiently.

For example:

* User searches within 2 km.
* User expands the search to 5 km.
* Instead of making an entirely new request for the full 5 km, could the application retrieve only the additional 3 km of coverage?

If this is feasible, it could reduce unnecessary API calls and improve response time.

### Short-Term Decision

For the current MVP, I am going to implement a **short-term cache**.

The goal is to improve the UI flow by avoiding unnecessary calls to the Overpass API when the application already has recently retrieved data.

Since this is still an MVP, I'm prioritizing a practical improvement that can be implemented quickly rather than designing a more complex caching or geographic-query system immediately.

Over time, I can expand the cached coverage as users search larger areas.

### TTL

**TTL (Time to Live):** The amount of time a cached result is considered valid before it expires and the application retrieves fresh data.

The TTL will allow the application to benefit from cached results while still periodically refreshing the data.

### Next Steps

* [ ] Implement short-term caching.
* [ ] Determine an appropriate TTL.
* [ ] Measure API response time before caching.
* [ ] Measure API response time after caching.
* [ ] Test repeated searches within the same area.
* [ ] Test expanding the search radius.
* [ ] Investigate whether existing 2 km coverage can be reused when expanding to 5 km.
* [ ] Determine whether cached geographic coverage can be combined over time.

### What I'm Learning

The initial implementation focused on getting the functionality working. Now that the MVP is usable, I'm beginning to identify performance bottlenecks and evaluate how caching and smarter API usage can improve the user experience while reducing unnecessary external requests.

## 2026-08-23 - API Latency & Caching Testing 

### What I am testing

I am adding several tests for the MVP before deploying onto production. The tests focus on the following: 

```text
npm run check
├── lint          → "Is the code valid?"
├── test (31)     → "Does our logic do the right thing?"
│   ├── distance      (4)  pure math used everywhere in the project
│   ├── overpass      (9)  OSM → spots 
│   ├── waterCache    (9)  session cache
│   ├── /api/water    (5)  route + mocked Overpass
│   └── /api/water/hint (4) route + mocked Overpass
└── build         → "Does it compile for production?"
```

Once I have validated that these checks pass, I will go ahead and push and deploy onto production. My guess is that due to the API calls taking a good amount to respond, we will see a lot more issues once it is deployed onto Vercel. 