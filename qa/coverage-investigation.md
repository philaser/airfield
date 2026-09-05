# Ground coverage investigation

Raw source timestamp: 2026-09-05T00:49:29.500000+00:00.

Schiphol: ADSB.lol returned 6 targets within ten nautical miles, all reporting ground status. There were two aircraft and four vehicles. The runway-only fallback previously showed two targets, excluding one aircraft and three vehicles on aprons or stands. The corrected runway vicinity filter retains all six captured reports. A regression test uses the actual captured sample. A later browser check with detailed OSM geometry showed one aircraft and three vehicles; live reception changes the count.

Accra: the raw source returned 0 targets before any frontend filtering. The empty airport view in this snapshot is a source coverage/data limitation, not evidence of an empty airport. This observation does not establish permanent receiver absence or airport traffic levels.

The UI now exposes raw count, reported-ground count and accepted count in Data & sources, and explains incomplete reception. A wider fallback envelope is explicitly described as vicinity rather than airport boundary. No airborne or fabricated traffic was added to make the airport seem busier.

Polling now targets ten seconds with the existing cache, request coalescing, global spacing and Retry-After/backoff behavior. This is a trial against a dynamically limited provider, not a guaranteed service interval.
