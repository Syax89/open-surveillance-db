# Censimento fonti pubbliche — telecamere di videosorveglianza

**Worker:** Grace (QA Automation Engineer)
**Data verifica:** 2026-08-04 (verifiche dirette su API/portali, vedi § 2)
**Task:** FONTI PUBBLICHE #1 — Censimento (`t_3edaf673`)
**Stato:** pronto per review (Ada/CTO + Rosa/DPO per i casi licenza marcati)
**Dipendenze:** [README.md](README.md) (indice workstream); la matrice di compatibilità licenze è in
[licenze-compatibilita.md](licenze-compatibilita.md) (FONTI #2, Marie) — questo documento applica i verdetti
per-fonte e **non** duplica la matrice.

> Il database di progetto è rilasciato sotto **ODbL 1.0** (ADR 0008). Per ogni fonte è indicato il
> verdetto di compatibilità secondo la regola unidirezionale permissiva→share-alike di
> `licenze-compatibilita.md` § 2. I casi «da verificare con legale» richiedono l'ok di Rosa (DPO)
> prima di qualsiasi import (vincolo operativo del README del workstream).

---

## 1. Sintesi esecutiva

**Esito:** censite e valutate **26 fonti** (10 italiane, 12 EU/CH/UK, 2 aggregatori europei, 2 progetti civici/ricerca).
**Verificate via API diretta** (non solo scheda portale): 20 su 26 — coordinate, campi e licenze letti
direttamente dai dataset. **Top 5 per qualità/fattibilità:** Zürich (CC0), Milano (CC BY, GeoJSON),
Madrid (CC BY 4.0), OpenStreetMap `surveillance=*` (ODbL), Amsterdam (CC0/WFS).

### Tabella ranking

| # | Fonte | Paese | Formato | Licenza (verificata) | Lat/Lon | Aggiorn. | Score |
|---|-------|-------|---------|----------------------|:-------:|----------|------:|
| 1 | Zürich — Videokameras Stadtverwaltung | CH | CSV/GPKG/SHP/JSON/WFS/WMS | **CC0** | ✅ | 2026-07 (portal) | **10** |
| 2 | Milano — Varchi Area C + Area B | IT | GeoJSON/SHP/CSV | CC BY (3.0 IT, da confermare) | ✅ | 2026-05/07 | **9** |
| 3 | Madrid — videovigilanza + tráfico + ZBE + carteles + foto-rojo | ES | CSV/KML/XLS/Geo | **CC BY 4.0** | ✅ (KML/Geo) | 2026-06/07 | **9** |
| 4 | OpenStreetMap — `surveillance=*` | GLO | Overpass / estratti Geofabrik | **ODbL 1.0** (identica al nostro DB) | ✅ | live (crowdsourced) | **9** |
| 5 | Amsterdam — Cameragebieden + mappa privacy | NL | WFS/CSV/GeoJSON | **CC0 / Public Domain** | ✅ | live (WFS) | **8.5** |
| 6 | Francia — Vidéoprotection implantation (Min. Interno) | FR | KML/ODS (+SHP storico) | **Licence Ouverte 2.0 (fr-lo)** | ✅ (KML) | snapshot 2018-11 | **8** |
| 7 | UK — Runnymede CCTV Cameras | UK | **WFS live** + CSV/SHP/XLS/WMS | **OGL v3** | ✅ | 2026-04 | **8** |
| 8 | UK — TfL JamCams (Londra) | UK | API JSON (882 punti) | OGL (v2 base, registrazione) | ✅ | live | **8** |
| 9 | UK — Plymouth CCTV Cameras | UK | GeoJSON/CSV | **OGL v3** | ✅ | 2024-12 | **8** |
| 10 | Bologna — Elenco varchi | IT | GeoJSON/CSV/API Opendatasoft | CC BY 4.0 (da confermare su portale) | ✅ | live (dati passaggi 15') | **7.5** |
| 11 | UK — York CCTV Cameras | UK | CSV/KML/GeoJSON | **OGL-UK-3.0** | ✅ | 2020-02 | **7** |
| 12 | Roma — RSM ZTL varchi (ArcGIS) | IT | Feature Service (GeoJSON/CSV) | non dichiarata (⚠️) | ✅ | vari per dataset | **7** |
| 13 | Barcellona — Inventari càmeres de seguretat | ES | (API catalog) | **CC BY 4.0** | ⚠️ da verificare | n/d | **7** |
| 14 | Bern — Videoüberwachung öffentlicher Raum | CH | GPKG/PARQUET | da verificare (OGD Bern) | ✅ | 2026-07 | **7** |
| 15 | Ginevra — Infomobilité caméras de trafic | CH | WFS/GML/KML/SHP/CSV | da verificare (CC BY atteso) | ✅ | 2026-07 | **7** |
| 16 | UK — Leicester CCTV Cameras | UK | API Opendatasoft (csv/geojson/parquet…) | **non dichiarata** (⚠️) | ✅ | 2026-06 | **6.5** |
| 17 | Torino — Perimetro, varchi e orari ZTL | IT | XML (feed 5T) | CC BY | ✅ (varchi) | 2021-05 (metadati) | **6** |
| 18 | MIT — Lista dispositivi rilevamento velocità (velox) | IT | JSON (4106 record) | non dichiarata (⚠️) | ❌ | 2025-10+ (aggiornata) | **6** |
| 19 | dati.gov.it (catalogo nazionale) | IT | DCAT-AP / SPARQL / UI | per-dataset (IODL/CC BY) | dipende | live | **5.5** |
| 20 | data.europa.eu (aggregatore EU) | EU | DCAT-AP EU / UI | per-dataset | dipende | live | **5.5** |
| 21 | Parigi — Emplacements caméras (BO 2019) | FR | (dataset storico) | **notspecified** (⚠️) | ✅ | 2019 | **5** |
| 22 | Surveillance under Surveillance | GLO | viewer (dati OSM) | ODbL (riusa OSM) | ✅ | live | **5** |
| 23 | Ministero dell'Interno — finanziamenti videosorveglianza | IT | pagina/PDF (non dataset) | n/a (amministrazione trasparente) | ❌ | n/d | **4** |
| 24 | Regione Toscana — monitoraggio traffico | IT | KMZ/SHP/TIF | **CC BY-SA** (⚠️ incompatibile) | ❌ (non telecamere) | n/d | **4** |
| 25 | Atlas of Surveillance (EFF) | US | CSV | da verificare (EFF) | ❌ (agency-level) | 2026 | **4** |
| 26 | Roma — dati.comune.roma.it (portale) | IT | portale custom | per-dataset | dipende | live | **4** |

**Score** = media pesata di: licenza riutilizzabile (30%), formato machine-readable/API (20%), presenza
coordinate (20%), aggiornamento (15%), qualità/copertura (15%). È un giudizio di *fattibilità QA/import*,
non un parere legale.

---

## 2. Metodologia

- Verifiche eseguite il **2026-08-04** con chiamate dirette agli endpoint (non solo pagine web):
  - **API CKAN** `package_search`/`package_show` su: dati.comune.milano.it, aperto.comune.torino.it,
    datos.madrid.es, data.gov.uk, data.stadt-zuerich.ch, opendata.swiss, opendata-ajuntament.barcelona.cat;
  - **API Opendatasoft** (`/api/explore/v2.1`) su Bologna;
  - **API REST ArcGIS** (sharing REST + FeatureService) su Roma Servizi per la Mobilità;
  - **API REST** su TfL (`/Place/Type/JamCam`), MIT (`/dispositivi/data`), data.gouv.fr (`/api/1/datasets`),
    Amsterdam (`/v1/wfs/…cameratoezicht`), dati.gov.it (UI), Taginfo/Overpass (OSM);
  - **Download dei dati campione** (GeoJSON/CSV/KML/XML) per verificare i campi reali, non solo il catalogo.
- **Affidabilità delle affermazioni:** le licenze e i campi riportati sono quelli letti dall'API/risorsa alla
  data di verifica. Dove la verifica diretta non è riuscita (403, bot-block, endpoint non pubblico) o il
  campo non è esposto, è marcato **«da verificare»/«non dichiarata»** e NON è stato inventato nulla.
- Limite noto: alcuni portali (dati.gov.it, data.europa.eu, govdata.de, dati.comune.roma.it) espongono
  ricerca JS-rendered o API non documentate; per questi la scheda documenta l'accesso via UI e il valore
  di aggregazione, non un dataset puntuale.

---

## 3. Schede dettagliate

> Legenda campi scheda: **URL** risorse/API principali · **Formato** · **Campi** (verificati sul dato reale) ·
> **Licenza** (esatta, come letta) · **Aggiornamento** · **Copertura** · **Qualità** · **Compatibilità ODbL**
> (verdetto secondo `licenze-compatibilita.md`) · **Note QA**.

### 3.1 Zürich — Aktuelle Auflistung von Videokameras der Stadtverwaltung Zürich (⭐ TOP)

- **Ente:** Stadt Zürich (Open Data Zürich) — dataset tabellare `prd_stez_liste_videokameras_stadtverwaltung` + variante geodati `geo_aktuelle_auflistung_von_videokameras…`.
- **URL:** https://data.stadt-zuerich.ch/dataset/prd_stez_liste_videokameras_stadtverwaltung · WFS:
  `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Aktuelle_Auflistung_von_Videokameras_der_Stadtverwaltung_Zuerich?SERVICE=WFS&REQUEST=GetCapabilities` · CSV diretto: `…/download/liste_videokameras_stadtverwaltung.csv`
- **Formato:** CSV, DXF, GPKG, JSON, SHP, WFS, WMS, WMTS.
- **Campi (verificati sul CSV):** `standort_beschreibung`, `adresse_beschreibung`, **`lat`, `lon`**,
  `anzahl_kameras_aussen`, `anzahl_kameras_innen`, `anzahl_kameras_gsa`, `bereich_detail_beschreibung`,
  `aufbewahrungsdauer` (durata retention!), `verantwortliche_da` (responsabile trattamento),
  `rechtsgrundlage_url` (base giuridica). ✅ **Il dataset più ricco del censimento.**
- **Licenza:** **CC0 1.0** (`license_id: cc-zero`, `http://www.opendefinition.org/licenses/cc-zero`).
- **Aggiornamento:** metadati 2026-07 (portale); dataset «aktuell» (lista corrente).
- **Copertura:** telecamere della città di Zurigo (amministrazione), esterno/interno/aree sensibili.
- **Qualità:** eccellente — coordinate esplicite, conteggi per sito, retention e base legale per record.
- **Compatibilità ODbL:** ✅ importabile **senza obblighi** (CC0 → § 3.3 matrice); buona pratica citare la fonte.
- **Note QA:** l'endpoint WFS con typename esatto restituisce 500 con parametri errati — usare GetCapabilities
  per scoprire il typename; il CSV diretto è affidabile. Da verificare: eventuale contenuto di terzi nel dataset
  (cautela CC0, matrice § 3.3).

### 3.2 Milano — Varchi Area C e Area B (telecamere)

- **Ente:** Comune di Milano — portale Open Data (CKAN).
- **URL:** Area C https://dati.comune.milano.it/it/dataset/ds82_infogeo_varchi_elettronici_localizzazione_ ·
  Area B https://dati.comune.milano.it/dataset/ds959-varchi-areab
- **Formato:** GeoJSON, SHP (zip), CSV per entrambi.
- **Campi Area C (verificati su GeoJSON):** `id_amat`, `label` (nome varco), Point [lon, lat] (CRS84).
  Campi Area B: `id`, `nome`, `stato` (varco attivo/non attivo), geometria punto.
- **Licenza:** `cc-by` (Creative Commons Attribution — link opendefinition); il portale milanese adotta
  storicamente **CC BY 3.0 IT** — **confermare la versione** in fase di import (pagina HTML dietro
  bot-block 403 per gli agenti, API CKAN pulita).
- **Aggiornamento:** Area C `metadata_modified` 2026-07-22; Area B 2026-05-08.
- **Copertura:** varchi telematici Area C (cerchia Bastioni + TPL) e Area B (accessi ZTL) — telecamere di
  controllo accessi attive.
- **Qualità:** alta — coordinate pulite, aggiornate, doppio formato vettoriale.
- **Compatibilità ODbL:** ✅ importabile **con attribuzione** (CC BY → § 3.2 matrice; indicare modifiche).
- **Note QA:** il dataset descrive i **varchi** (punti di controllo accesso), non tutte le telecamere comunali;
  per l'import mappare `label`→nome varco e mantenere `id_amat` come id sorgente.

### 3.3 Madrid — telecamere (5 dataset complementari)

- **Ente:** Ayuntamiento de Madrid — portal de datos abiertos (CKAN), tutti **CC BY 4.0**.
- **URL/dataset:**
  - Cámaras de videovigilancia en la vía pública: https://datos.madrid.es/portal/site/egob (dataset `300429-0-camaras-videovigilancia`) — CSV/XLS/PDF, aggiornato 2026-07-24;
  - Carteles informativos de zonas de videovigilancia: `300244-0-carteles-videovigilancia` (cartelli segnaletici!);
  - Tráfico. Cámaras: `202088-0-trafico-camaras` — **KML** con punti + link immagini live (`informo.madrid.es`);
  - Tráfico: Madrid ZBE. Cámaras: `300654-0-circulacion-camaras-trafico` — CSV/XLSX/ZIP, 2026-07-31;
  - ZBEDEP Distrito Centro. Cámaras y calles: `300229-0-trafico-madrid-central` — CSV/Geo/KMZ/ZIP, 2026-07-31;
  - Semáforos con control foto-rojo: `205193-0-semaforos-foto-rojo` (semafori con fotored!).
- **Campi videovigilancia (verificati su CSV):** `ID Cámara`, `Tipo` (DOMO/FIJA…), `Ubicación` (testo),
  `Resolución`, `Zoom Óptico`, `Año Adquisición`. ⚠️ **il CSV tabellare NON ha lat/lon** — le coordinate
  sono nei formati geografici dei dataset tráfico (KML/Geo) e nella vista mappa del portale.
- **Licenza:** **CC BY 4.0** (`license_id` verificato su CKAN).
- **Aggiornamento:** 2026-06/07/08 (dataset attivi, alcuni con aggiornamento mensile).
- **Copertura:** vía pública Madrid (centinaia di camere), rete tráfico, ZBE/ZBEDEP, cartelli, fotored.
- **Qualità:** alta per i dataset geografici; il CSV videovigilanza richiede geocodifica della `Ubicación`.
- **Compatibilità ODbL:** ✅ importabile **con attribuzione** (CC BY 4.0 → § 3.2).
- **Note QA:** verificare l'encoding del CSV (Latin-1, header con caratteri mojibake se letto come UTF-8).

### 3.4 OpenStreetMap — tag `surveillance=*`

- **Ente:** comunità OSM (dati collaborativi).
- **URL:** wiki https://wiki.openstreetmap.org/wiki/Key:surveillance · Taginfo
  https://taginfo.openstreetmap.org/keys/surveillance · Overpass https://overpass-api.de ·
  estratti: https://download.geofabrik.de
- **Formato:** estratti OSM (PBF/GeoJSON via Overpass/Geofabrik), API Overpass.
- **Campi:** tag `surveillance=indoor|outdoor|public`, namespace `surveillance:*`
  (`camera:type`, `camera:mount`, `camera:direction`, `camera:angle`, `operator`, `operator:wikidata`,
  `recording`, `source`, `start_date`…), geometria punto/way/area.
- **Licenza:** **ODbL 1.0** — identica al nostro DB (ADR 0008).
- **Aggiornamento:** continuo (crowdsourced); qualità disomogenea, densità molto variabile (forte in
  DE/NL/CH, parziale in IT).
- **Copertura:** globale; tag de facto con valori standardizzati.
- **Qualità:** buona dove mappato; serve **filtro** (solo `surveillance=public`/outdoor di interesse civico,
  niente indoor privato) e dedupe con altre fonti.
- **Compatibilità ODbL:** ✅ importabile (stessa licenza → § 3.4 matrice); attribuzione
  «© OpenStreetMap contributors» + link; per l'import **non usare l'API OSM** per download di massa
  (policy) → estratto Geofabrik/Planet o Overpass con cautela.
- **Note QA:** l'istanza pubblica Overpass rate-limita le query grandi (verificato: bbox Italia intera →
  risposta sospetta/limiti); usare bbox per città o estratti regionali. I conteggi Taginfo vanno letti live.

### 3.5 Amsterdam — Cameragebieden e mappa privacy

- **Ente:** Gemeente Amsterdam.
- **URL:** https://data.overheid.nl/en/dataset/tqdi9wr-xugg2a (Cameragebieden) · mappa puntuale
  https://maps.amsterdam.nl/privacy/ («Persoonsgevoelige dataverwerking in de openbare ruimte», con
  dataset GeoJSON scaricabili).
- **Formato:** WFS (`https://api.data.amsterdam.nl/v1/wfs/overlastgebieden/?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=cameratoezicht&OUTPUTFORMAT=csv`), CSV, HTML.
- **Campi WFS (verificati):** `id`, `geometry` (multipoligono, SRID 28992/RD), `type`, `typering`, `soort`,
  `url`, `oov_naam`, `oov_code`, `geldigheid_periode`, `geldigheid_specificatie` (periodo di validità della
  decisione del sindaco).
- **Licenza:** **Pubblico dominio (CC0 / Public Domain Mark 1.0)** — verificato su data.overheid.nl.
- **Aggiornamento:** WFS live (dati gestionali).
- **Copertura:** zone di cameratoezicht (poligoni) di Amsterdam + dataset puntuali della mappa privacy.
- **Qualità:** alta (zone ufficiali con base decisionale); per punti camera usare la mappa privacy (GeoJSON lnglat).
- **Compatibilità ODbL:** ✅ importabile **senza obblighi** (CC0 → § 3.3).
- **Note QA:** il WFS restituisce geometrie in **RD New (EPSG:28992)** — serve reproiezione in WGS84;
  `OUTPUTFORMAT=csv` restituisce WKT, comodo per il QA.

### 3.6 Francia — Vidéoprotection, implantation des caméras (Ministero dell'Interno)

- **Ente:** Ministère de l'Intérieur (dataset nazionale PVPP).
- **URL:** https://www.data.gouv.fr/fr/datasets/videoprotection-implantation-des-cameras-kml-ods/ (versione
  KML+ODS del Min. Intérieur) · variante storica SHP/PDF: `…/videoprotection-implantation-des-cameras/`.
- **Formato:** **KML** (cartografico) + **ODS** (elenco); versione storica SHP+PDF (2014).
- **Campi KML:** punti camera con denominazione/indirizzo; ODS: elenco caméras PVPP.
- **Licenza:** **Licence Ouverte 2.0 (`fr-lo`)** — permissiva (equivalente IODL/CC BY, attribuzione).
- **Aggiornamento:** ⚠️ snapshot **2018-11-15** per la versione KML/ODS; la variante fork risale al 2014.
  Dataset nazionale non più aggiornato con continuità.
- **Copertura:** Francia (camere di videosorveglianza su strade pubbliche).
- **Qualità:** buona come snapshot storico; da valutare il rischio obsolescenza (molte installazioni dal 2018).
- **Compatibilità ODbL:** ✅ importabile **con attribuzione** (Licence Ouverte 2.0 — permissiva; trattarla
  come CC BY/IODL, matrice § 3.1/3.2; conferma legale consigliata).
- **Note QA:** verificare la versione esatta (2014 vs 2018) e l'encoding; non ci sono campi gestore/direzione.

### 3.7 UK — Runnymede CCTV Cameras (WFS live)

- **Ente:** Runnymede Borough Council (data.gov.uk).
- **URL:** https://data.gov.uk/dataset/cctv-cameras3 · WFS:
  `https://maps.runnymede.gov.uk/geoserver/wfs?service=WFS&request=GetFeature&typeName=community:cctv_cameras&outputFormat=csv`
  (anche SHP zip, XLS; WMS per la base).
- **Formato:** **WFS live** + CSV/SHP/XLS/WMS.
- **Campi:** geometria punto + attributi CCTV (da GetCapabilities; verificare in import).
- **Licenza:** **OGL v3** (`uk-ogl`, link nationalarchives v3).
- **Aggiornamento:** `metadata_modified` 2026-04-30.
- **Copertura:** telecamere CCTV del distretto di Runnymede.
- **Qualità:** alta — servizio WFS attivo, multi-formato.
- **Compatibilità ODbL:** ✅ importabile **con attribuzione** (OGL — permissiva, attribuzione + link;
  matrice § 3.1/3.2 per analogia; conferma legale consigliata per la prima importazione OGL).

### 3.8 UK — TfL JamCams (Londra)

- **Ente:** Transport for London (API Unified).
- **URL:** `https://api.tfl.gov.uk/Place/Type/JamCam` (JSON) — 882 camere (verificato).
- **Formato:** API JSON REST pubblica (senza chiave per uso leggero).
- **Campi (verificati):** `commonName` (nome posizione), `lat`, `lon`, plus metadata (id, url immagine).
- **Licenza:** OGL (base v2.0; **i termini TfL richiedono registrazione** per il riuso pieno — odimpact
  caso TfL; confermare su api-portal.tfl.gov.uk).
- **Aggiornamento:** live.
- **Copertura:** rete stradale di Londra (traffic cameras pubbliche).
- **Qualità:** alta per copertura e API; nessun campo tipo/gestore oltre al nome.
- **Compatibilità ODbL:** ✅ con attribuzione (OGL) — **prima dell'import** verificare i termini di
  registrazione TfL (non è un semplice download).
- **Note QA:** per volumi alti è richiesta una chiave API (registrazione); il dato è «traffic cameras»,
  non videosorveglianza di sicurezza — rilevante per lo scope del progetto.

### 3.9 UK — Plymouth CCTV Cameras

- **Ente:** Plymouth City Council.
- **URL:** https://data.gov.uk/dataset/cctv-locations-in-plymouth
- **Formato:** GeoJSON + 5 CSV (CCTV, car parking, help points, traffic, redeployable cameras).
- **Campi:** geometria punto; per CSV: denominazione/località (verificare in import).
- **Licenza:** **OGL v3** (`uk-ogl`).
- **Aggiornamento:** 2024-12-02.
- **Copertura:** telecamere CCTV di Plymouth (incluse quelle riconfigurabili).
- **Qualità:** buona; dataset del 2016 (rilasciato 2016, metadati 2024) — verificare l'attualità sul campo.
- **Compatibilità ODbL:** ✅ con attribuzione (OGL v3).

### 3.10 Bologna — Elenco varchi (telecamere Sirio/ZTL)

- **Ente:** Comune di Bologna — Open Data (Opendatasoft).
- **URL:** https://opendata.comune.bologna.it/explore/dataset/varchi-bologna/ · API:
  `https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/varchi-bologna/exports/geojson`
- **Formato:** GeoJSON/CSV/JSON + API Opendatasoft (export multipli).
- **Campi (verificati su GeoJSON):** `identificativo_varco`, `attivo` (S/N), `nome_varco`, `descrizione`
  (indirizzo), `direzione`, `tipologia_varco` (ZTL…), `inizio_attivita`, link `dati_totali`/`dati_20xx`
  (passaggi per varco, cadenza 15'), geometria **Point [lon,lat]**.
- **Licenza:** **CC BY 4.0** per convenzione del portale bolognese — **da confermare** sulla pagina dataset
  (l'API non espone `license` nei metas; verificare in import).
- **Aggiornamento:** dataset varchi stabile; i dati passaggi sono aggiornati (cadenza 15').
- **Copertura:** tutti i varchi telematici ZTL di Bologna (sistema Sirio).
- **Qualità:** alta — coordinate pulite, tipologia e direzione per varco, collegamento ai flussi.
- **Compatibilità ODbL:** ✅ con attribuzione (CC BY 4.0 attesa → § 3.2); confermare licenza prima dell'import.

### 3.11 UK — York CCTV Cameras

- **Ente:** City of York Council.
- **URL:** https://data.gov.uk/dataset/cctv-cameras4
- **Formato:** CSV/KML/GeoJSON (ArcGIS Open Data).
- **Campi:** geometria punto + attributi CCTV.
- **Licenza:** **OGL-UK-3.0**.
- **Aggiornamento:** 2020-02-13 (⚠️ datato).
- **Copertura:** CCTV di York.
- **Qualità:** media (posizioni del 2020, da riconfermare).
- **Compatibilità ODbL:** ✅ con attribuzione (OGL v3).

### 3.12 Roma — Roma Servizi per la Mobilità, ZTL varchi (ArcGIS)

- **Ente:** Roma Servizi per la Mobilità S.r.l. (società del Comune di Roma).
- **URL:** https://data-rsm.opendata.arcgis.com/ (es. dataset «ZTL Testaccio - varchi di ingresso»,
  `41037e0a9f06431ba39304fe42b3f371`; altri varchi ZTL/Fascia Verde).
- **Formato:** **Feature Service ArcGIS** (GeoJSON/CSV via REST: `?f=geojson`), portale ArcGIS Hub.
- **Campi:** geometria punto dei varchi + attributi (nome via, direzione — da GetFeature).
- **Licenza:** **non dichiarata esplicitamente** sul portale (`licenseInfo` vuoto) ⚠️ — **da verificare con
  legale** prima dell'import (matrice § 3.6 custom/nessuna licenza; art. 52 CAD come possibile base).
- **Aggiornamento:** variabile per dataset (alcuni attivi).
- **Copertura:** varchi ZTL di Roma (centro storico, Testaccio, Fascia Verde…).
- **Qualità:** buona (posizioni ufficiali della società di mobilità); terze parti la riusano (es. romaztl.altervista.org con CC BY 3.0 IT — sito non ufficiale).
- **Compatibilità ODbL:** ⚠️ caso per caso — chiarire licenza/termini con RSM prima dell'import.

### 3.13 Barcellona — Inventari de càmeres de seguretat

- **Ente:** Ajuntament de Barcelona.
- **URL:** https://opendata-ajuntament.barcelona.cat (dataset `infraestructures-inventari-cameres` +
  `infraestructures-tipologia-suports-cameres`).
- **Formato:** API CKAN del portale (`/data/api/3/action/…`); risorse da verificare.
- **Campi:** inventario camere di sicurezza dell'infrastruttura (tipologia supporti in dataset separato).
- **Licenza:** **CC BY 4.0** (verificato su CKAN).
- **Aggiornamento:** n/d (verificare in import).
- **Copertura:** infrastruttura comunale di Barcellona.
- **Qualità:** media (inventario tecnico; verificare presenza coordinate).
- **Compatibilità ODbL:** ✅ con attribuzione (CC BY 4.0 → § 3.2).

### 3.14 Bern — Videoüberwachung im öffentlichen Raum

- **Ente:** Canton Berna / Stadt Bern (geofiles.be.ch).
- **URL:** https://opendata.swiss/it/dataset/videouberwachung-im-offentlichen-raum (risorse:
  `https://geofiles.be.ch/geoportal/pub/download/VIDEO/video.gpkg.zip`, `…video_video.parquet`).
- **Formato:** GPKG, PARQUET (download diretti).
- **Campi:** geometrie camere + attributi (da verificare sul GPKG).
- **Licenza:** **da verificare** — la scheda opendata.swiss non espone license nell'API; OGD Bern adotta
  tipicamente CC BY 4.0 o termini OGD con attribuzione. ⚠️ verificare prima dell'import.
- **Aggiornamento:** 2026-07 (metadati).
- **Copertura:** videosorveglianza nello spazio pubblico (Berna).
- **Qualità:** alta (GeoPackage moderno) — licenza da chiarire.
- **Compatibilità ODbL:** ⚠️ da verificare con legale (attesa permissiva con attribuzione).

### 3.15 Ginevra — Infomobilité, caméras de surveillance du trafic

- **Ente:** Canton Ginevra (SITG/opendata.swiss).
- **URL:** opendata.swiss (dataset «Infomobilité - Caméras de surveillance du trafic»).
- **Formato:** API/CSV/GML/KML/SHP/WFS/WMS/ZIP.
- **Campi:** camere di sorveglianza del traffico (geometrie + attributi da verificare).
- **Licenza:** **da verificare** — Ginevra usa tipicamente licenze permissive con attribuzione (CC BY 4.0
  o OGL CH). ⚠️ confermare.
- **Aggiornamento:** 2026-07 (metadati).
- **Copertura:** rete stradale cantonale (traffic cameras).
- **Compatibilità ODbL:** ⚠️ da verificare con legale (attesa permissiva con attribuzione).

### 3.16 UK — Leicester CCTV Cameras

- **Ente:** Leicester City Council (data.leicester.gov.uk, Opendatasoft).
- **URL:** https://data.gov.uk/dataset/cctv-cameras6 · API:
  `https://data.leicester.gov.uk/api/explore/v2.1/catalog/datasets/cctv-cameras/exports/geojson` (anche
  csv/json/parquet/gpx/kml/shp/xlsx/ov2…).
- **Formato:** API Opendatasoft multi-export.
- **Campi:** geometria punto + attributi CCTV (da verificare).
- **Licenza:** ⚠️ **non dichiarata** su data.gov.uk — verificare sulla scheda data.leicester.gov.uk.
- **Aggiornamento:** 2026-06-17 (metadati).
- **Copertura:** CCTV di Leicester.
- **Qualità:** alta (API ricca) — licenza da chiarire (matrice § 3.6/3.7).

### 3.17 Torino — Perimetro, varchi e orari ZTL

- **Ente:** Città di Torino (portale aperto.comune.torino.it + feed 5T).
- **URL:** https://aperto.comune.torino.it (dataset «Perimetro, varchi e orari ZTL») · feed:
  `http://opendata.5t.torino.it/get_access_control` (XML).
- **Formato:** XML (feed 5T access control).
- **Campi:** varchi ZTL con posizione e orari (da parsare il feed).
- **Licenza:** **CC BY** (CKAN).
- **Aggiornamento:** metadati 2021-05-28 ⚠️; il feed 5T è attivo ma **403 per agenti/bot** (verificato) —
  potrebbe richiedere UA browser o whitelist.
- **Copertura:** varchi ZTL di Torino.
- **Qualità:** media (formato XML, aggiornamento dei metadati datato, accesso al feed limitato).
- **Compatibilità ODbL:** ✅ con attribuzione (CC BY → § 3.2).

### 3.18 Italia — MIT, lista nazionale dispositivi di rilevamento della velocità (velox)

- **Ente:** Ministero delle Infrastrutture e dei Trasporti (art. 1 co. 3-4 DL, decreto 305/2025).
- **URL:** https://velox.mit.gov.it/dispositivi · dati: `https://velox.mit.gov.it/dispositivi/data` (JSON,
  DataTables).
- **Formato:** JSON (4106 record, verificato).
- **Campi (verificati):** `codice_accertatore`, `denominazione_accertatore`, `codice_catastale_accertatore`,
  `n_decreto`, `data_decreto`, `tipo_dispositivo` (Mobile/Fisso), `marca_dispositivo`, `modello_dispositivo`,
  `versione_dispositivo`, `matricola_dispositivo`, `note`, `data_primo_inserimento`.
  ⚠️ **NON contiene lat/lon** — è un registro di dispositivi approvati per ente accertatore, non posizioni.
- **Licenza:** **non dichiarata** sul portale ⚠️ — da verificare (matrice § 3.6; possibile base art. 52 CAD).
- **Aggiornamento:** elenco attivo (online dal 2025-11-28, aggiornamenti previsti dal decreto 305/2025).
- **Copertura:** nazionale — autovelox, tutor, dispositivi approvati.
- **Qualità:** alta come registro ufficiale; **non georeferenziato** → serve geocodifica/join con altre fonti
  per la mappa.
- **Compatibilità ODbL:** ⚠️ da verificare con legale (licenza non dichiarata; riuso comunque nell'interesse
  pubblico, ma formalizzare).

### 3.19 Italia — dati.gov.it (catalogo nazionale)

- **Ente:** AgID/DPCM (catalogo nazionale DCAT-AP IT).
- **URL:** https://dati.gov.it (ricerca «videosorveglianza», «telecamere», «varchi») · SPARQL client
  https://dati.gov.it/sviluppatori/sparqlclient
- **Formato:** catalogo aggregato (DCAT-AP IT), API/SPARQL; ricerca UI JS-rendered (API pubblica non
  documentata — verificato 404 sui path CKAN standard).
- **Campi:** per-dataset (aggregato dai portali regionali/comunali).
- **Licenza:** per-dataset (IODL 2.0 / CC BY / altro).
- **Aggiornamento:** live (harvesting).
- **Copertura:** Italia — utile per **scoprire** dataset locali (es. «impianti di videosorveglianza» di
  comuni/regioni), poi si importa dalla fonte primaria.
- **Qualità:** variabile; usare come indice, non come fonte primaria.
- **Compatibilità ODbL:** per-dataset, secondo la matrice (IODL 2.0/CC BY ✅ con attribuzione).

### 3.20 Europa — data.europa.eu (aggregatore EU)

- **Ente:** Publications Office UE (DCAT-AP EU).
- **URL:** https://data.europa.eu (ricerca «video surveillance», «camera», «videosorveglianza»).
- **Formato:** catalogo aggregato (DCAT-AP EU); API hub documentata ma con parametri non banali
  (400 su query semplici durante la verifica — usare la UI o l'API con parametri corretti).
- **Campi:** per-dataset.
- **Licenza:** per-dataset.
- **Aggiornamento:** live.
- **Copertura:** EU — aggregatore dei portali nazionali già coperti dalle schede (FR, UK, ES, NL, CH no —
  CH non è EU).
- **Qualità:** variabile; come dati.gov.it, è un **indice**, non una fonte primaria.

### 3.21 Parigi — Emplacements d'implantation de caméras de vidéoprotection (BO 2019)

- **Ente:** Ville de Paris.
- **URL:** https://www.data.gouv.fr/fr/datasets/emplacements-dimplantation-de-cameras-de-videoprotection-bo-ville-de-paris-du-01-02-2019/
- **Formato:** dataset storico (BO del 01/02/2019).
- **Campi:** emplacements caméras (posizioni).
- **Licenza:** **notspecified** ⚠️ (non riutilizzabile senza chiarimento — matrice § 3.6).
- **Aggiornamento:** 2019 (storico).
- **Qualità:** bassa per riuso (licenza non chiara + datato).
- **Compatibilità ODbL:** ⚠️ NO senza chiarimento.

### 3.22 Surveillance under Surveillance (progetto civico)

- **Ente:** progetto accademico/civico (sunders.uber.space).
- **URL:** https://sunders.uber.space/
- **Formato:** viewer web; **dati = OSM** (tag `surveillance`) non visualizzati sulla mappa standard;
  contributi via account OSM.
- **Campi:** stessi di OSM (vedi 3.4), con focus camere + guardie, Europa occidentale.
- **Licenza:** ODbL (dati OSM); asset/codice sotto licenze varie (CC BY-SA/MIT/GPL).
- **Aggiornamento:** live (su dati OSM).
- **Qualità:** buona come **fonte di ispirazione/verifica incrociata**; il dato primario resta OSM (3.4).
- **Compatibilità ODbL:** ✅ (stessa licenza OSM).

### 3.23 Italia — Ministero dell'Interno, «Sistemi di videosorveglianza in favore dei comuni»

- **Ente:** Ministero dell'Interno (amministrazione trasparente).
- **URL:** https://www.interno.gov.it/it/amministrazione-trasparente/altri-contenuti-dati-ulteriori/sistemi-videosorveglianza-favore-dei-comuni
- **Formato:** pagina/PDF di programma (finanziamenti ex DL 14/2017 sicurezza città).
- **Campi:** progetti finanziati (non georeferenziati).
- **Licenza:** n/a (pubblicazione istituzionale).
- **Copertura:** Italia (programmi di finanziamento impianti).
- **Qualità:** bassa per il DB (nessuna posizione); utile solo come **contesto** (quali comuni hanno ricevuto
  fondi → dove cercare impianti).
- **Compatibilità ODbL:** n/a.

### 3.24 Regione Toscana — monitoraggio dati di traffico

- **Ente:** Regione Toscana.
- **URL:** https://dati.toscana.it (dataset «Sistema di monitoraggio dati di traffico sulle strade regionali»).
- **Formato:** KMZ/SHP/TIF.
- **Campi:** dati di traffico (non telecamere).
- **Licenza:** **CC BY-SA** ⚠️ — **incompatibile con ODbL** senza permesso (matrice § 3.5).
- **Aggiornamento:** n/d.
- **Qualità:** bassa per il nostro scope.
- **Compatibilità ODbL:** ❌ di norma NO.

### 3.25 Atlas of Surveillance (EFF) — progetto civico USA

- **Ente:** Electronic Frontier Foundation + ricercatori.
- **URL:** https://www.atlasofsurveillance.org/data-library (download CSV: `https://atlasofsurveillance.org/download.csv`).
- **Formato:** CSV.
- **Campi (verificati su header):** `AOSNUMBER`, `City`, `County`, `State`, `Agency`, `Type of LEA`,
  `Technology` (ALPR, cameras, drones…), `Vendor`, `Link 1..3`, date… — **nessuna coordinata**, livello ente.
- **Licenza:** da verificare sul sito (dati di ricerca EFF); ⚠️ non assumere CC0.
- **Aggiornamento:** dataset vivo (2026).
- **Copertura:** USA (polizia locale/federale) — **fuori scope EU/IT** del censimento, utile solo come
  riferimento metodologico.
- **Compatibilità ODbL:** da verificare con legale; rilevanza bassa (no coordinate, no EU).

### 3.26 Roma — dati.comune.roma.it (portale Open Data Roma Capitale)

- **Ente:** Roma Capitale.
- **URL:** https://dati.comune.roma.it
- **Formato:** portale custom (Apache, tema Designers Italia); API CKAN **non esposta** sui path standard
  (verificato: `/api/3/action/*` → HTML). Contiene comunque dataset ZTL (perimetro, orari, varchi) —
  documentato dal monitoraggio docs.italia; accesso machine-readable da verificare dataset per dataset.
- **Campi/licenza:** per-dataset (da estrarre via UI o harvesting dati.gov.it).
- **Aggiornamento:** live.
- **Qualità:** media; per i varchi ZTL la fonte machine-readable migliore è RSM ArcGIS (3.12).
- **Compatibilità ODbL:** per-dataset.

---

## 4. Fonti valutate e scartate / limitate

| Fonte | Motivo scarto/limite |
|---|---|
| govdata.de (DE) | API CKAN non esposta (404 sui path standard); ricerca UI JS. Non bloccante: la Germania ha pochi dataset camera pubblici a livello federale; rivalutare con accesso UI. |
| dados.gov.pt (PT) | API CKAN non esposta (404); copertura irrilevante al momento della verifica. |
| data.gov.be (BE) | API instabile (503) durante la verifica; riprovare in fase di import. |
| dati.comune.genova.it / opendata.comune.napoli.it | Timeout/404 sui path CKAN; da rivalutare con accesso browser (Genova ha dataset «telecamere» storici). |
| dati.comune.fi.it / dati.comune.venezia.it | Dominio/endpoint non risolti o API assente (Firenze/Venezia usano piattaforme diverse); da rivalutare via UI. |
| Regione Lombardia (dati.lombardia.it) | Piattaforma Socrata (non CKAN): API SODA da mappare in fase 2; non verificato in questa tornata. |
| Wikimapia / Google Maps | Non licenziabili, scraping vietato. |
| Portali «mappa autovelox» commerciali | Dati derivati, licenza incerta, ridondanti rispetto a velox.mit.gov.it. |

## 5. Raccomandazioni per l'import (QA/feasibility)

1. **Priorità immediata (licenza pulita + coordinate):** Zürich (CC0) → Milano (CC BY) → Madrid (CC BY 4.0,
   dataset geografici) → OSM `surveillance=*` (ODbL, estratto Geofabrik IT) → Amsterdam (CC0).
2. **Seconda ondata (licenza permissiva, da confermare):** Bologna (CC BY 4.0 attesa), UK Runnymede/Plymouth/
   York (OGL v3), Francia Min. Interno (Licence Ouverte 2.0, snapshot 2018), TfL (OGL + registrazione).
3. **Casi da portare a Rosa/DPO prima di toccare i dati:** RSM Roma (licenza non dichiarata), MIT velox
   (licenza non dichiarata), Leicester (licenza non dichiarata), Bern/Ginevra (licenza da verificare),
   Parigi BO 2019 (notspecified), Barcellona (verificare presenza coordinate nel dataset).
4. **Non importare:** CC BY-SA (Toscana) e qualsiasi dataset share-alike senza permesso (matrice § 3.5).
5. **Norme tecniche di import:**
   - Attribuzione per-fonte nella pagina `/licenze` + campo `source` nel record + header esportazioni
     (vincolo README workstream; `app/lib/data-license.ts`).
   - Riproiezione: Amsterdam è in **EPSG:28992** (RD New) → WGS84; verificare SRID per ogni fonte.
   - Encoding: Madrid CSV in Latin-1; Zürich CSV con BOM UTF-8.
   - Dedupe/merge: OSM è la base di integrazione (stessa licenza); le fonti comunali vanno matchate su
     `operator`/indirizzo/vicinanza (es. varchi Milano ↔ nodi OSM).
   - Non usare l'API OSM per bulk; usare estratti Geofabrik/Planet (policy OSMF).
6. **Prossimo task (FONTI #3, normalizzazione-pipeline.md):** definire schema normalizzato (id sorgente,
   tipo, gestore, direzione, data verifica) e job di refresh (cadenza consigliata: mensile per le fonti
   statiche, live per WFS/API).

---

## 6. Appendice — anomalie QA rilevate durante la verifica (2026-08-04)

- **velox.mit.gov.it**: dataset senza coordinate (solo registro per accertatore); licenza non dichiarata.
- **Madrid videovigilancia CSV**: nessun lat/lon nel file tabellare (solo `Ubicación` testuale) — le
  coordinate sono nei dataset tráfico (KML/Geo).
- **Milano**: pagina HTML dietro bot-block 403 per agenti non-browser; API CKAN regolare.
- **Torino 5T**: feed XML `get_access_control` risponde 403 a User-Agent non-browser.
- **dati.gov.it / data.europa.eu**: API di ricerca non documentate / risposte 400-404 sui path standard;
  usare UI o SPARQL.
- **Overpass pubblico**: rate-limit/limiti su bbox grandi (Italia intera) — usare bbox cittadini o estratti.
- **opendata.swiss**: le licenze non sono esposte nel campo `license_title` dell'API CKAN (vanno lette
  dalla scheda/DCAT) — causa dei «da verificare» su Bern/Ginevra.
- **TfL**: endpoint swagger/docs instabile (Cloudflare 530); API `Place/Type/JamCam` stabile.
