# ADR 0001: Separate reviewed public data from submissions

- **Status:** accepted
- **Date:** 2026-07-31

## Context

The project needs community reports but concerns surveillance and location data. Publishing every incoming report would create a serious privacy, accuracy, and abuse risk.

## Decision

New reports enter the database as `pending`. Public API responses and GeoJSON exports return only `verified` records, plus fictional `demo` records in development. Evidence and reviewer notes are never part of the public API.

## Consequences

- The project needs a moderation workflow before real submissions can be accepted.
- Publication is slower but safer and more credible.
- The implementation must prevent accidental status filtering regressions through tests and review.
