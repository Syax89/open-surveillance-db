# Data sources (fonti pubbliche)

Documentazione sulle **fonti pubbliche** di dati di videosorveglianza e sulla
loro compatibilità legale con il database del progetto (ODbL 1.0, ADR 0008).

| Documento | Contenuto | Stato |
| --- | --- | --- |
| [censimento-fonti.md](censimento-fonti.md) | Censimento e ranking delle fonti (portali comunali, governativi, OSM, progetti civici) | aggiornato al 2026-08-08 (scan IT/AT/CH/DE/FR/ES/NL) |
| [licenze-compatibilita.md](licenze-compatibilita.md) | Matrice di compatibilità licenze → import ODbL + pattern di attribuzione per la pagina `/licenze` | aggiornato al 2026-08-08 |
| [normalizzazione-pipeline.md](normalizzazione-pipeline.md) | Design della normalizzazione e della pipeline di import | aggiornato al 2026-08-08 |
| [keep-fonti-fresh.md](keep-fonti-fresh.md) | Runbook per mantenere `/fonti` allineata agli import (convenzione di commit, verifica, recovery batch bloccati) | nuovo 2026-08-08 |
| [roadmap import](imports/) | Descriptor JSON per ogni fonte (`docs/data-sources/imports/*.json`) | 14 descriptor live |

## Fonti importate (2026-08-08)

| # | Fonte | Paese | Formato | Record | Licenza | Adapter |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | OpenStreetMap `surveillance=camera` | Italia | Overpass JSON | ~7.9k | ODbL 1.0 | `osm-surveillance-italia-2026` |
| 2 | OpenStreetMap `surveillance=camera` | Austria | Overpass JSON | ~7.1k | ODbL 1.0 | `osm-surveillance-austria-2026` |
| 3 | OpenStreetMap `surveillance=camera` | Svizzera | Overpass JSON | ~4.9k | ODbL 1.0 | `osm-surveillance-svizzera-2026` |
| 4 | OpenStreetMap `surveillance=camera` | Germania | Overpass JSON | ~45.8k | ODbL 1.0 | `osm-surveillance-germania-2026` |
| 5 | Milano — varchi ZTL/telecamere | Italia | CSV | 213 | CC BY 3.0 IT / IODL 2.0 | `milano-varchi-2026` |
| 6 | Zurigo — Videokameras | Svizzera | GeoJSON | 134 | CC0 | `zurigo-videokameras-2026` |
| 7 | Kanton Bern — Videoüberwachung | Svizzera | GeoParquet | 76 | Uso libero + attribuzione | `berna-videouberwachung-2026` |
| 8 | Amburgo — Verkehrskameras (Polizia) | Germania | OGC API GeoJSON | 18 | dl-de-by-2.0 | `amburgo-verkehrskameras-2026` |
| 9 | GPSO Grand Paris Seine Ouest — Vidéoprotection | Francia | ODS GeoJSON | 446 | Licence Ouverte 2.0 | `francia-gpso-videoprotection-2026` |
| 10 | Ministère de l'Intérieur — PVPP Paris | Francia | KML | 1339 | Licence Ouverte 2.0 | `francia-pvpp-cameras-2026` |
| 11 | Ville d'Agen — Caméras | Francia | CSV | 123 | ODbL 1.0 | `francia-agen-cameras-2026` |
| 12 | DGT NAP — Cámaras red estatal | Spagna | DATEX2 XML | 1942 | CC-BY | `spagna-dgt-camaras-2026` |
| 13 | Ayuntamiento de Madrid — ZBEDEP+ZBE | Spagna | CSV | 578 | CC BY 4.0 | `spagna-madrid-camaras-2026` |
| 14 | Ajuntament de Barcelona — Inventari càmeres | Spagna | CSV | 163 | CC BY 4.0 | `spagna-barcelona-cameras-2026` |
| 15 | Gemeente Utrecht — Cameraregister | Paesi Bassi | XLSX | 372 | CC0 1.0 | `paesi-bassi-utrecht-cameraregister-2026` |
| 16 | Gemeente Amsterdam — VIS Verkeerscamera | Paesi Bassi | API HAL JSON | 334 | CC BY 4.0 | `paesi-bassi-amsterdam-verkeerscamera-2026` |

Vincoli operativi:

- Ogni import deve rispettare la **matrice di compatibilità** e le
  raccomandazioni di `licenze-compatibilita.md`; i casi marcati
  «da verificare con legale» richiedono l'ok del legale prima dell'import.
- Il **licence-gate** (`scripts/import/licence-gate.mjs`) è **fail-closed**:
  una licenza non in whitelist (CC0, ODbL, CC-BY/LO con attribuzione,
  dl-de-by-2.0, uso libero CH) blocca l'intero import.
- I record importati usano `source = 'import:<slug>'` verbatim (il runner
  possiede la colonna; `scripts/import/runner.mjs`) e l'attribuzione per
  record è risolta via `cameras.import_batch_id` → `import_batches`
  (`db/import-sources.ts`). La pagina `/fonti` espone i batch committed;
  l'attribuzione aggregata vive in `/licenze` (sezione «Fonti dei dati
  importati») mantenuta allineata con `app/lib/data-license.ts` e con gli
  header delle esportazioni.
- L'attribuzione per singolo batch è persistita dal runner nel DB
  (`import_batches.attribution_text` + `report` JSON con i contatori del
  run) — i report non vivono più come file nel repo (docs-cleanup #352);
  la fonte canonica è il database. Runbook per la freschezza:
  [keep-fonti-fresh.md](keep-fonti-fresh.md).
