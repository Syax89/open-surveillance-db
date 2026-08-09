# Data sources (public sources)

Documentation of the **public data sources** for surveillance cameras and of
their legal compatibility with the project database (ODbL 1.0, ADR 0008).

| Document | Content | Status |
| --- | --- | --- |
| [censimento-fonti.md](censimento-fonti.md) | Census and ranking of candidate sources (municipal, governmental, OSM, civic projects) | updated 2026-08-08 (IT/AT/CH/DE/FR/ES/NL + USA/CA scan) |
| [licenze-compatibilita.md](licenze-compatibilita.md) | Licence compatibility matrix → import ODbL + attribution patterns for `/licenze` | updated 2026-08-08 |
| [normalizzazione-pipeline.md](normalizzazione-pipeline.md) | Normalisation design and import pipeline | updated 2026-08-08 |
| [keep-fonti-fresh.md](keep-fonti-fresh.md) | Runbook to keep `/fonti` aligned with imports (commit convention, verification, blocked-batch recovery) | new 2026-08-08 |
| [import registry](imports/) | One descriptor JSON per source (`docs/data-sources/imports/*.json`) | 37 descriptors |

## Import registry

The canonical registry of sources is the descriptor folder
[`docs/data-sources/imports/`](imports/): one JSON per source with the
source name/URL, licence, licence URL, attribution text and adapter slug.
Which batches are actually **committed** (published) and their record counts
live in the database (`import_batches`, only `committed` batches are public)
and are shown on the `/fonti` page — never reconstructed from the repo.

| Adapter slug | Source | Licence |
| --- | --- | --- |
| `amburgo-verkehrskameras-2026` | Freie und Hansestadt Hamburg — Verkehrskameras (Polizei Hamburg) | Datenlizenz Deutschland Namensnennung 2.0 (dl-de-by-2.0) |
| `berna-videouberwachung-2026` | Kanton Bern — Amt für Geoinformation (Videoüberwachung im öffentlichen Raum) | Open use. Attribution required (Kanton Bern) |
| `canada-drivebc-highwaycams-2026` | Province of British Columbia — DriveBC HighwayCams | OGL-BC |
| `canada-quebec-mtmd-cameras-2026` | Gouvernement du Québec — MTMD infos_cameras (réseau routier) | CC BY 4.0 |
| `finlandia-fintraffic-weathercam-2026` | Fintraffic — Digitraffic weathercam stations (tie.digitraffic.fi) | CC BY 4.0 |
| `francia-agen-cameras-2026` | Ville d'Agen — Caméra de vidéo protection | ODbL 1.0 |
| `francia-gpso-videoprotection-2026` | Territoire Grand Paris Seine Ouest — Vidéoprotection | Licence Ouverte 2.0 |
| `francia-pvpp-cameras-2026` | Ministère de l'Intérieur — Vidéoprotection, implantation des caméras (PVPP Paris) | Licence Ouverte 2.0 |
| `lussemburgo-cita-cameras-2026` | CITA Luxembourg — caméras du réseau autoroutier | CC0 |
| `milano-varchi-2026` | Comune di Milano — Open Data (dati.comune.milano.it) | CC BY 3.0 IT |
| `norvegia-nvdb-kamera-2026` | Statens vegvesen — NVDB vegobjekter type 163 (Kamera) | NLOD 2.0 |
| `osm-surveillance-austria-2026` | OpenStreetMap contributors | ODbL 1.0 (OSM) |
| `osm-surveillance-germania-2026` | OpenStreetMap contributors | ODbL 1.0 (OSM) |
| `osm-surveillance-italia-2026` | OpenStreetMap contributors | ODbL 1.0 (OSM) |
| `osm-surveillance-svizzera-2026` | OpenStreetMap contributors | ODbL 1.0 (OSM) |
| `paesi-bassi-amsterdam-verkeerscamera-2026` | Gemeente Amsterdam — Verkeersinformatiesystemen (VIS), verkeerscamera's | CC BY 4.0 |
| `paesi-bassi-utrecht-cameraregister-2026` | Gemeente Utrecht — Cameraregister Utrecht | CC0 1.0 |
| `regno-unito-plymouth-cctv-2026` | Plymouth City Council — CCTV Traffic Cameras | OGL 3.0 |
| `regno-unito-tfl-jamcams-2026` | Transport for London — JamCams CCTV | OGL 2.0 |
| `spagna-barcelona-cameras-2026` | Ajuntament de Barcelona — Inventari de càmeres de seguretat | CC BY 4.0 |
| `spagna-dgt-camaras-2026` | Dirección General de Tráfico — Cámaras de tráfico red estatal (NAP) | CC-BY |
| `spagna-madrid-camaras-2026` | Ayuntamiento de Madrid — Cámaras de videovigilancia vía pública (ZBEDEP + ZBE) | CC BY 4.0 |
| `ucraina-speed-cameras-2026` | Ukraine — Speed enforcement camera locations (data.gov.ua) | CC BY 4.0 |
| `usa-baltimore-atves-cameras-2026` | City of Baltimore — ATVES Automated Enforcement Cameras | Maryland public domain + attribution |
| `usa-baltimore-citiwatch-2026` | City of Baltimore — CitiWatch Camera Locations | Maryland public domain + attribution |
| `usa-boulder-redlight-cameras-2026` | City of Boulder CO — Red Light Cameras (public view) | CC0 |
| `usa-caltrans-cctv-2026` | California Department of Transportation — CalTrans Highway CCTV | CC BY 4.0 |
| `usa-ddot-traffic-cameras-2026` | District of Columbia — DDOT Traffic Cameras (open data) | CC BY 4.0 |
| `usa-denver-halo-cameras-2026` | Denver Police Department — HALO Cameras | CC BY 3.0 |
| `usa-mdot-chart-cameras-2026` | Maryland DOT — SHA CHART Traffic Cameras | Maryland public domain + attribution |
| `usa-mndot-snowplow-cameras-2026` | Minnesota Department of Transportation — AVL Plow Cam Images | CC BY 4.0 |
| `usa-new-orleans-traffic-cameras-2026` | City of New Orleans — Traffic Camera Locations (open data) | CC0 |
| `usa-ny-thruway-gantries-2026` | New York State Thruway Authority — Toll Gantries (E-ZPass) | NY Open Data policy |
| `usa-penndot-traffic-cameras-2026` | Pennsylvania Department of Transportation — PennDOT Traffic Cameras | PennDOT terms (redistribuzione consentita) |
| `usa-rochester-cameras-2026` | Rochester Police Department — Rochester Cameras (open data) | ODbL 1.0 |
| `usa-san-francisco-enforcement-cameras-2026` | City of San Francisco — Red Light & Speed Camera Citations (SFMTA) | PDDL |
| `zurigo-videokameras-2026` | Stadt Zürich — Open Data Zürich | CC0 1.0 |

## Operational constraints

- Every import must respect the **compatibility matrix** and the
  recommendations of `licenze-compatibilita.md`; cases marked «to be
  verified with legal» require legal approval before import.
- The **licence gate** (`scripts/import/licence-gate.mjs`) is **fail-closed**:
  a licence not on the whitelist (CC0, ODbL, CC-BY/LO with attribution,
  dl-de-by-2.0, CH open-use, OGL/NLOD/PDDL equivalents) blocks the whole
  import.
- Imported records use `source = 'import:<slug>'` verbatim (the runner owns
  the column; `scripts/import/runner.mjs`) and per-record attribution is
  resolved via `cameras.import_batch_id` → `import_batches`
  (`db/import-sources.ts`). The `/fonti` page exposes committed batches; the
  aggregated attribution lives in `/licenze` (section «Imported data
  sources»), kept aligned with `app/lib/data-license.ts` and the export
  headers.
- Per-batch attribution is persisted by the runner in the database
  (`import_batches.attribution_text` + a `report` JSON with run counters) —
  run reports are no longer kept as repo files; the database is the canonical
  source. Freshness runbook: [keep-fonti-fresh.md](keep-fonti-fresh.md).
