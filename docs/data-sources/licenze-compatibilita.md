# Licence compatibility of public sources → import into the ODbL 1.0 database

**Worker:** project owner (Simone Rondina)
**Date:** 2026-08-04
**Task:** PUBLIC SOURCES #2 — Licence analysis (`t_36939a37`)
**Status:** draft for legal review (privacy/legal) and technical review (architecture) — **not a legal opinion**
**Dependencies:** partly on the source census (`t_3edaf673`, in progress); the known cases are analysed here.

---

## 1. Context and purpose

The project publishes:

- **data**: the database and every export format (JSON, CSV, GeoJSON) under **ODbL 1.0** (ADR 0008, 2026-07-31);
- **software**: **AGPL-3.0-or-later** (LICENSE);
- **documentation**: **CC BY-SA 4.0** unless stated otherwise (OPEN_SOURCE.md).

This document answers the question: *for every licence typical of Italian and EU public sources, can we import the data into our ODbL database? with which obligations?* and defines the **attribution pattern** for the existing `/licenze` page.

Method rule: every legal statement is checked against the source cited in § 9; where the answer is not certain, the case is marked **«to be verified with legal»**.

---

## 2. Executive summary

| Source licence | Importable into ODbL DB? | Main obligation | Share-alike? | Verdict |
|---|---|---|---|---|
| **IODL 2.0** (Italian PA standard) | ✅ Yes | Attribution: source + licensor name + licence link | No (IODL 1.0 yes, 2.0 no) | Importable |
| **CC BY 4.0** | ✅ Yes, with attribution | Attribution + indication of modifications | No | Importable |
| **CC0** | ✅ Yes, no obligations | None (good practice: cite anyway) | No | Importable |
| **ODbL 1.0** (OSM) | ✅ Yes (same licence) | Attribution «© OpenStreetMap contributors» + link | Yes, already satisfied (our DB is ODbL) | Importable |
| **CC BY-SA** (3.0/4.0) | ❌ No without the rights-holder's permission | — | Yes, incompatible with ODbL | **To be verified with legal** — normally NO |
| **CC BY 3.0 IT** (Milan) | ✅ Yes, with attribution | Attribution + licence link | No | Importable |
| **Licence Ouverte 2.0** (fr-lo, France) | ✅ Yes, with attribution | Attribution + link (Etalab) | No | Importable |
| **dl-de-by-2.0** (Datenlizenz Deutschland Namensnennung, Hamburg) | ✅ Yes, with attribution | «Quelle: [authority]» + licence link | No | Importable |
| **CC-BY generic** (DGT Spain NAP) | ✅ Yes, with attribution | Attribution + link | No | Importable |
| **OGL 2.0/3.0** (UK Open Government Licence, TfL/TfGM) | ✅ Yes, with attribution | © Crown copyright + licence link | No | Importable |
| **OGL-BC / OGL-Ontario** (Canada) | ✅ Yes, with attribution | Attribution + licence link | No | Importable |
| **NLOD 2.0** (Norway, NVDB) | ✅ Yes, with attribution | Attribution + licence link | No | Importable |
| **KOGL Type 1** (Korea, ITS) | ✅ Yes, with attribution | Attribution + licence link | No | Importable |
| **PDDL** (Open Data Commons Public Domain, San Francisco) | ✅ Yes, public domain | No obligations | No | Importable |
| **CC BY 3.0 AU** (Australia, TfNSW/QLD) | ✅ Yes, with attribution | Attribution + licence link | No | Importable |
| **Vlaamse Open Data Licentie v1.0** (Belgium) | ✅ Yes, with attribution | Attribution + licence link | No | Importable |
| **Custom ministerial licences** | ⚠️ Case by case | Depends on the terms | Depends | **To be verified with legal** for each source |
| **No explicit licence** (art. 52 CAD) | ✅ Yes, with a legal basis | Document the basis (open data by default) | No | Importable with checks |

> **General rule (one-way compatibility):** a *permissive* licence (attribution only: IODL 2.0, CC BY, CC0) can be imported into a *share-alike* database (ODbL), because whoever complies with the ODbL obligations also complies with the more permissive licence. The reverse does not hold: a share-alike source (CC BY-SA) cannot enter a database with different clauses, except with the rights-holder's permission. Source: ODI Licence Compatibility Guide (§ "What is Compatibility?").

---

## 3. Detailed compatibility matrix

### 3.1 IODL 2.0 (Italian Open Data License v2.0)

**What it is:** the standard Italian licence for public data, published by FormezPA/AgID (2018, updated 2020), recommended by the national Open Data Guidelines together with CC BY 4.0.

| Question | Answer |
|---|---|
| Can it be imported? | ✅ **Yes.** IODL 2.0 expressly grants: reproducing, distributing, publishing, extracting and reusing the information, creating derivative works and combining them (mashups), **including for commercial purposes** (art. 2, 3). |
| Attribution: how? | Indicate **the source of the Information and the name of the Licensor**, including, if possible, **a copy of the licence or a link** to it (art. 2, conditions). |
| Attribution: where? | In our case: per-source attribution line on the `/licenze` page + provenance notice in the record (`source` field) + note in the exports. The licence asks for the link "if possible": on the web it is always possible. |
| Share-alike? | **No.** IODL 2.0 removed the obligation to publish derivative works under the same licence (present in IODL 1.0). Source: dati.gov.it communication (2020-11-11). |
| Other obligations | Do not reuse in a way that suggests **official status** or endorsement by the licensor; take reasonable measures against misleading uses (art. 2). |
| Legal notes | Perpetual, free, irrevocable, non-exclusive licence, governed by **Italian law** (art. 5). Rights lapse automatically if the conditions are not respected (art. 5). It also covers the **sui generis database right** (preamble). |
| Authoritative reference | The **OSMF Licence Working Group** evaluated **IODL 2.0 as compatible** with OSM/ODbL (LWG minutes 2022-11-10) — independent confirmation that importing into an ODbL DB is admissible. |
| Verdict | **Importable.** Mandatory attribution (source + authority name + link). |

### 3.2 CC BY 4.0 (Creative Commons Attribution 4.0 International)

**What it is:** a pure attribution licence, internationally valid; recommended by the Italian Open Data Guidelines together with IODL 2.0; widely used by municipal/regional portals and data.europa.eu.

| Question | Answer |
|---|---|
| Can it be imported? | ✅ **Yes, with attribution.** CC BY allows copying, distribution, modification, extraction and reuse including commercial; the only condition is attribution (art. 3 CC BY 4.0). The one-way permissive→share-alike compatibility makes import into an ODbL DB admissible. |
| Attribution: how? | Title, author/authority, licence, licence link, **indication of the modifications** made (art. 3(a)(1) CC BY 4.0). In our case: note that coordinates are rounded (~4 decimals) and fields have been restructured. |
| Attribution: where? | `/licenze` page (line per source) + export metadata (header/attribution already present in `app/lib/data-license.ts`) + `source` field in the record. |
| Share-alike? | **No.** CC BY has no share-alike clause. |
| Other obligations | Do not suggest that the licensor endorses the use (art. 3(a)(1)(C)); do not apply restrictive technological measures (art. 3(a)(1)(D)). |
| Legal notes | CC licences do not impose contractual conditions where no copyright or sui generis right exists (CC FAQ) — unlike ODbL which is contractual. **Attention (OSMF caution):** the OSM LWG notes that all CC BY versions have additional terms that make them incompatible with import **into OpenStreetMap** without a waiver (because OSM cannot provide per-source attribution on derivative works). For **our** database per-source attribution is instead provided (the /licenze page + exports), so the OSM problem does not arise the same way; the need to carry attribution into the *produced works* (exports) remains. |
| Verdict | **Importable with attribution** (including the indication of modifications). To watch: per-source attribution also in the exports. |

### 3.3 CC0 1.0 (Public Domain Dedication)

**What it is:** a public-domain dedication; not a licence but a legal tool that waives all rights, including sui generis database rights.

| Question | Answer |
|---|---|
| Can it be imported? | ✅ **Yes, freely.** No obligations. |
| Attribution: how/where? | **Not required.** Project good practice: cite the source anyway on the `/licenze` page and in the record (provenance), as OSM itself does with its contributors (OSMF LWG: CC0 "in general compatible"). |
| Share-alike? | No. |
| Legal notes | CC0 covers **only what the licensor actually has rights to**: it makes no statements about third-party material included (OSMF LWG). Before importing, verify the dataset contains no third-party data under a different licence. |
| Verdict | **Importable with no obligations.** |

### 3.4 ODbL 1.0 — OpenStreetMap (and other ODbL sources)

**What it is:** the same licence as our database. OSM publishes its geographic data under ODbL 1.0 (data after September 2012; earlier data was relicensed to ODbL).

| Question | Answer |
|---|---|
| Can it be imported? | ✅ **Yes.** Licence identical to ours: no clause conflict. The import creates a **derived database**, which must be released under ODbL 1.0 or later/compatible (§ 4.4 ODbL) — our DB **is** ODbL 1.0, so the requirement is satisfied. |
| Attribution: how? | Text **«© OpenStreetMap contributors»** linked to `https://www.openstreetmap.org/copyright`; make clear the data is available under ODbL (OSM copyright page). For a *database* (not a map): attribution + ODbL text or link **as part of the database or its metadata** (OSMF Attribution Guidelines, § Databases). |
| Attribution: where? | `/licenze` page (OSM line + link), map footer (already present, see OSM_INTEGRATION.md), export metadata (ODbL header). |
| Share-alike? | **Yes** — but already satisfied: our DB is ODbL 1.0. If we ever changed licence, OSM would require a compatible licence. |
| Other obligations (ODbL §§ 4.2–4.6) | Preserve existing copyright/rights notices; include the licence URI in the DB and in the documentation; for *produced works* (our exports) a notice "Contains information from … available under the Open Database License"; **offer the derived database or the alterations file** in machine-readable form to anyone receiving a produced work (§ 4.6) — see § 5. |
| Legal notes | The OSM attribution conditions also apply to the background map (OSM_INTEGRATION.md); tile use follows the OSMF Tile Usage Policy (already audited). Do not use the OSM API for bulk downloads (policy § 4): for import use an **official extract** (e.g. Geofabrik/Planet) or Overpass with caution. |
| Verdict | **Importable.** Attribution «© OpenStreetMap contributors» + link; share-alike compatible. |

### 3.5 CC BY-SA (3.0 IT / 4.0)

**What it is:** a Creative Commons share-alike licence: derivative works must be released under the same licence (or a compatible one).

| Question | Answer |
|---|---|
| Can it be imported? | ❌ **Normally NO, without the rights-holder's permission.** A database incorporating CC BY-SA data is a *derivative work* and must be distributed under CC BY-SA or under a licence declared compatible by CC. **ODbL is not in the list of CC BY-SA compatible licences** (CC Compatible Licenses: for BY-SA 4.0 only BY-SA 4.0/later, FAL 1.3, GPLv3 one-way). So a mixed ODbL+CC BY-SA DB would violate one of the two share-alike clauses. |
| Possible exceptions | (a) **Written permission from the rights-holder**; (b) using only unprotected *facts* (pure facts are not copyrightable — but the selection/structure of the dataset is, and in the EU the sui generis right protects substantial investment); (c) pre-2012 OSM CC BY-SA data has already been relicensed to ODbL, so current OSM is not a CC BY-SA case. |
| Legal notes | The OSMF LWG lists **all** CC BY-SA versions among the licences specifically incompatible with OSM/ODbL. AgID guidelines advise against share-alike licences for public data precisely to avoid these blocks. |
| Verdict | **To be verified with legal** for each specific source; presumption of **non-importability** without an agreement with the rights-holder. |

### 3.6 Custom ministerial licences (e.g. Ministry portals, prefectures, police forces)

**Typical situation:** each ministry/authority may publish under its own terms; some use IODL 2.0 or CC BY, others formulas like "reproduction permitted with source citation", others no licence at all.

| Question | Answer |
|---|---|
| Can it be imported? | ⚠️ **Case by case.** No generalisation possible. |
| What makes a custom licence compatible? | It must be: worldwide (not territorial), perpetual/irrevocable, free, no use restrictions (including commercial), no requirement to use the current version, no indemnity demands, no per-source attribution on derivative works (OSMF LWG criteria). |
| What makes it incompatible? | Share-alike; non-commercial use; mandatory per-source attribution on derived products; time limits; revocability; limited territorial coverage. |
| Verdict | **To be verified with legal, per source.** If the terms are equivalent to IODL 2.0/CC BY 4.0 → importable with attribution. If they are ambiguous formulas ("all rights reserved", "use permitted on request") → do not import without written clarification with the authority. |

### 3.7 Data published without an explicit licence (art. 52 CAD)

**Norm:** art. 52, paragraph 2, D.Lgs. 82/2005 (CAD): *"Data and documents that the owner administrations publish, by any means, without the express adoption of a licence […] are understood to be released as open data within the meaning of article 68, paragraph 3, of this Code, except where the publication concerns personal data."*

That is, the **"open data by default"** principle: data published by a PA without a licence = open data reusable by anyone, including commercially, in disaggregated and open format, free or at marginal cost (art. 1, paragraph 1, letters l-bis/l-ter CAD).

| Question | Answer |
|---|---|
| Can it be imported? | ✅ **Yes, with a legal basis.** The PA publishing without a licence has already released the data as open by law. |
| Conditions | 1) The publisher must be a **PA** subject to the CAD (art. 2, paragraph 2); 2) **no personal data** (explicit exception in the norm); 3) the data must be in **open and machine-readable format** (art. 1(1)(l-bis/l-ter)); 4) reuse is governed by D.Lgs. 36/2006 (as amended by D.Lgs. 200/2021, transposing EU Directive 2019/1024). |
| Attribution | The norm does not require attribution, but good practice and our provenance policy do: cite the authority and the dataset on `/licenze` and in the record. |
| Legal notes — cautions | **Absence of licence ≠ absence of rights**: it applies to PAs subject to the CAD; for private subjects or in-house companies the presumption does not operate. **Verify** that no licence/terms-of-use page on the portal restricts reuse (an express licence prevails over the default). Verify the dataset contains no personal data or third-party data. In doubt, ask the authority for written confirmation. |
| Verdict | **Importable under art. 52 CAD**, documenting the legal basis and verifying the preconditions (PA, no personal data, open format). In doubt → **to be verified with legal**. |

### 3.8 Other common EU licences (overview)

| Licence | Typical use | Compatible with ODbL? |
|---|---|---|
| **Licence Ouverte 2.0** (France, Etalab) | data.gouv.fr | ✅ Yes — permissive, attribution only (OSMF observation: akin to CC BY). |
| **Open Government Licence 3.0** (UK) | data.gov.uk | ✅ Yes — aligned with CC BY 4.0. |
| **DL-DE/By-2.0** (Germany, GovData) | govdata.de | ⚠️ Requires per-source attribution also on derived products: for OSM special permission is needed; for our DB it must be assessed with legal (the /licenze page can satisfy the attribution). |
| **CC BY-NC / CC BY-ND** | civic projects, research datasets | ❌ No — NC (non-commercial use) and ND (no derivative works) are incompatible with ODbL (ODI Guide; OSMF LWG). |

---

## 4. Relevant ODbL obligations when importing data

Our database is ODbL 1.0; every **import** of ODbL data (OSM or others) creates a *derived database* within the meaning of § 4.4(b) ODbL (extraction/reuse of a substantial part). Obligations the project must already comply with and that import makes operational:

1. **Attribution of the source database** (§ 4.2): preserve the copyright/rights notices and the ODbL licence URI in the derived database and in the documentation.
2. **Notice for produced works** (§ 4.3): every export (JSON/CSV/GeoJSON) must carry a notice like *"Contains information from OpenSurveillanceDB, made available here under the Open Database License (ODbL)"* — already implemented in `app/lib/data-license.ts` (`DATA_LICENSE_NOTICE`), to keep aligned with `/licenze`.
3. **Share-alike** (§ 4.4): the derived DB must remain ODbL 1.0 (or later/compatible) — already our case.
4. **Access to the derived database** (§ 4.6): anyone receiving a produced work must be able to obtain **in machine-readable form the entire derived database or the alterations file** (free via the internet). Practical implication: the project must make available a **full DB export** (or a diff/alterations file) — to plan with the import pipeline (task SOURCES #3).
5. **No restrictive technological measures** (§ 4.7): no DRM/extra terms limiting ODbL rights ("parallel distribution" is allowed only with a free parallel copy).

---

## 5. Attribution pattern on the site (`/licenze` page)

The `/licenze` page exists (route `app/licenze/page.tsx`, content in `app/lib/legal/en.ts`/`it.ts`, sections 1–5). It is proposed to add a **section 6 «Imported data sources»** (bilingual title like the other sections), with a **table per source**:

### 5.1 Recommended table structure

| Column | Example |
|---|---|
| **Source** | Comune di Milano — Open Data |
| **Dataset** | "Varchi elettronici ZTL" |
| **Dataset URL** | `https://dati.comune.milano.it/dataset/…` |
| **Licence** | IODL 2.0 (link) |
| **Import date** | 2026-08-10 |
| **Update frequency** | monthly |
| **Required attribution** | "Source: Comune di Milano, dataset 'Varchi ZTL', licence IODL 2.0 (link)" |
| **Notes** | coordinates rounded to ~4 decimals; fields restructured (modification under CC BY/IODL) |

For **OSM**: fixed line *"Map data © OpenStreetMap contributors (ODbL)"* linked to `https://www.openstreetmap.org/copyright` (already present as map attribution; replicate in the sources table when OSM data is imported).

### 5.2 Attribution texts (EN/IT)

- IT: *«Fonte: [Ente], dataset "[nome]" ([URL]), concesso con [licenza] ([URL]). Coordinate arrotondate a ~4 decimali (~10 m).»*
- EN: *"Source: [Authority], dataset "[name]" ([URL]), licensed under [licence] ([URL]). Coordinates rounded to ~4 decimal places (~10 m)."*
- OSM: IT «© OpenStreetMap contributors» — EN "© OpenStreetMap contributors" — always linked to `openstreetmap.org/copyright`.

### 5.3 Integration with exports

`app/lib/data-license.ts` today contains a single ODbL notice (`DATA_LICENSE_NOTICE`), used by `app/api/cameras/route.ts` for CSV/GeoJSON. With imported sources we need:

- a **source list** (registry) next to the notice: an `IMPORTED_SOURCES` constant with {source, dataset, URL, licence, attribution} feeding both the `/licenze` page and the export headers;
- keep the constraint already documented in `data-license.ts`: the notice is provisional until launch and must be kept coherent between the `/licenze` page and the exports.

### 5.4 Per-record provenance

The data model already has the `source` field (survey / official / demo). For records imported from public sources: `source: "official"` + reference to the source (dataset URL) and the verification date, as already provided by TERMS_OF_USE § 8.3 and LAWFUL_BASIS § 3.2. The `/licenze` page remains the synthesis point for the aggregated attribution.

---

## 6. Operational recommendations

1. **Import immediately (no legal obstacle):** **CC0**, **ODbL** (OSM), **IODL 2.0**, **CC BY 4.0** sources — with per-source attribution on `/licenze` + exports.
2. **Document the legal basis** for PA data without a licence (art. 52 CAD): record authority, dataset, URL, verification date in a source registry (the census `t_3edaf673` will provide the list; the pipeline `t_74e02c5a` will define the schema).
3. **Do not import CC BY-SA data** without the rights-holder's written permission → escalate to the privacy/legal contact for every candidate source in this category.
4. **Checklist for every custom ministerial source:** worldwide territory? perpetual? free? commercial use allowed? no share-alike? no per-source attribution on derivatives? if any answer is NO → **to be verified with legal** before import.
5. **Prepare the full DB export** (or alterations file) to comply with ODbL § 4.6 when importing ODbL/OSM data — coordinate with the pipeline (SOURCES #3).
6. **Update the `/licenze` page** with the sources section **before** the first real import; update `data-license.ts` at the same time (constraint already documented in the file).
7. **Ask for a legal review** of this document before the first production import; this document is not a legal opinion.

---

## 7. Cases marked «to be verified with legal»

| Case | Reason |
|---|---|
| CC BY-SA 3.0/4.0 | Share-alike incompatible with ODbL; requires the rights-holder's permission. |
| Custom ministerial licences | Non-standard terms; per-source assessment. |
| PA data without a licence | Open-data presumption (art. 52 CAD) but to verify: PA subject, no personal data, open format, absence of a prevailing express licence. |
| DL-DE/By-2.0 (DE) | Per-source attribution on derived products: compatibility to confirm. |
| Sources requiring per-source attribution on derived products | OSMF considers them incompatible for OSM; for our DB the /licenze page can satisfy them, but it must be confirmed per source. |

---

## 8. Sources consulted (verified on 2026-08-04)

1. **IODL 2.0 — full text**: dati.gov.it — "Italian Open Data License v2.0" (`https://www.dati.gov.it/content/italian-open-data-license-v20`).
2. **IODL 2.0 — FormezPA/AgID communication**: dati.gov.it — "Italian Open Data Licence 2.0: la nuova licenza italiana" (`https://www.dati.gov.it/iodl/2.0`).
3. **OSMF Licence Working Group — Licence/Licence Compatibility** (`https://osmfoundation.org/wiki/Licence/Licence_Compatibility`): IODL 2.0 compatible (minutes 2022-11-10); CC BY-SA/NC/ND incompatible; CC0 compatible; criteria for custom licences.
4. **OSMF Attribution Guidelines** (`https://osmfoundation.org/wiki/Attribution_Guidelines`): attribution requirements for databases and produced works.
5. **OpenStreetMap Copyright page** (`https://www.openstreetmap.org/copyright`): attribution text and ODbL summary.
6. **ODbL 1.0 — full text** (`https://opendatacommons.org/licenses/odbl/1-0/`): §§ 4.2–4.7 (notice, produced works, share-alike, access to derivatives).
7. **Open Data Commons Licenses FAQ** (`https://opendatacommons.org/faq/licenses/`): ODbL structure, database vs contents.
8. **ODI — Licence Compatibility Guide** (`https://github.com/theodi/open-data-licensing/blob/master/guides/licence-compatibility.md`): one-way compatibility, remix matrix, ODbL×NC incompatibility.
9. **Creative Commons — Compatible Licenses** (`https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses/`): official list of licences compatible with BY-SA (ODbL not present).
10. **Creative Commons — FAQ** (`https://creativecommons.org/faq/`): nature of CC licences vs ODbL, CC0 as a dedication.
11. **Art. 52 CAD (D.Lgs. 82/2005)** — current text: docs.italia.it (CAD, v2018-09-28) and brocardi.it; open-data-by-default principle.
12. **AgID Open Data Guidelines** (`https://docs.italia.it/AgID/.../licenze-e-condizioni-di-riutilizzo.html`): recommended licences (CC BY 4.0, IODL 2.0), open data by default.
13. **D.Lgs. 200/2021** (transposition of EU Directive 2019/1024): amendment of D.Lgs. 36/2006 (source: dati.gov.it and docs.italia.it).
14. **Project documents**: ADR 0008, OPEN_SOURCE.md, TERMS_OF_USE.md § 7, LAWFUL_BASIS.md § 3.2, OSM_INTEGRATION.md, `app/lib/data-license.ts`, `app/api/cameras/route.ts`, `app/lib/legal/en.ts`/`it.ts`.

---

*End of document. Draft for review: privacy/legal — legal aspects; architecture — consistency with the data model/exports.*
