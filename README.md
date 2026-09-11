# Airfield

A minimalist airport explorer with real ground reports. Run locally at http://127.0.0.1:4173/.

Search by name, city, IATA or ICAO; pan and zoom; select targets; filter aircraft, vehicles or moving traffic; pause updates; switch daylight/night.

## Live data

[ADSB.lol](https://www.adsb.lol/docs/open-data/api/) provides public ADS-B/MLAT positions, callsigns, registrations, aircraft types and ground speeds under ODbL. The server alternates ADSB.lol and [adsb.fi](https://github.com/adsbfi/opendata) every three seconds per active airport, with [OpenSky Network](https://openskynetwork.github.io/opensky-api/rest.html) as a fallback when the faster feeds fail or return no valid, fresh ground reports. Reports merge by aircraft identifier: only newer observation timestamps replace positions, motion fields stay together, and missing identity metadata is retained. Missing aircraft persist until their position is 60 seconds old. Implausible ground-position jumps are rejected. These use public APIs without a key, account or subscription. adsb.fi is for personal, noncommercial use with attribution. The UI names the selected source; OpenSky does not supply model or registration metadata. The provider requires a valid project contact in the request's User-Agent. `AIRFIELD_CONTACT` is configured in `.env.local`, read server-side and excluded from the browser bundle.

The shared traffic middleware caches airports for 3 seconds, deduplicates concurrent requests and spaces requests by at least six seconds per provider across airports. OpenSky is limited to one request every four minutes across the server to conserve its 400-credit anonymous daily quota (date-line queries consume two requests and wait eight minutes). Provider cooldowns are independent, so an unavailable primary does not block fallbacks. It honors Retry-After, including OpenSky’s quota-reset header, and applies exponential failure backoff up to five minutes. Access refusals wait an hour. A bounded disk cache at `.cache/traffic-cache.json` buffers server restarts. Last-known snapshots show their age and expire after ten minutes. Hidden or paused tabs stop polling.

Only ground reports with positions no older than 60 seconds at snapshot time are considered. Aircraft and ground vehicles within 250 metres of detailed mapped features appear; fixed transmitters are excluded. Runway-only geometry uses its bounding envelope plus 750 m to retain apron and stand reports. Without geometry, the vicinity is limited to 2 km. This is a proximity filter, not an authoritative airport boundary.

No simulated traffic is substituted. Destinations, gate assignments and boarding statuses are not supplied. Stationary does not imply parked at a gate. Receiver coverage is incomplete; parked aircraft can switch off transponders. Positions use a twelve-second delayed interpolation buffer. Motion only joins received reports; it never extrapolates. Gaps over 25 seconds, missing headings, turns over 25 degrees, implausible jumps and paths crossing mapped terminal/hangar edges skip smoothing. Small stationary jitter is suppressed. Pause freezes movement and requests; reduced-motion preferences use direct positions.

## Maps and symbols

OurAirports supplies 86,032 directory records, including closed facilities and fallback runway endpoints. OSM supplies geometry; snapshots for a curated set of 200 major active airports are bundled as separate static JSON files; other airports load via Overpass with a 15-second overall deadline, then show runway fallback or a retryable failure. Successful layouts persist in browser Cache Storage (up to 24 airports), so refreshes reuse saved geometry. Cached copies saved more than 30 days ago are refreshed in the background; saved copies older than 180 days are discarded. Browser eviction or private-mode restrictions can remove or disable this cache. OSM snapshot dates remain visible in Data & sources.

The bundle selection is a coverage set, **not an exact passenger ranking**. It includes ACI World's public 2025 top 20, a historical [OpenFlights connectivity](https://openflights.org/data.php) baseline, and current major hubs. The selection and source notes are in `scripts/airport-bundle-targets.json`. Layouts retain their OpenStreetMap timestamps and copyright notices; the maps and connectivity-derived selection are available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), with attribution to OpenStreetMap contributors and OpenFlights respectively.

The 2026-09-09 bundle contains 66.42 MB of layout files (12.81 MB summed gzip), adding 65.79 MB over the original Heathrow/Accra files. Individual layouts have a median gzip size of 53.1 KB and range from 10.6 to 238.1 KB. The generated identifier index is 1,514 bytes (721 bytes gzip). Sizes use decimal MB/KB; actual transfer sizes depend on the hosting compression.

Only the selected airport's layout is fetched; the browser JavaScript includes a small identifier index, never all 200 maps. Rebuild or resume the bundle with `node scripts/bundle-airport-maps.mjs`; existing valid files are reused. To refresh a snapshot, remove that specific `public/data/<ICAO>.json` file before rerunning. The collector spaces requests, honors rate limiting, rejects partial/undated or nonlocal geometry, and only regenerates `src/bundled-airports.js` after all 200 targets validate. `--boundary` uses a direct aeroway query with an exact ICAO/IATA boundary filter instead of generated Overpass areas; incomplete boundaries, holes, and neighboring airports are checked before saving. `--endpoint <url>` selects an alternate public Overpass provider. `--only KJFK,EGLL` limits collection; `--report <path>` records individual raw/gzip sizes. Run `node --test tests/bundled-layouts.test.mjs` to check all layouts and static-file loading.

Startup resolves the URL airport before loading any map or traffic. Without a valid URL airport, the last selection stored on the device is restored, then Heathrow is used as the default.

Supported silhouettes use nominal published dimensions in the airport's metre coordinates. The catalog covers 39 dimensioned types. Known silhouettes remain visible when heading is missing: a dotted ring marks the upright, unoriented view. Additional types share recognizable family silhouettes and approximate family footprints, including business jets, propeller aircraft, fighters and helicopters. Unknown types receive a generic aircraft silhouette instead of a dot. A local dictionary resolves 2,788 ICAO type names and aircraft classes. Rectangles mark ground vehicles with a consistent approximate 2.5 × 6 m footprint in map metres; the feed does not provide actual vehicle dimensions. Family silhouettes scale in map metres using representative dimensions; the UI labels them as approximate rather than claiming exact variant measurements. Individual aircraft configurations and antenna position can differ from the silhouette. AS50 and EC35 footprints use current H125/H135 nominal rotor diameter and D-value; the rotorcraft outlines are schematic, not model CAD. Night lighting is illustrative; this is not a navigation chart.

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
