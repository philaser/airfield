# Airfield implementation audit — 5 September 2026

Scope: frontend, directory and map loading, aircraft identity and scale, traffic middleware, polling, movement, and hosting scaffold. Source inspection plus local tests; not an exhaustive worldwide survey of live airport coverage.

## Fixed in this pass

- Removed the ten-airport timezone whitelist and silent UTC fallback. All 86,032 directory coordinates were processed against geo-tz 8.1.8's comprehensive geographic boundaries. 86,011 resolve; 21 overlapping boundary records explicitly show local time unavailable. Browser Intl handles DST and fractional offsets. Missing or unsupported zones are never relabeled as local UTC.
- Detailed geometry no longer requires a runway to be accepted: mapped aprons, taxiways, terminals, hangars and parking positions can load independently. This fixes a validation shortcut; it does not solve all heliport discovery limitations below.
- Empty maps no longer claim to show runway outlines. Polling copy now says “about every 10s,” and no longer claims smoothing is active while paused or under reduced-motion preferences.

## Remaining shortcuts, prioritized

| Priority | Finding and evidence | Effect / next correction |
|---|---|---|
| High | `src/data.js:getGeometry` looks up only an OSM aerodrome with `icao=directory.id`, then its mapped area. | Directory IDs are not always ICAO identifiers. Heliports and facilities without a matching tagged area can lack detail even when OSM contains it. Add bounded coordinate-based facility discovery with identity verification; include heliport/helipad geometry. |
| High | `src/data.js:mapFeatures` treats relation member ways as separate shapes, ignoring outer/inner roles and stitching. | Complex terminal footprints and courtyards can be incomplete or incorrectly filled. Assemble OSM multipolygons before rendering and obstacle checks. |
| High | `src/App.jsx:FeatureLayer` assumes a 45 m runway width when absent; `parseFloat` does not interpret tagged units. | An accurate centreline can acquire an invented or incorrectly converted footprint. Parse units and render an explicit centreline when width is unknown. |
| Medium | `src/data.js:getGeometry` always prefers bundled Heathrow/Accra snapshots; in-memory geometry has no expiry. | Maps cannot receive subsequent changes during normal use. Introduce timestamp-aware refresh with a clearly labeled last-known map fallback. The bundled airport, runway, type and timezone directories also require regeneration; they are not live datasets. |
| Medium | `src/live-traffic.js:nearAirport` uses 250 m proximity, a runway envelope plus 750 m, or a 2 km radius. Server requests use a fixed 10 nautical mile radius. | Nearby off-airport reports may appear and outlying airport traffic may be omitted. These are documented filters, not actual airport boundary membership. Prefer validated aerodrome polygons and a radius derived from their bounds. |
| Medium | `src/AircraftSilhouette.jsx`, model catalog: 39 calibrated types, simplified family artwork, two schematic rotorcraft footprints; others use category symbols/dots. | Nominal type dimensions do not establish the exact airframe configuration. Vehicles and fallback markers are not to scale. Expand verified dimensions/artwork; retain honest unknown markers. |
| Medium | `src/live-traffic.js` uses reported track when true heading is missing; SVG centres are placed on reported coordinates. | Direction of movement may differ from nose direction during towing; antenna location is not necessarily aircraft centre. Label track-derived orientation and avoid implying precise nose/gate clearance. |
| Medium | `src/traffic-motion.js` interpolates straight segments and checks terminal/hangar intersections; no taxiway routing or apron obstacle model. | Motion is bounded by real reports, but curves can be cut. This is smoothing, not a measured continuous route. Keep the delay disclosure and conservative turn/gap checks. |
| Medium | `worker/index.js` only serves static assets. Live traffic exists in `vite.config.mjs` middleware. | Local dev/preview work; a static deployment would not supply `/api/traffic`. Implement equivalent server caching/contact handling before a separately authorized deployment. |
| Low | `src/App.jsx` initially renders Heathrow before resolving the URL from the directory; `src/styles.css` hides the clock below 650 px. | Deep links can briefly show the default header; mobile omits time entirely. Gate airport identity on directory resolution and decide a compact mobile clock layout. |
| Low | Search scores/sorts the full 86,032-record directory on each keystroke. | Works locally but could stutter on slower devices. Precompute searchable text and profile before adding indexing. |

## External limits, not fabricated data

ADSB.lol receiver coverage is incomplete, and parked aircraft can stop transmitting. No alternative inventory is invented for quiet airports. Feed failures retain visibly last-known snapshots for up to ten minutes, so a displayed target is not a guarantee it is still present. Aircraft schedules, destinations and gate assignments are not available in this feed.

## Timezone provenance and maintenance

Geographic lookup uses [geo-tz](https://github.com/evansiroky/node-geo-tz) with [timezone-boundary-builder](https://github.com/evansiroky/timezone-boundary-builder) data. The generated names are included in the airport directory; the large polygon database remains a development dependency. China uses Beijing aviation time where Shanghai/Urumqi polygons overlap, following [CAAC AIP GEN 2.1](https://yinlei.org/x-plane10/doc/GEN.pdf). The 21 unresolved boundary records remain explicit unknowns rather than arbitrary first matches. Browser timezone rules can age independently of geographic boundaries.

Regenerate with `node scripts/enrich-timezones.mjs` after updating either source. The script prints unresolved IDs and candidate zones.

## Verification

30 automated tests passed, including worldwide zones, Kathmandu's quarter-hour offset, northern/southern DST, the New York spring clock jump, unknown-zone behavior, geography, traffic caching/filtering, physical silhouette ratios, motion and presence. Production build passed. Browser check: Mumbai displays local time with GMT+5:30 after selecting it through airport search.

## Follow-up: vehicle scale and Old Orchard

Fixed vehicle screen-size inflation: the rectangle is now an approximate 2.5 × 6 m map footprint, while invisible hit areas remain easy to select. Actual vehicle dimensions remain unknown. Fixed point-only discovery for identity-matched single-airport vicinities; Old Orchard’s OSM node has neither ICAO tag nor area, but nearby geometry includes one grass runway and 15 hangars. A bounded 1.8 km fallback now loads those features and rejects mismatched/ambiguous facilities. Remaining map lookup limitations in the table are therefore partially addressed, not fully eliminated.
