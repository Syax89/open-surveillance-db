// Licence gate for the import pipeline (FONTI PUBBLICHE FASE A, kanban
// t_6030d390). The runner's `--apply` hard-gate: a descriptor whose licence
// is not in the importable set is refused BEFORE any row is written.
//
// The set mirrors the licence-compatibility matrix
// (docs/data-sources/licenze-compatibilita.md §2/§3): permissive licences
// (attribution-only) can be imported into an ODbL database because the
// ODbL obligations already satisfy them; share-alike incompatible licences
// (CC BY-SA, CC BY-NC/ND) are refused. The matrix is a draft pending legal
// review — treat this set as the operational snapshot and update it in the
// same PR that finalises the matrix.

/**
 * Licence identifiers the runner accepts for --apply. Match is exact on the
 * descriptor `license` string (case-sensitive, like the matrix rows).
 * Variants a source may write are listed explicitly — no fuzzy matching, so
 * an unknown licence string FAILS CLOSED (refuse the import, tell the
 * operator to review the licence).
 */
export const IMPORTABLE_LICENSES = new Set([
  // Italian open-data standard (PA) — attribution only, no share-alike.
  "IODL 2.0",
  // Creative Commons Attribution — attribution only.
  "CC BY 4.0",
  // CC BY 4.0 variante Neozelandese (Wellington City Council CCTV,
  // licenseInfo "New Zealand Creative Commons Attribute License 4.0"
  // — stessa classe attribution-only, verificato cron 2026-08-09).
  "CC BY 4.0 (NZ)",
  "CC-BY 4.0",
  // CC BY senza versione esplicita (metadata CKAN brasiliano
  // "Creative Commons Attribution" — Belo Horizonte BHTRANS,
  // attribuzione-only, verificato cron 2026-08-09).
  "CC BY",
  // CC BY 3.0 Italia (Comune di Milano — open data CKAN dichiara 'cc-by'
  // senza versione; la 3.0 IT è quella storica del portale, da confermare
  // con l'ente prima del primo import in produzione). Permissiva, solo
  // attribuzione — stessa classe di compatibilità di CC BY 4.0 (matrice
  // licenze-compatibilita.md § 3.2).
  "CC BY 3.0 IT",
  // Public-domain dedication — no obligations.
  "CC0",
  "CC0 1.0",
  "CC0-1.0",
  // Same licence as the destination database (OSM and other ODbL sources).
  "ODbL 1.0",
  "ODbL-1.0",
  "ODbL 1.0 (OSM)",
  // Other permissive EU licences the matrix marks compatible.
  "Licence Ouverte 2.0",
  // UK Open Government Licence family — attribution-only, same obligations
  // class as CC-BY. OGL 2.0: TfL JamCams API (verified 2026-08-08);
  // OGL 3.0: data.gov.uk TfGM speed cameras (verified 2026-08-08).
  "Open Government Licence 3.0",
  "OGL 3.0",
  "Open Government Licence 2.0",
  "OGL 2.0",
  // Canadian OGL variants — attribution-only (verified 2026-08-08):
  // DriveBC via data.gov.bc.ca CKAN API declares exactly
  // "Open Government Licence - British Columbia".
  "Open Government Licence - British Columbia",
  "OGL-BC",
  "Open Government Licence - Ontario",
  "OGL-Ontario",
  // Norwegian open-data standard (NVDB API v3, 13.444 kamera objects,
  // verified 2026-08-08): attribution-only, same class as CC-BY.
  "NLOD 2.0",
  "Norwegian Licence for Open Government Data 2.0",
  // Korea Open Government License — free use with attribution (KOGL Type 1).
  "KOGL Type 1",
  "KOGL",
  // Serbia — Serbian Open Data License (SODL): terms page data.gov.rs/sr/terms
  // explicitly permits commercial and non-commercial reuse, copying,
  // distribution, third-party availability, adaptation and merging, with
  // attribution and change marking (verified cron 2026-08-15, City of
  // Subotica datasets). Same obligations class as CC-BY.
  "Serbian Open Data License",
  "SODL",
  // Taiwan — Taiwan Open Government Data License v1 (data.gov.tw):
  // attribution-only, same class as CC-BY (verified 2026-08-08; the source
  // is geoblocked from our networks — added for future imports, network
  // block is not a licence issue).
  "TW OGL v1",
  "Taiwan Open Government Data License v1",
  // Open Data Commons Public Domain Dedication — public domain,
  // no obligations (SF Socrata red-light/speed citation datasets).
  "PDDL",
  // Maryland (public domain + attribution) — MDOT SHA CHART, CitiWatch
  // Baltimore, ATVES. Verificato 2026-08-08: policy dati MD public domain.
  "Maryland public domain + attribution",
  // Pennsylvania — PennDOT terms: redistribuzione esplicitamente
  // consentita con attribuzione (511PA). Verificato 2026-08-08.
  "PennDOT terms (redistribuzione consentita)",
  // New York — OPEN-NY Terms of Use: "least restrictive, no
  // attribution, no share-alike, no pre-approval" (PDF verificato
  // 2026-08-08, data.ny.gov dataset 77gx-ii52).
  "NY OPEN-NY Terms of Use",
  // Ohio — ODOT: "the data from ODOT is considered public domain and
  // therefore freely available to anyone" (publicapi.ohgo.com, 2026-08-09).
  "public domain (ODOT)",
  // Kentucky — KYTC: CC0 1.0 dichiarato su maps.kytc.ky.gov (2026-08-09).
  "CC0 1.0",
  // New England 511 (VT/NH/ME) — Tri-State Developer Agreement:
  // use/reproduce/redistribute with attribution, no NC clause.
  "Tri-State Developer Agreement",
  "ODC PDDL 1.0",
  // Thailandia — Thai GD Catalog: "Open Data Common" (ODC) dichiarata
  // sul portale provinciale gdcatalog.go.th (Nakhon Ratchasima),
  // verificato cron 2026-08-09. ATTENZIONE: "Open Data Common" NON è una
  // licenza valida della famiglia Open Data Commons (ODbL/ODC-By/ODC-PDDL)
  // — stringa ambigua. DECISIONE PM 2026-08-09 (kanban t_8a0445a4):
  // mantenuta SOLO per Nakhon Ratchasima, dove l'adapter filtra le sole
  // camere pubbliche/governative (categoria 'ราชการ', 3.476 righe) per
  // ragioni di privacy; il 2° dataset Phetchaburi è stato RIMOSSO dal
  // dataset pubblico (batch non importato/rollback). Il mapping alla DGA
  // Open Government License resta un'opzione aperta (matrice § 3.9.3).
  "Open Data Common (ODC)",
  // Australian CC-BY 3.0 (TfNSW live cameras, QLD state roads — both
  // data.gov.au / data.qld.gov.au, attribution-only).
  "CC BY 3.0 AU",
  "CC-BY 3.0 AU",
  // Generic CC BY 3.0 — classe attribution-only. DECISIONE PM 2026-08-09
  // (kanban t_8a0445a4): il dataset Denver HALO NON espone licenza
  // esplicita (solo disclaimer del catalogo) → campo licenza del
  // descrittore corretto a "No explicit license — disclaimer (to be
  // confirmed)" e batch NON importabile finché confermato; la stringa
  // generica resta in allowlist per altre fonti CC BY 3.0.
  "CC BY 3.0",
  // Flemish open-data standard (Verkeerscentrum DATEX II v3 feed).
  "Vlaamse Open Data Licentie v1.0",
  // German open-data standard (dl-de-by-2.0) — attribution only, the same
  // obligations class as CC-BY (matrix licenze-compatibilita.md; verified
  // for the Hamburg Verkehrskameras source, CEO 2026-08-07).
  "Datenlizenz Deutschland Namensnennung 2.0 (dl-de-by-2.0)",
  "Datenlizenz Deutschland Namensnennung 2.0",
  "dl-de-by-2.0",
  // Swiss OGD standard — free use with mandatory attribution
  // (opendata.swiss terms; verified for Kanton Bern VIDEO, CEO 2026-08-07).
  "Open use. Attribution required (Kanton Bern)",
  // Generic CC-BY without version — NAP DGT España declares exactly
  // "Creative Commons Attribution" (no version) on its dataset page
  // (verified CEO 2026-08-08); attribution-only, same class as CC BY 4.0.
  "CC-BY",
  // No explicit licence but a statutory open-data basis (art. 52 CAD) —
  // only after the legal review has confirmed the specific source.
  "Open data (art. 52 CAD)",
]);

/** True when the descriptor licence is importable. */
export function isLicenceImportable(license) {
  return IMPORTABLE_LICENSES.has(license);
}

/** Human-readable list for error messages (sorted, stable). */
export function importableLicenceList() {
  return [...IMPORTABLE_LICENSES].sort();
}
