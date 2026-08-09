# Census of public sources — surveillance cameras

**Worker:** project owner (Simone Rondina)
**Verification date:** 2026-08-04 (direct checks on APIs/portals, see § 2)
**Task:** PUBLIC SOURCES #1 — Census (`t_3edaf673`)
**Status:** ready for review (technical + privacy/legal review for the flagged licence cases)
**Dependencies:** [README.md](README.md) (workstream index); the licence-compatibility matrix is in
[licenze-compatibilita.md](licenze-compatibilita.md) (SOURCES #2) — this document applies the verdicts
per source and does **not** duplicate the matrix.

> The project database is released under **ODbL 1.0** (ADR 0008). For each source the compatibility
> verdict is given according to the one-way permissive→share-alike rule of
> `licenze-compatibilita.md` § 2. Cases marked «to be verified with legal» require privacy/legal
> approval before any import (operational constraint of the workstream README).

---

## 1. Executive summary

**Outcome:** **26 sources** surveyed and evaluated (10 Italian, 12 EU/CH/UK, 2 European aggregators, 2 civic/research projects).
**Verified via direct API** (not just the portal page): 20 of 26 — coordinates, fields and licences read
directly from the datasets. **Top 5 by quality/feasibility:** Zürich (CC0), Milan (CC BY, GeoJSON),
Madrid (CC BY 4.0), OpenStreetMap `surveillance=*` (ODbL), Amsterdam (CC0/WFS).

### Ranking table

| # | Source | Country | Format | Licence (verified) | Lat/Lon | Updated | Score |
|---|-------|---------|--------|--------------------|:-------:|---------|------:|
| 1 | Zürich — Videokameras Stadtverwaltung | CH | CSV/GPKG/SHP/JSON/WFS/WMS | **CC0** | ✅ | 2026-07 (portal) | **10** |
| 2 | Milan — Area C + Area B gates | IT | GeoJSON/SHP/CSV | CC BY (3.0 IT, to confirm) | ✅ | 2026-05/07 | **9** |
| 3 | Madrid — videovigilancia + traffico + ZBE + carteles + foto-rojo | ES | CSV/KML/XLS/Geo | **CC BY 4.0** | ✅ (KML/Geo) | 2026-06/07 | **9** |
| 4 | OpenStreetMap — `surveillance=*` | GLO | Overpass / Geofabrik extracts | **ODbL 1.0** (identical to our DB) | ✅ | live (crowdsourced) | **9** |
| 5 | Amsterdam — Cameragebieden + privacy map | NL | WFS/CSV/GeoJSON | **CC0 / Public Domain** | ✅ | live (WFS) | **8.5** |
| 6 | France — Vidéoprotection implantation (Min. Intérieur) | FR | KML/ODS (+historical SHP) | **Licence Ouverte 2.0 (fr-lo)** | ✅ (KML) | snapshot 2018-11 | **8** |
| 7 | UK — Runnymede CCTV Cameras | UK | **Live WFS** + CSV/SHP/XLS/WMS | **OGL v3** | ✅ | 2026-04 | **8** |
| 8 | UK — TfL JamCams (London) | UK | JSON API (882 points) | OGL (v2 base, registration) | ✅ | live | **8** |
| 9 | UK — Plymouth CCTV Cameras | UK | GeoJSON/CSV | **OGL v3** | ✅ | 2024-12 | **8** |
| 10 | Bologna — list of gates | IT | GeoJSON/CSV/Opendatasoft API | CC BY 4.0 (to confirm on portal) | ✅ | live (passage data 15') | **7.5** |
| 11 | UK — York CCTV Cameras | UK | CSV/KML/GeoJSON | **OGL-UK-3.0** | ✅ | 2020-02 | **7** |
| 12 | Rome — RSM ZTL gates (ArcGIS) | IT | Feature Service (GeoJSON/CSV) | undeclared (⚠️) | ✅ | varies per dataset | **7** |
| 13 | Barcelona — Inventari càmeres de seguretat | ES | (catalog API) | **CC BY 4.0** | ⚠️ to verify | n/d | **7** |
| 14 | Bern — Videoüberwachung öffentlicher Raum | CH | GPKG/PARQUET | to verify (OGD Bern) | ✅ | 2026-07 | **7** |
| 15 | Geneva — Infomobilité caméras de trafic | CH | WFS/GML/KML/SHP/CSV | to verify (CC BY expected) | ✅ | 2026-07 | **7** |
| 16 | UK — Leicester CCTV Cameras | UK | Opendatasoft API (csv/geojson/parquet…) | **undeclared** (⚠️) | ✅ | 2026-06 | **6.5** |
| 17 | Turin — ZTL perimeter, gates and hours | IT | XML (5T feed) | CC BY | ✅ (gates) | 2021-05 (metadata) | **6** |
| 18 | MIT — speed-detection device list (velox) | IT | JSON (4106 records) | undeclared (⚠️) | ❌ | 2025-10+ (updated) | **6** |
| 19 | dati.gov.it (national catalogue) | IT | DCAT-AP / SPARQL / UI | per-dataset (IODL/CC BY) | depends | live | **5.5** |
| 20 | data.europa.eu (EU aggregator) | EU | DCAT-AP EU / UI | per-dataset | depends | live | **5.5** |
| 21 | Paris — Emplacements caméras (BO 2019) | FR | (historical dataset) | **notspecified** (⚠️) | ✅ | 2019 | **5** |
| 22 | Surveillance under Surveillance | GLO | viewer (OSM data) | ODbL (reuses OSM) | ✅ | live | **5** |
| 23 | Ministero dell'Interno — videosurveillance funding | IT | page/PDF (not a dataset) | n/a (amministrazione trasparente) | ❌ | n/d | **4** |
| 24 | Regione Toscana — traffic monitoring | IT | KMZ/SHP/TIF | **CC BY-SA** (⚠️ incompatible) | ❌ (not cameras) | n/d | **4** |
| 25 | Atlas of Surveillance (EFF) | US | CSV | to verify (EFF) | ❌ (agency-level) | 2026 | **4** |
| 26 | Rome — dati.comune.roma.it (portal) | IT | custom portal | per-dataset | depends | live | **4** |

**Score** = weighted average of: reusable licence (30%), machine-readable format/API (20%), coordinates
present (20%), freshness (15%), quality/coverage (15%). It is a *QA/import feasibility* judgement,
not a legal opinion.

---

## 2. Methodology

- Checks run on **2026-08-04** with direct calls to the endpoints (not just web pages):
  - **CKAN API** `package_search`/`package_show` on: dati.comune.milano.it, aperto.comune.torino.it,
    datos.madrid.es, data.gov.uk, data.stadt-zuerich.ch, opendata.swiss, opendata-ajuntament.barcelona.cat;
  - **Opendatasoft API** (`/api/explore/v2.1`) on Bologna;
  - **ArcGIS REST API** (sharing REST + FeatureService) on Rome Servizi per la Mobilità;
  - **REST API** on TfL (`/Place/Type/JamCam`), MIT (`/dispositivi/data`), data.gouv.fr (`/api/1/datasets`),
    Amsterdam (`/v1/wfs/…cameratoezicht`), dati.gov.it (UI), Taginfo/Overpass (OSM);
  - **Sample data downloads** (GeoJSON/CSV/KML/XML) to verify the real fields, not just the catalogue.
- **Reliability of claims:** the licences and fields reported are those read from the API/resource at
  the verification date. Where the direct check failed (403, bot-block, non-public endpoint) or the
  field is not exposed, it is marked **«to verify»/«undeclared»** and nothing was invented.
- Known limitation: some portals (dati.gov.it, data.europa.eu, govdata.de, dati.comune.roma.it) expose
  JS-rendered search or undocumented APIs; for these the sheet documents UI access and the aggregation
  value, not a specific dataset.

---

## 3. Detailed sheets

> Sheet field legend: **URL** main resources/APIs · **Format** · **Fields** (verified on real data) ·
> **Licence** (exact, as read) · **Freshness** · **Coverage** · **Quality** · **ODbL compatibility**
> (verdict per `licenze-compatibilita.md`) · **QA notes**.

### 3.1 Zürich — Aktuelle Auflistung von Videokameras der Stadtverwaltung Zürich (⭐ TOP)

- **Authority:** Stadt Zürich (Open Data Zürich) — tabular dataset `prd_stez_liste_videokameras_stadtverwaltung` + geodata variant `geo_aktuelle_auflistung_von_videokameras…`.
- **URL:** https://data.stadt-zuerich.ch/dataset/prd_stez_liste_videokameras_stadtverwaltung · WFS:
  `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Aktuelle_Auflistung_von_Videokameras_der_Stadtverwaltung_Zuerich?SERVICE=WFS&REQUEST=GetCapabilities` · direct CSV: `…/download/liste_videokameras_stadtverwaltung.csv`
- **Format:** CSV, DXF, GPKG, JSON, SHP, WFS, WMS, WMTS.
- **Fields (verified on the CSV):** `standort_beschreibung`, `adresse_beschreibung`, **`lat`, `lon`**,
  `anzahl_kameras_aussen`, `anzahl_kameras_innen`, `anzahl_kameras_gsa`, `bereich_detail_beschreibung`,
  `aufbewahrungsdauer` (retention period!), `verantwortliche_da` (data controller),
  `rechtsgrundlage_url` (legal basis). ✅ **The richest dataset in the census.**
- **Licence:** **CC0 1.0** (`license_id: cc-zero`, `http://www.opendefinition.org/licenses/cc-zero`).
- **Freshness:** metadata 2026-07 (portal); «aktuell» dataset (current list).
- **Coverage:** City of Zürich cameras (administration), external/internal/sensitive areas.
- **Quality:** excellent — explicit coordinates, per-site counts, retention and legal basis per record.
- **ODbL compatibility:** ✅ importable **with no obligations** (CC0 → § 3.3 matrix); good practice to cite the source.
- **QA notes:** the WFS endpoint with the exact typename returns 500 with wrong parameters — use GetCapabilities
  to discover the typename; the direct CSV is reliable. To verify: any third-party content in the dataset
  (CC0 caution, matrix § 3.3).

### 3.2 Milan — Area C and Area B gates (cameras)

- **Authority:** Comune di Milano — Open Data portal (CKAN).
- **URL:** Area C https://dati.comune.milano.it/it/dataset/ds82_infogeo_varchi_elettronici_localizzazione_ ·
  Area B https://dati.comune.milano.it/dataset/ds959-varchi-areab
- **Format:** GeoJSON, SHP (zip), CSV for both.
- **Area C fields (verified on GeoJSON):** `id_amat`, `label` (gate name), Point [lon, lat] (CRS84).
  Area B fields: `id`, `nome`, `stato` (gate active/inactive), point geometry.
- **Licence:** `cc-by` (Creative Commons Attribution — opendefinition link); the Milan portal historically
  adopts **CC BY 3.0 IT** — **confirm the version** at import time (HTML page behind bot-block 403 for agents,
  CKAN API clean).
- **Freshness:** Area C `metadata_modified` 2026-07-22; Area B 2026-05-08.
- **Coverage:** Area C electronic gates (Bastions ring + public transport) and Area B (ZTL access) — active access-control cameras.
- **Quality:** high — clean, fresh coordinates, dual vector format.
- **ODbL compatibility:** ✅ importable **with attribution** (CC BY → § 3.2 matrix; indicate modifications).
- **QA notes:** the dataset describes the **gates** (access-control points), not all municipal cameras;
  for the import map `label`→gate name and keep `id_amat` as the source id.

### 3.3 Madrid — cameras (5 complementary datasets)

- **Authority:** Ayuntamiento de Madrid — datos abiertos portal (CKAN), all **CC BY 4.0**.
- **URL/datasets:**
  - Cámaras de videovigilancia en la vía pública: https://datos.madrid.es/portal/site/egob (dataset `300429-0-camaras-videovigilancia`) — CSV/XLS/PDF, updated 2026-07-24;
  - Carteles informativos de zonas de videovigilancia: `300244-0-carteles-videovigilancia` (signage panels!);
  - Tráfico. Cámaras: `202088-0-trafico-camaras` — **KML** with points + live image links (`informo.madrid.es`);
  - Tráfico: Madrid ZBE. Cámaras: `300654-0-circulacion-camaras-trafico` — CSV/XLSX/ZIP, 2026-07-31;
  - ZBEDEP Distrito Centro. Cámaras y calles: `300229-0-trafico-madrid-central` — CSV/Geo/KMZ/ZIP, 2026-07-31;
  - Semáforos con control foto-rojo: `205193-0-semaforos-foto-rojo` (red-light cameras!).
- **Videovigilancia fields (verified on CSV):** `ID Cámara`, `Tipo` (DOMO/FIJA…), `Ubicación` (text),
  `Resolución`, `Zoom Óptico`, `Año Adquisición`. ⚠️ **the tabular CSV has NO lat/lon** — the coordinates
  are in the geographical formats of the tráfico datasets (KML/Geo) and in the portal map view.
- **Licence:** **CC BY 4.0** (`license_id` verified on CKAN).
- **Freshness:** 2026-06/07/08 (active datasets, some updated monthly).
- **Coverage:** Madrid vía pública (hundreds of cameras), traffic network, ZBE/ZBEDEP, signage, red-light.
- **Quality:** high for the geographic datasets; the videovigilancia CSV requires geocoding the `Ubicación`.
- **ODbL compatibility:** ✅ importable **with attribution** (CC BY 4.0 → § 3.2).
- **QA notes:** verify the CSV encoding (Latin-1; header shows mojibake characters if read as UTF-8).

### 3.4 OpenStreetMap — `surveillance=*` tag

- **Authority:** OSM community (collaborative data).
- **URL:** wiki https://wiki.openstreetmap.org/wiki/Key:surveillance · Taginfo
  https://taginfo.openstreetmap.org/keys/surveillance · Overpass https://overpass-api.de ·
  extracts: https://download.geofabrik.de
- **Format:** OSM extracts (PBF/GeoJSON via Overpass/Geofabrik), Overpass API.
- **Fields:** tag `surveillance=indoor|outdoor|public`, `surveillance:*` namespace
  (`camera:type`, `camera:mount`, `camera:direction`, `camera:angle`, `operator`, `operator:wikidata`,
  `recording`, `source`, `start_date`…), point/way/area geometry.
- **Licence:** **ODbL 1.0** — identical to our DB (ADR 0008).
- **Freshness:** continuous (crowdsourced); uneven quality, very variable density (strong in
  DE/NL/CH, partial in IT).
- **Coverage:** global; de facto tag with standardised values.
- **Quality:** good where mapped; needs **filtering** (only `surveillance=public`/outdoor of civic interest,
  no private indoor) and dedup against other sources.
- **ODbL compatibility:** ✅ importable (same licence → § 3.4 matrix); attribution
  «© OpenStreetMap contributors» + link; for the import **do not use the OSM API** for bulk downloads
  (policy) → Geofabrik/Planet extract or Overpass with caution.
- **QA notes:** the public Overpass instance rate-limits large queries (verified: whole-Italy bbox →
  suspicious response/limits); use per-city bboxes or regional extracts. Taginfo counts must be read live.

### 3.5 Amsterdam — Cameragebieden and privacy map

- **Authority:** Gemeente Amsterdam.
- **URL:** https://data.overheid.nl/en/dataset/tqdi9wr-xugg2a (Cameragebieden) · point map
  https://maps.amsterdam.nl/privacy/ («Persoonsgevoelige dataverwerking in de openbare ruimte», with
  downloadable GeoJSON datasets).
- **Format:** WFS (`https://api.data.amsterdam.nl/v1/wfs/overlastgebieden/?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=cameratoezicht&OUTPUTFORMAT=csv`), CSV, HTML.
- **WFS fields (verified):** `id`, `geometry` (multipolygon, SRID 28992/RD), `type`, `typering`, `soort`,
  `url`, `oov_naam`, `oov_code`, `geldigheid_periode`, `geldigheid_specificatie` (validity period of the
  mayor's decision).
- **Licence:** **Public domain (CC0 / Public Domain Mark 1.0)** — verified on data.overheid.nl.
- **Freshness:** live WFS (operational data).
- **Coverage:** Amsterdam cameratoezicht zones (polygons) + point datasets from the privacy map.
- **Quality:** high (official zones with decision basis); for camera points use the privacy map (lnglat GeoJSON).
- **ODbL compatibility:** ✅ importable **with no obligations** (CC0 → § 3.3).
- **QA notes:** the WFS returns geometries in **RD New (EPSG:28992)** — needs reprojection to WGS84;
  `OUTPUTFORMAT=csv` returns WKT, convenient for QA.

### 3.6 France — Vidéoprotection, implantation des caméras (Ministère de l'Intérieur)

- **Authority:** Ministère de l'Intérieur (national PVPP dataset).
- **URL:** https://www.data.gouv.fr/fr/datasets/videoprotection-implantation-des-cameras-kml-ods/ (KML+ODS
  version from Min. Intérieur) · historical SHP/PDF variant: `…/videoprotection-implantation-des-cameras/`.
- **Format:** **KML** (cartographic) + **ODS** (list); historical version SHP+PDF (2014).
- **KML fields:** camera points with name/address; ODS: PVPP camera list.
- **Licence:** **Licence Ouverte 2.0 (`fr-lo`)** — permissive (equivalent to IODL/CC BY, attribution).
- **Freshness:** ⚠️ snapshot **2018-11-15** for the KML/ODS version; the fork variant dates to 2014.
  National dataset no longer updated continuously.
- **Coverage:** France (videosurveillance cameras on public roads).
- **Quality:** good as a historical snapshot; obsolescence risk to assess (many installations since 2018).
- **ODbL compatibility:** ✅ importable **with attribution** (Licence Ouverte 2.0 — permissive; treat it
  like CC BY/IODL, matrix § 3.1/3.2; legal confirmation recommended).
- **QA notes:** verify the exact version (2014 vs 2018) and the encoding; no operator/direction fields.

### 3.7 UK — Runnymede CCTV Cameras (live WFS)

- **Authority:** Runnymede Borough Council (data.gov.uk).
- **URL:** https://data.gov.uk/dataset/cctv-cameras3 · WFS:
  `https://maps.runnymede.gov.uk/geoserver/wfs?service=WFS&request=GetFeature&typeName=community:cctv_cameras&outputFormat=csv`
  (also SHP zip, XLS; WMS for the basemap).
- **Format:** **live WFS** + CSV/SHP/XLS/WMS.
- **Fields:** point geometry + CCTV attributes (from GetCapabilities; verify at import).
- **Licence:** **OGL v3** (`uk-ogl`, nationalarchives v3 link).
- **Freshness:** `metadata_modified` 2026-04-30.
- **Coverage:** CCTV cameras of the Runnymede district.
- **Quality:** high — active WFS service, multi-format.
- **ODbL compatibility:** ✅ importable **with attribution** (OGL — permissive, attribution + link;
  matrix § 3.1/3.2 by analogy; legal confirmation recommended for the first OGL import).

### 3.8 UK — TfL JamCams (London)

- **Authority:** Transport for London (Unified API).
- **URL:** `https://api.tfl.gov.uk/Place/Type/JamCam` (JSON) — 882 cameras (verified).
- **Format:** public JSON REST API (no key for light use).
- **Fields (verified):** `commonName` (location name), `lat`, `lon`, plus metadata (id, image URL).
- **Licence:** OGL (base v2.0; **TfL terms require registration** for full reuse — odimpact
  TfL case; confirm on api-portal.tfl.gov.uk).
- **Freshness:** live.
- **Coverage:** London road network (public traffic cameras).
- **Quality:** high for coverage and API; no type/operator field beyond the name.
- **ODbL compatibility:** ✅ with attribution (OGL) — **before import** verify the TfL
  registration terms (not a plain download).
- **QA notes:** a high-volume use requires an API key (registration); the data is «traffic cameras»,
  not security videosurveillance — relevant to the project scope.

### 3.9 UK — Plymouth CCTV Cameras

- **Authority:** Plymouth City Council.
- **URL:** https://data.gov.uk/dataset/cctv-locations-in-plymouth
- **Format:** GeoJSON + 5 CSVs (CCTV, car parking, help points, traffic, redeployable cameras).
- **Fields:** point geometry; for CSVs: name/locality (verify at import).
- **Licence:** **OGL v3** (`uk-ogl`).
- **Freshness:** 2024-12-02.
- **Coverage:** Plymouth CCTV cameras (including redeployable ones).
- **Quality:** good; 2016 dataset (released 2016, metadata 2024) — verify currency on the ground.
- **ODbL compatibility:** ✅ with attribution (OGL v3).

### 3.10 Bologna — gate list (Sirio/ZTL cameras)

- **Authority:** Comune di Bologna — Open Data (Opendatasoft).
- **URL:** https://opendata.comune.bologna.it/explore/dataset/varchi-bologna/ · API:
  `https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/varchi-bologna/exports/geojson`
- **Format:** GeoJSON/CSV/JSON + Opendatasoft API (multiple exports).
- **Fields (verified on GeoJSON):** `identificativo_varco`, `attivo` (Y/N), `nome_varco`, `descrizione`
  (address), `direzione`, `tipologia_varco` (ZTL…), `inizio_attivita`, links `dati_totali`/`dati_20xx`
  (per-gate passages, 15' cadence), geometry **Point [lon,lat]**.
- **Licence:** **CC BY 4.0** by convention of the Bologna portal — **to confirm** on the dataset page
  (the API does not expose `license` in the metas; verify at import).
- **Freshness:** gates dataset stable; passage data updated (15' cadence).
- **Coverage:** all Bologna ZTL electronic gates (Sirio system).
- **Quality:** high — clean coordinates, type and direction per gate, link to the flows.
- **ODbL compatibility:** ✅ with attribution (CC BY 4.0 expected → § 3.2); confirm licence before import.

### 3.11 UK — York CCTV Cameras

- **Authority:** City of York Council.
- **URL:** https://data.gov.uk/dataset/cctv-cameras4
- **Format:** CSV/KML/GeoJSON (ArcGIS Open Data).
- **Fields:** point geometry + CCTV attributes.
- **Licence:** **OGL-UK-3.0**.
- **Freshness:** 2020-02-13 (⚠️ dated).
- **Coverage:** York CCTV.
- **Quality:** medium (2020 positions, to reconfirm).
- **ODbL compatibility:** ✅ with attribution (OGL v3).

### 3.12 Rome — Roma Servizi per la Mobilità, ZTL gates (ArcGIS)

- **Authority:** Roma Servizi per la Mobilità S.r.l. (company of the City of Rome).
- **URL:** https://data-rsm.opendata.arcgis.com/ (e.g. dataset «ZTL Testaccio - varchi di ingresso»,
  `41037e0a9f06431ba39304fe42b3f371`; other ZTL/Fascia Verde gates).
- **Format:** **ArcGIS Feature Service** (GeoJSON/CSV via REST: `?f=geojson`), ArcGIS Hub portal.
- **Fields:** point geometry of the gates + attributes (street name, direction — from GetFeature).
- **Licence:** **not explicitly declared** on the portal (`licenseInfo` empty) ⚠️ — **to verify with
  legal** before import (matrix § 3.6 custom/no licence; art. 52 CAD as a possible basis).
- **Freshness:** varies per dataset (some active).
- **Coverage:** Rome ZTL gates (historic centre, Testaccio, Fascia Verde…).
- **Quality:** good (official positions from the mobility company); third parties reuse it (e.g. romaztl.altervista.org with CC BY 3.0 IT — unofficial site).
- **ODbL compatibility:** ⚠️ case by case — clarify licence/terms with RSM before import.

### 3.13 Barcelona — Inventari de càmeres de seguretat

- **Authority:** Ajuntament de Barcelona.
- **URL:** https://opendata-ajuntament.barcelona.cat (datasets `infraestructures-inventari-cameres` +
  `infraestructures-tipologia-suports-cameres`).
- **Format:** portal CKAN API (`/data/api/3/action/…`); resources to verify.
- **Fields:** security-camera inventory of the infrastructure (support typology in a separate dataset).
- **Licence:** **CC BY 4.0** (verified on CKAN).
- **Freshness:** n/d (verify at import).
- **Coverage:** Barcelona municipal infrastructure.
- **Quality:** medium (technical inventory; verify presence of coordinates).
- **ODbL compatibility:** ✅ with attribution (CC BY 4.0 → § 3.2).

### 3.14 Bern — Videoüberwachung im öffentlichen Raum

- **Authority:** Canton Bern / Stadt Bern (geofiles.be.ch).
- **URL:** https://opendata.swiss/it/dataset/videouberwachung-im-offentlichen-raum (resources:
  `https://geofiles.be.ch/geoportal/pub/download/VIDEO/video.gpkg.zip`, `…video_video.parquet`).
- **Format:** GPKG, PARQUET (direct downloads).
- **Fields:** camera geometries + attributes (to verify on the GPKG).
- **Licence:** **to verify** — the opendata.swiss sheet does not expose the licence in the API; OGD Bern typically
  adopts CC BY 4.0 or OGD terms with attribution. ⚠️ verify before import.
- **Freshness:** 2026-07 (metadata).
- **Coverage:** videosurveillance in public space (Bern).
- **Quality:** high (modern GeoPackage) — licence to clarify.
- **ODbL compatibility:** ⚠️ to verify with legal (permissive with attribution expected).

### 3.15 Geneva — Infomobilité, caméras de surveillance du trafic

- **Authority:** Canton Geneva (SITG/opendata.swiss).
- **URL:** opendata.swiss (dataset «Infomobilité - Caméras de surveillance du trafic»).
- **Format:** API/CSV/GML/KML/SHP/WFS/WMS/ZIP.
- **Fields:** traffic-surveillance cameras (geometries + attributes to verify).
- **Licence:** **to verify** — Geneva typically uses permissive licences with attribution (CC BY 4.0
  or OGL CH). ⚠️ confirm.
- **Freshness:** 2026-07 (metadata).
- **Coverage:** cantonal road network (traffic cameras).
- **ODbL compatibility:** ⚠️ to verify with legal (permissive with attribution expected).

### 3.16 UK — Leicester CCTV Cameras

- **Authority:** Leicester City Council (data.leicester.gov.uk, Opendatasoft).
- **URL:** https://data.gov.uk/dataset/cctv-cameras6 · API:
  `https://data.leicester.gov.uk/api/explore/v2.1/catalog/datasets/cctv-cameras/exports/geojson` (also
  csv/json/parquet/gpx/kml/shp/xlsx/ov2…).
- **Format:** Opendatasoft multi-export API.
- **Fields:** point geometry + CCTV attributes (to verify).
- **Licence:** ⚠️ **undeclared** on data.gov.uk — verify on the data.leicester.gov.uk sheet.
- **Freshness:** 2026-06-17 (metadata).
- **Coverage:** Leicester CCTV.
- **Quality:** high (rich API) — licence to clarify (matrix § 3.6/3.7).

### 3.17 Turin — ZTL perimeter, gates and hours

- **Authority:** Città di Torino (aperto.comune.torino.it portal + 5T feed).
- **URL:** https://aperto.comune.torino.it (dataset «Perimetro, varchi e orari ZTL») · feed:
  `http://opendata.5t.torino.it/get_access_control` (XML).
- **Format:** XML (5T access-control feed).
- **Fields:** ZTL gates with position and hours (parse the feed).
- **Licence:** **CC BY** (CKAN).
- **Freshness:** metadata 2021-05-28 ⚠️; the 5T feed is active but **403 for agents/bots** (verified) —
  may require a browser UA or whitelist.
- **Coverage:** Turin ZTL gates.
- **Quality:** medium (XML format, dated metadata, limited feed access).
- **ODbL compatibility:** ✅ with attribution (CC BY → § 3.2).

### 3.18 Italy — MIT, national speed-detection device list (velox)

- **Authority:** Ministero delle Infrastrutture e dei Trasporti (art. 1 co. 3-4 DL, decree 305/2025).
- **URL:** https://velox.mit.gov.it/dispositivi · data: `https://velox.mit.gov.it/dispositivi/data` (JSON,
  DataTables).
- **Format:** JSON (4106 records, verified).
- **Fields (verified):** `codice_accertatore`, `denominazione_accertatore`, `codice_catastale_accertatore`,
  `n_decreto`, `data_decreto`, `tipo_dispositivo` (Mobile/Fisso), `marca_dispositivo`, `modello_dispositivo`,
  `versione_dispositivo`, `matricola_dispositivo`, `note`, `data_primo_inserimento`.
  ⚠️ **Contains NO lat/lon** — it is a register of approved devices per enforcement authority, not positions.
- **Licence:** **undeclared** on the portal ⚠️ — to verify (matrix § 3.6; possible basis art. 52 CAD).
- **Freshness:** active list (online since 2025-11-28, updates scheduled by decree 305/2025).
- **Coverage:** national — speed cameras, tutor, approved devices.
- **Quality:** high as an official register; **not georeferenced** → geocoding/join with other sources needed
  for the map.
- **ODbL compatibility:** ⚠️ to verify with legal (undeclared licence; reuse still in the public
  interest, but formalise it).

### 3.19 Italy — dati.gov.it (national catalogue)

- **Authority:** AgID/DPCM (national DCAT-AP IT catalogue).
- **URL:** https://dati.gov.it (search «videosorveglianza», «telecamere», «varchi») · SPARQL client
  https://dati.gov.it/sviluppatori/sparqlclient
- **Format:** aggregated catalogue (DCAT-AP IT), API/SPARQL; JS-rendered UI search (public API
  undocumented — verified 404 on standard CKAN paths).
- **Fields:** per-dataset (aggregated from regional/municipal portals).
- **Licence:** per-dataset (IODL 2.0 / CC BY / other).
- **Freshness:** live (harvesting).
- **Coverage:** Italy — useful to **discover** local datasets (e.g. municipal/regional «videosurveillance
  systems»), then import from the primary source.
- **Quality:** variable; use as an index, not a primary source.
- **ODbL compatibility:** per-dataset, per the matrix (IODL 2.0/CC BY ✅ with attribution).

### 3.20 Europe — data.europa.eu (EU aggregator)

- **Authority:** Publications Office EU (DCAT-AP EU).
- **URL:** https://data.europa.eu (search «video surveillance», «camera», «videosorveglianza»).
- **Format:** aggregated catalogue (DCAT-AP EU); documented API hub but with non-trivial parameters
  (400 on simple queries during the check — use the UI or the API with correct parameters).
- **Fields:** per-dataset.
- **Licence:** per-dataset.
- **Freshness:** live.
- **Coverage:** EU — aggregator of the national portals already covered by the sheets (FR, UK, ES, NL, CH not —
  CH is not in the EU).
- **Quality:** variable; like dati.gov.it, it is an **index**, not a primary source.

### 3.21 Paris — Emplacements d'implantation de caméras de vidéoprotection (BO 2019)

- **Authority:** Ville de Paris.
- **URL:** https://www.data.gouv.fr/fr/datasets/emplacements-dimplantation-de-cameras-de-videoprotection-bo-ville-de-paris-du-01-02-2019/
- **Format:** historical dataset (BO of 01/02/2019).
- **Fields:** camera emplacements (positions).
- **Licence:** **notspecified** ⚠️ (not reusable without clarification — matrix § 3.6).
- **Freshness:** 2019 (historical).
- **Quality:** low for reuse (unclear licence + dated).
- **ODbL compatibility:** ⚠️ NO without clarification.

### 3.22 Surveillance under Surveillance (civic project)

- **Authority:** academic/civic project (sunders.uber.space).
- **URL:** https://sunders.uber.space/
- **Format:** web viewer; **data = OSM** (`surveillance` tag) not shown on the standard map;
  contributions via OSM accounts.
- **Fields:** same as OSM (see 3.4), with focus on cameras + guards, Western Europe.
- **Licence:** ODbL (OSM data); assets/code under various licences (CC BY-SA/MIT/GPL).
- **Freshness:** live (on OSM data).
- **Quality:** good as **inspiration/cross-check source**; the primary data remains OSM (3.4).
- **ODbL compatibility:** ✅ (same OSM licence).

### 3.23 Italy — Ministero dell'Interno, «Sistemi di videosorveglianza in favore dei comuni»

- **Authority:** Ministero dell'Interno (amministrazione trasparente).
- **URL:** https://www.interno.gov.it/it/amministrazione-trasparente/altri-contenuti-dati-ulteriori/sistemi-videosorveglianza-favore-dei-comuni
- **Format:** programme page/PDF (funding under DL 14/2017 safe cities).
- **Fields:** funded projects (not georeferenced).
- **Licence:** n/a (institutional publication).
- **Coverage:** Italy (system-funding programmes).
- **Quality:** low for the DB (no positions); useful only as **context** (which municipalities received
  funds → where to look for systems).
- **ODbL compatibility:** n/a.

### 3.24 Regione Toscana — traffic data monitoring

- **Authority:** Regione Toscana.
- **URL:** https://dati.toscana.it (dataset «Sistema di monitoraggio dati di traffico sulle strade regionali»).
- **Format:** KMZ/SHP/TIF.
- **Fields:** traffic data (not cameras).
- **Licence:** **CC BY-SA** ⚠️ — **incompatible with ODbL** without permission (matrix § 3.5).
- **Freshness:** n/d.
- **Quality:** low for our scope.
- **ODbL compatibility:** ❌ normally NO.

### 3.25 Atlas of Surveillance (EFF) — US civic project

- **Authority:** Electronic Frontier Foundation + researchers.
- **URL:** https://www.atlasofsurveillance.org/data-library (CSV download: `https://atlasofsurveillance.org/download.csv`).
- **Format:** CSV.
- **Fields (verified on header):** `AOSNUMBER`, `City`, `County`, `State`, `Agency`, `Type of LEA`,
  `Technology` (ALPR, cameras, drones…), `Vendor`, `Link 1..3`, dates… — **no coordinates**, agency level.
- **Licence:** to verify on the site (EFF research data); ⚠️ do not assume CC0.
- **Freshness:** live dataset (2026).
- **Coverage:** USA (local/federal police) — **outside the EU/IT census scope**, useful only as a
  methodological reference.
- **ODbL compatibility:** to verify with legal; low relevance (no coordinates, no EU).

### 3.26 Rome — dati.comune.roma.it (Open Data Roma Capitale portal)

- **Authority:** Roma Capitale.
- **URL:** https://dati.comune.roma.it
- **Format:** custom portal (Apache, Designers Italia theme); CKAN API **not exposed** on standard paths
  (verified: `/api/3/action/*` → HTML). It still contains ZTL datasets (perimeter, hours, gates) —
  documented by the docs.italia monitoring; machine-readable access to verify dataset by dataset.
- **Fields/licence:** per-dataset (to extract via UI or dati.gov.it harvesting).
- **Freshness:** live.
- **Quality:** medium; for ZTL gates the best machine-readable source is RSM ArcGIS (3.12).
- **ODbL compatibility:** per-dataset.

---

## 4. Sources evaluated and discarded / limited

| Source | Reason for discard/limitation |
|---|---|
| govdata.de (DE) | CKAN API not exposed (404 on standard paths); JS UI search. Not blocking: Germany has few public camera datasets at federal level; re-evaluate with UI access. |
| dados.gov.pt (PT) | CKAN API not exposed (404); negligible coverage at verification time. |
| data.gov.be (BE) | Unstable API (503) during the check; retry at import time. |
| dati.comune.genova.it / opendata.comune.napoli.it | Timeout/404 on CKAN paths; re-evaluate with browser access (Genova has historical «telecamere» datasets). |
| dati.comune.fi.it / dati.comune.venezia.it | Domain/endpoint unresolved or no API (Florence/Venice use different platforms); re-evaluate via UI. |
| Regione Lombardia (dati.lombardia.it) | Socrata platform (not CKAN): SODA API to map in phase 2; not verified in this round. |
| Wikimapia / Google Maps | Not licensable, scraping forbidden. |
| Commercial «speed-camera map» portals | Derived data, uncertain licence, redundant vs velox.mit.gov.it. |

## 5. Import recommendations (QA/feasibility)

1. **Immediate priority (clean licence + coordinates):** Zürich (CC0) → Milan (CC BY) → Madrid (CC BY 4.0,
   geographic datasets) → OSM `surveillance=*` (ODbL, Geofabrik IT extract) → Amsterdam (CC0).
2. **Second wave (permissive licence, to confirm):** Bologna (CC BY 4.0 expected), UK Runnymede/Plymouth/
   York (OGL v3), France Min. Intérieur (Licence Ouverte 2.0, 2018 snapshot), TfL (OGL + registration).
3. **Cases to bring to the privacy/legal review before touching the data:** RSM Rome (undeclared licence), MIT velox
   (undeclared licence), Leicester (undeclared licence), Bern/Geneva (licence to verify),
   Paris BO 2019 (notspecified), Barcelona (verify coordinate presence in the dataset).
4. **Do not import:** CC BY-SA (Tuscany) and any share-alike dataset without permission (matrix § 3.5).
5. **Import technical rules:**
   - Per-source attribution on the `/licenze` page + `source` field in the record + export headers
     (workstream README constraint; `app/lib/data-license.ts`).
   - Reprojection: Amsterdam is in **EPSG:28992** (RD New) → WGS84; verify the SRID for every source.
   - Encoding: Madrid CSV in Latin-1; Zürich CSV with UTF-8 BOM.
   - Dedup/merge: OSM is the integration base (same licence); municipal sources must be matched on
     `operator`/address/proximity (e.g. Milan gates ↔ OSM nodes).
   - Do not use the OSM API for bulk; use Geofabrik/Planet extracts (OSMF policy).
6. **Next task (SOURCES #3, normalizzazione-pipeline.md):** define the normalised schema (source id,
   type, operator, direction, verification date) and the refresh job (recommended cadence: monthly for
   static sources, live for WFS/API).

---

## 6. Appendix — QA anomalies found during the check (2026-08-04)

- **velox.mit.gov.it**: dataset without coordinates (only per-authority register); undeclared licence.
- **Madrid videovigilancia CSV**: no lat/lon in the tabular file (only textual `Ubicación`) — the
  coordinates are in the tráfico datasets (KML/Geo).
- **Milan**: HTML page behind bot-block 403 for non-browser agents; CKAN API fine.
- **Turin 5T**: `get_access_control` XML feed answers 403 to non-browser User-Agents.
- **dati.gov.it / data.europa.eu**: undocumented search APIs / 400-404 responses on standard paths;
  use the UI or SPARQL.
- **Public Overpass**: rate limits/limits on large bboxes (whole Italy) — use city bboxes or extracts.
- **opendata.swiss**: licences are not exposed in the `license_title` field of the CKAN API (they must
  be read from the sheet/DCAT) — cause of the «to verify» marks on Bern/Geneva.
- **TfL**: swagger/docs endpoint unstable (Cloudflare 530); `Place/Type/JamCam` API stable.
