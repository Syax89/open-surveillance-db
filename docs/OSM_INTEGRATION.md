# OpenStreetMap integration

## Current use

The local prototype displays map tiles from `tile.openstreetmap.org` through Leaflet and includes OpenStreetMap attribution in the map control. This is appropriate for local development and demonstration, not an automatic production-scale solution.

## Production requirements

Before public launch, the project must:

1. Keep visible OpenStreetMap attribution and link it to the copyright notice.
2. Read and comply with the current [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
3. Use a stable, identifiable application user agent/referrer where the chosen platform allows it.
4. Avoid bulk downloading, offline prefetching, or using the community tile service as an unlimited production CDN.
5. Choose a sustainable option: a compliant third-party map provider, a paid hosted service, or self-hosted tiles with appropriate operational capacity.

## Mapping project data

OpenSurveillanceDB should maintain its own reviewed records and provenance. It should not write user reports into OpenStreetMap automatically. Any future import/export relationship with OSM needs a documented community discussion, tag mapping, license analysis, and a reversible workflow.

## Attribution checklist

- Map UI includes © OpenStreetMap contributors.
- Public documentation explains the map source and its license.
- Exports distinguish OpenSurveillanceDB records from any OSM-sourced material.
- Brand and attribution follow the relevant provider and OSM Foundation guidance.
