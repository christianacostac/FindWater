#Project Logs 

8/9/2026
#Current API calls going in these amount of seconds. 

Cache = small temporary storage space that holds data to access it faster in the future.

Trying to wonder if I can get the time down by using some sort of cache or some way to only get the rest of the water fountains, if we went from 2km to 5km, if we can get only the 3km remaining to take time off from the current call. 

Browser
  └─ GET /api/water?lat&lon&radius
        └─ Overpass water query
              1) try overpass-api.de  (up to 12s)
              2) if fail → overpass.kumi.systems (up to 12s)
        └─ return spots  ← list/map show here

Then, when a spot is selected (incl. auto-nearest):
  └─ GET /api/water/hint?lat&lon
        └─ small Overpass around that spot (~120m)
        └─ “Near …” fills in

Going to try this short term cache. I want it to support the flow in the UI, as it's taking a lot of time to go in and make the call to the API. As this is an MVP at the moment, I will go ahead and go with this for now, and stored coverage over time. 

TTL = Time to Live, or how long a cached result is considered valid until we throw it again and fetch again. 


