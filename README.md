# Airfield

A minimalist airport explorer with real ground reports. Run locally at http://127.0.0.1:4173/.

Search by name, city, IATA or ICAO; pan and zoom; select targets; filter aircraft, vehicles or moving traffic; pause updates; switch daylight/night.

## Live data

[ADSB.lol](https://www.adsb.lol/docs/open-data/api/) provides public ADS-B/MLAT positions, callsigns, registrations, aircraft types and ground speeds under ODbL. This uses a public API without a key, account or subscription. The provider requires a valid project contact in the request's User-Agent. `AIRFIELD_CONTACT` is configured in `.env.local`, read server-side and excluded from the browser bundle.

The Vite middleware caches airports for 10 seconds, deduplicates concurrent requests and spaces upstream requests by at least five seconds across airports. It honors Retry-After and applies exponential failure backoff up to five minutes. Access refusals wait an hour. A bounded disk cache at `.cache/traffic-cache.json` buffers server restarts. Last-known snapshots show their age and expire after ten minutes. Hidden or paused tabs stop polling.

Only ground reports with positions no older than 60 seconds at snapshot time are considered. Aircraft and ground vehicles within 250 metres of detailed mapped features appear; fixed transmitters are excluded. Runway-only geometry uses its bounding envelope plus 750 m to retain apron and stand reports. Without geometry, the vicinity is limited to 2 km. This is a proximity filter, not an authoritative airport boundary.

No simulated traffic is substituted. Destinations, gate assignments and boarding statuses are not supplied. Stationary does not imply parked at a gate. Receiver coverage is incomplete; parked aircraft can switch off transponders. Positions use a ten-second delayed interpolation buffer. Motion only joins received reports; it never extrapolates. Gaps over 25 seconds, missing headings, turns over 25 degrees, implausible jumps and paths crossing mapped terminal/hangar edges skip smoothing. Small stationary jitter is suppressed. Pause freezes movement and requests; reduced-motion preferences use direct positions.

## Maps and symbols

OurAirports supplies 86,032 directory records, including closed facilities and fallback runway endpoints. OSM supplies geometry; Heathrow and Accra snapshots are bundled, other airports load via Overpass.

Supported silhouettes use nominal published dimensions in the airport's metre coordinates. The catalog covers 39 dimensioned types. Known silhouettes remain visible when heading is missing: a dotted ring marks the upright, unoriented view. A dot marks unsupported fixed-wing types; unsupported helicopters receive a rotorcraft category symbol. A local dictionary resolves 2,788 ICAO type names and aircraft classes. Rectangles mark ground vehicles with a consistent approximate 2.5 × 6 m footprint in map metres; the feed does not provide actual vehicle dimensions. Unsupported aircraft category symbols remain screen-sized. Individual aircraft configurations and antenna position can differ from the silhouette. AS50 and EC35 footprints use current H125/H135 nominal rotor diameter and D-value; the rotorcraft outlines are schematic, not model CAD. Night lighting is illustrative; this is not a navigation chart.

## Run and verify

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
cp .env.example .env.local
# Set AIRFIELD_CONTACT to your public email or project contact URL.
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

```sh
node --test tests/*.test.mjs
npm run build
npm run preview -- --host 127.0.0.1 --port 4174
```

Both Vite dev and preview install the traffic middleware. The production Node server serves the built app and the same traffic endpoint:

```sh
npm run build
npm start
```

It listens on `0.0.0.0` using `PORT` (default `10000`) and exposes `/healthz`. `render.yaml` defines a free Render web service in Frankfurt with automatic deploys disabled. It uses the public repository URL as `AIRFIELD_CONTACT`; set that variable to another public project contact when deploying a fork. Create the service from the Blueprint in Render, then trigger deploys manually.

Field definitions: [readsb](https://github.com/wiedehopf/readsb/blob/dev/README-json.md). Map sources: [OpenStreetMap](https://www.openstreetmap.org/copyright), [OurAirports](https://ourairports.com/data/). Artwork and dimension credits: `public/aircraft/credits.html`.

## Airport local time

Every directory record now carries an IANA timezone resolved offline using the comprehensive exact polygon dataset from geo-tz 8.1.8 (timezone-boundary-builder / OSM). Rebuild after updating the airport directory or geographic timezone database with `node scripts/enrich-timezones.mjs`. No runtime timezone API or browser polygon download is required. Browser Intl supplies current civil-time and daylight-saving rules; an outdated browser can have outdated rules.

86,011 of 86,032 records resolve; 21 overlapping boundary records deliberately display “Local time unavailable.” Chinese aviation uses Beijing time when Shanghai and Urumqi overlap. Unknown/unsupported zones never silently use UTC. See `qa/implementation-audit.md` for the remaining implementation limitations.

Point-only airport discovery now checks nearby OSM aeroway geometry within 1.8 km after an empty area lookup. It requires exactly one aerodrome/heliport with matching name or identifier, rejecting ambiguous neighboring facilities. Old Orchard (2NK9) regression fixture contains its real runway and 15 hangars; the directory has no fallback endpoints for it.

Closed facilities are labeled in search and the airport heading. Source keywords preserve former-code lookup (for example 2NK1 → US-9898). Closure is attributed to OurAirports. A successful empty map search shows “Location known. Outline unavailable.” Request failures show “Map temporarily unavailable.” Neither implies closure.
