# Design QA

Final result: passed for the functional mockup scope, 2026-09-05.

## Reference and captures

- Approved reference: `../airfield-mockup.png`.
- Final daylight desktop: `qa/desktop.png` (997 × 1577).
- Final night desktop: `qa/night.png` (997 × 1577).
- Final night mobile: `qa/night-mobile.png` (390 × 844).

Compared rendered captures with the approved reference. Preserved the restrained palette, thin airport outlines, large airport code, open spacing, compact mono metadata and unboxed flight table. Real geographic geometry deliberately replaces the illustrative map. Real aircraft dimensions deliberately produce small silhouettes at the fit-to-airport view; zoom reveals their shape.

Night mode preserves the layout with a dark blue-black background, warm terminal outlines and subtle runway/taxiway lighting. Lighting is labeled illustrative. Desktop and mobile were inspected without horizontal overflow; mobile search moves to its own row.

## Verified behavior

- Search by code and city; keyboard selection, clearing, and no-results state.
- Heathrow and Accra bundled geometry; JFK geometry loaded through Overpass.
- Map zoom and reset; selectable aircraft and expandable flight rows.
- Moving/parked filters, pause and resume; animated positions change while running.
- Theme switching and persistence after reload.
- A320 selection displays its dimensions. Its on-screen footprint grew exactly 1.3× after a 1.3× map zoom, preserving scale with the airport.
- Browser error log was empty at the final verification.
- Seven geography and aircraft-scale tests passed; production build passed.

## Limits

OpenStreetMap and OurAirports coverage varies. Detail requests depend on public services. Silhouettes are simplified licensed artwork, with model-specific length and wingspan; two variants use calibrated family artwork. Aircraft movement and flight data are simulated. The app explains these distinctions and links artwork and data credits.

No blocking visual issues remain within this scope. This review does not certify live aviation data, survey accuracy or navigational use.

## Real-data integration — 2026-09-05

Final result: passed for public ground-report scope. This section supersedes the simulation behavior described above.

- Verified the running browser receives keyless ADSB.lol reports after configuring the provider-required server-side contact.
- Heathrow showed aircraft GDBCH and ground vehicle SQUID24. The vehicle filter and selection worked. Fixed TWR transmitters were excluded.
- JFK loaded its real geometry and dozens of ground reports; callsigns, registrations, types and speeds appeared in the table. Counts change with reception.
- Aircraft without supported silhouettes or orientation use dots; vehicles use distinct rectangles. No position extrapolation or fabricated flight metadata remains.
- The mobile live table fits a 390 px viewport with a measured scroll width of 390 px. Capture: `qa/live-mobile.png`.
- Twelve geography, scale and live-data tests passed, including concurrent-request deduplication, cache hits, global rate-limit cooldown, Retry-After, invalid data, and stale snapshot expiry. Production build passed. Browser error log was empty.
- The theme toggle retains its fixed width. The app remains local, with live data served by Vite middleware; the static hosting worker has not been adapted.

Coverage, nominal silhouettes, proximity association and missing destination/gate details are disclosed in the UI and README. Last-known data can remain visible for up to ten minutes with an age label; this is not a complete inventory of airport traffic.


## Expanded aircraft and rotorcraft catalog — 2026-09-05

Final result: passed. The catalog contains 35 dimensioned types and a bundled dictionary of 2,788 type identities. The live JFK browser check rendered 40 calibrated silhouettes and zero dots in that particular snapshot. Three reports had missing headings, visibly marked with a dotted ring around an upright silhouette. Counts and type coverage depend on incoming reports.

Helicopter identification is tested independently of emitter category, with EC35, R44 and category-only A7 fixtures; ground vehicles remain distinct. AS50/H125 and EC35/H135 use schematic, dimensioned rotor envelopes. Other helicopter types receive a category symbol, explicitly not to scale. No helicopter was injected into the live traffic stream. Component specimens were visually checked separately in `qa/model-review.html` and captured in `qa/model-review.png`.

Fifteen tests passed, including visible path bounds, short/long E175 wings, rotor diameter/overall length, type identification and missing heading. Production build passed. These are simplified family shapes, not exact model CAD; that limitation and source references are shown in the credits and dimensional catalog.

## Buffered motion, coverage correction and arriving types — 2026-09-05

Final result: passed. Polling/cache freshness is ten seconds. Rendering uses measured positions with a ten-second buffer; there is no extrapolation. Long report gaps, unknown heading, sharp turns, implausible jumps and segments intersecting mapped terminals/hangars skip interpolation. Small stationary jitter is held still. Pause was verified by comparing every marker transform across browser observations; all were unchanged. Live moving transforms changed while running. Reduced-motion handling uses direct positions.

The Schiphol runway-only regression is fixed: all six targets in the captured raw sample survive the wider fallback vicinity filter (previously two). The later live browser displayed one aircraft and three vehicles using detailed geometry. Accra's raw feed and browser both had zero reports, with explicit messaging that this does not mean an empty airport. See `qa/coverage-investigation.md` for the bounded evidence and source timestamp.

New dots were identified as B744, B752 and A359. Those types plus B748 now have calibrated family silhouettes, taking the dimensioned catalog to 39. The final JFK browser check had no unknown-aircraft dots and no console errors. Twenty-three tests and the production build passed.

## Loading and presence transitions — 2026-09-05

Final result: passed. Airport geometry stays unmounted behind “Loading airport details…” until detailed loading resolves or the request reaches its labeled fallback. A fresh LFPG navigation was verified with aria-busy=true and no airport SVG while loading; the completed map used the map-arrive animation. Existing live rows keep stable positions in the list.

New and disappearing targets use independent opacity animations on both SVG markers and table rows. Browser component checks in `qa/presence-review.html` measured matching intermediate opacity for the SVG/table entry (0.704) and exit (0.488), then confirmed both were removed. Reappearing reports cancel pending removal. Airport changes reset presence state, preventing old-airport ghosts. Reduced-motion CSS skips the fades. Eight focused presence/motion tests passed and the app's browser error log was empty.
