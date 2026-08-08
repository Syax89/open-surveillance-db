# Open source and data licensing

## Software

The application source is licensed as `AGPL-3.0-or-later`. This keeps modified network-service versions available to the community. See [LICENSE](../LICENSE).

## Documentation

Unless a document says otherwise, project documentation is proposed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Contributors retain credit for their contributions under the repository's normal history.

## Database and exports

The public database needs an explicit license before it contains real records. **Decided 2026-07-31 ([ADR 0008](decisions/0008-data-licence-precision-retention-contact.md)): the database and every export format are licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/), with clear attribution and share-alike notices.** This choice must still be checked against jurisdictional rules, source terms, and the final data model before public beta.

## OpenStreetMap data

OpenStreetMap data is available under the [Open Database License](https://www.openstreetmap.org/copyright). Using an OSM map background does not automatically make every project record an OSM contribution. If data is imported from OSM, derived from it, or combined into a derivative database, the project must document the relationship, provide required attribution, and comply with ODbL obligations.

## Contributor promise

Contributors must submit only material they are entitled to share. They grant the project the rights needed to publish accepted code, documentation, and data under the relevant project license. Records are text metadata (location, kind, notes) only: the photo upload feature was **removed entirely on 2026-08-08** (CEO decision) — no image is accepted or stored by the application, and the previous R2 photo objects were retained without deletion (see [PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md) and [TERMS_OF_USE.md](TERMS_OF_USE.md)).
