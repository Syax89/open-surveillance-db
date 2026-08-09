# US legal matrix — public traffic cameras (2026-08-08)

Legal basis for publishing **positions** of public cameras (not
images) in OpenSurveillanceDB. Rule: **no clear basis = UNCERTAIN
= do not publish**. Doctrine: facts are not copyrightable (Feist v.
Rural Telephone, 1991) but contractual Terms of Use can limit reuse;
no database rights in the US; state works are NOT automatically public
domain (only the federal government, 17 U.S.C. § 105).

## Verdict per dataset/state

| State | Dataset | Legal basis | Verdict |
|---|---|---|---|
| Pennsylvania | PennDOT Traffic Cameras (1,410) | 511PA Terms: redistribution explicitly permitted with attribution | ✅ PUBLISHABLE |
| Maryland | MDOT CHART / CitiWatch / ATVES | Public domain + attribution (MD data policy) | ✅ PUBLISHABLE |
| Colorado | Denver HALO Cameras (259) | Denver Open Data Catalog policy: "licensed under CC BY 3.0" (verified text) | ✅ PUBLISHABLE (CC BY 3.0) |
| South Dakota | Sioux Falls Traffic Cameras | "open data licensed under CC BY 4.0" (ArcGIS licenseInfo) | ✅ PUBLISHABLE (CC BY 4.0) |
| Georgia | GDOT 511 (7,083) | 511GA FAQ: "No, our cameras do not record" — no explicit licence on the ArcGIS dataset | ⚠️ UNCERTAIN (no explicit basis) |
| Texas | TxDOT CCTV (2,798) | no declared licence | ⚠️ UNCERTAIN |
| Washington | WSDOT (1,700) | no explicit licence on data.wa.gov (only generic metadata) | ⚠️ UNCERTAIN |
| Ohio | OHGO (1,159) | OHGO account terms: no data-reuse clause | ⚠️ UNCERTAIN |
| N. Carolina | NCDOT (1,122) | terms: no data-reuse clause | ⚠️ UNCERTAIN |
| Vermont / NH | ITS_Publish / NH511 | disclaimer only, no licence | ⚠️ UNCERTAIN |
| New York | Thruway gantries (70) | **OPEN-NY Terms verified directly (PDF 2013-03-08): "least restrictive, no attribution, no share-alike, no pre-approval, use as you wish"** | ✅ **PUBLISHABLE** |
| Sweden | Trafikverket API Camera (~1,000) | **API licence: CC0 1.0** (official link "Licens - senaste versionen" → creativecommons.org/publicdomain/zero/1.0) | ✅ **PUBLISHABLE** |
| Texas | TxDOT CCTV (2,798) | licenseInfo: "provided for **informational purposes only**" | ⛔ NO (informational use, not reuse) |
| Arkansas | iDriveAr (49) | **Terms of Use EXPLICITLY FORBID** reuse | ⛔ NO |
| Illinois | IDOT (3,595) | CC BY-SA 2.0 — share-alike incompatible with the matrix (one-way rule) | ⛔ NO |
| Michigan | Detroit (7,977) | CC BY-SA 4.0 + Mapillary-derived | ⛔ NO |

## Already imported (explicit licences)

| State | Dataset | Licence |
|---|---|---|
| California | Caltrans Highway CCTV (2,936) | CC BY 4.0 (ArcGIS licenseInfo) |
| DC | DDOT Traffic Cameras (314) | CC BY 4.0 |
| Louisiana | New Orleans (103) | CC0 |
| Colorado | Boulder Red Light (13) | CC0 |
| New York | Rochester (177) | ODbL 1.0 |
| California | SF red-light + speed (69) | PDDL |
| Minnesota | MnDOT Snow Plow (96) | CC BY 4.0 |

## States blocked by BY-SA licence (do NOT import without permission)

IDOT Illinois (3,595), Detroit MI (7,977) — share-alike: importing them
would require licensing the entire OSDB DB under BY-SA, incompatible with
the other sources (CC-BY/CC0/ODbL).

## States without a usable dataset

Montana, North Dakota, South Dakota (except Sioux Falls), Wyoming,
West Virginia, Rhode Island, New Hampshire — 511 web-app only, no
dataset/licence; no dataset = no import.

## Methodological notes

- Checks of 2026-08-08: official portals (511PA, MD data portal,
  denvergov.org/opendata, ArcGIS licenseInfo, data.ny.gov metadata API).
- Some state portals (GA/TX/WA/OH/NC) are under investigation: the
  511GA FAQ confirms that GDOT cameras **do not record** (no video
  retained) — relevant for the GDPR-like assessment, not for the
  licence. Targeted rescan needed before any possible import.
- Project criterion: even when facts are not copyrightable, we
  respect explicit Terms of Use (fail-closed).
