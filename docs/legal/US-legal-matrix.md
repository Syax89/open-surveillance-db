# Matrice legale USA — telecamere di traffico pubbliche (2026-08-08)

Base legale per pubblicare **posizioni** di telecamere pubbliche (non
immagini) in OpenSurveillanceDB. Regola: **nessuna base chiara = DUBBIO
= non si pubblica**. Dottrina: i fatti non sono copyrightable (Feist v.
Rural Telephone, 1991) ma i Terms of Use contrattuali possono limitare;
niente database rights negli USA; i lavori statali NON sono public domain
automatico (solo il governo federale, 17 U.S.C. § 105).

## Verdetto per dataset/stato

| Stato | Dataset | Base legale | Verdetto |
|---|---|---|---|
| Pennsylvania | PennDOT Traffic Cameras (1.410) | Terms 511PA: redistribuzione esplicitamente consentita con attribuzione | ✅ PUBBLICABILE |
| Maryland | MDOT CHART / CitiWatch / ATVES | Public domain + attribuzione (policy dati MD) | ✅ PUBBLICABILE |
| Colorado | Denver HALO Cameras (259) | Policy Denver Open Data Catalog: "licensed under CC BY 3.0" (testo verificato) | ✅ PUBBLICABILE (CC BY 3.0) |
| South Dakota | Sioux Falls Traffic Cameras | "open data licensed under CC BY 4.0" (licenseInfo ArcGIS) | ✅ PUBBLICABILE (CC BY 4.0) |
| Georgia | GDOT 511 (7.083) | 511GA FAQ: "No, our cameras do not record" — nessuna licenza esplicita sul dataset ArcGIS | ⚠️ DUBBIO (niente base esplicita) |
| Texas | TxDOT CCTV (2.798) | nessuna licenza dichiarata | ⚠️ DUBBIO |
| Washington | WSDOT (1.700) | nessuna licenza esplicita su data.wa.gov (solo metadata generici) | ⚠️ DUBBIO |
| Ohio | OHGO (1.159) | terms account OHGO: nessuna clausola riuso dati | ⚠️ DUBBIO |
| N. Carolina | NCDOT (1.122) | terms: nessuna clausola riuso dati | ⚠️ DUBBIO |
| Vermont / NH | ITS_Publish / NH511 | solo disclaimer, nessuna licenza | ⚠️ DUBBIO |
| New York | Thruway gantries (70) | data.ny.gov: license=None nel metadata dataset | ⚠️ DUBBIO |
| Arkansas | iDriveAr (49) | **Terms of Use VIETANO esplicitamente** il riuso | ⛔ NO |
| Illinois | IDOT (3.595) | CC BY-SA 2.0 — share-alike incompatibile con la matrice (regola unidirezionale) | ⛔ NO |
| Michigan | Detroit (7.977) | CC BY-SA 4.0 + Mapillary-derived | ⛔ NO |

## Già importati (licenze esplicite)

| Stato | Dataset | Licenza |
|---|---|---|
| California | Caltrans Highway CCTV (2.936) | CC BY 4.0 (licenseInfo ArcGIS) |
| DC | DDOT Traffic Cameras (314) | CC BY 4.0 |
| Louisiana | New Orleans (103) | CC0 |
| Colorado | Boulder Red Light (13) | CC0 |
| New York | Rochester (177) | ODbL 1.0 |
| California | SF red-light + speed (69) | PDDL |
| Minnesota | MnDOT Snow Plow (96) | CC BY 4.0 |

## Stati bloccati da licenza BY-SA (da NON importare senza permesso)

IDOT Illinois (3.595), Detroit MI (7.977) — share-alike: per importarle
servirebbe licenziare l'intero DB OSDB in BY-SA, incompatibile con le
altre fonti (CC-BY/CC0/ODbL).

## Stati senza dataset utilizzabile

Montana, North Dakota, South Dakota (tranne Sioux Falls), Wyoming,
West Virginia, Rhode Island, New Hampshire — solo web-app 511 senza
dataset/licenza; nessun dataset = nessun import.

## Note metodologiche

- Verifiche del 2026-08-08: portali ufficiali (511PA, MD data portal,
  denvergov.org/opendata, ArcGIS licenseInfo, data.ny.gov metadata API).
- Alcuni portali statali (GA/TX/WA/OH/NC) sono sotto indagine: la FAQ
  511GA conferma che le camere GDOT **non registrano** (nessun video
  conservato) — rilevante per la valutazione GDPR-like, non per la
  licenza. Riscansione mirata necessaria prima di eventuale import.
- Criterio del progetto: anche quando i fatti non sono copyrightable,
  rispettiamo i Terms of Use espliciti (fail-closed).
