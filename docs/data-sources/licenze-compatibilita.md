# Compatibilità licenze fonti pubbliche → import nel database ODbL 1.0

**Worker:** Marie (Technical Writer, OpenSurveillanceDB Ltd.)
**Data:** 2026-08-04
**Task:** FONTI PUBBLICHE #2 — Analisi licenze (`t_36939a37`)
**Stato:** bozza per review legale (Rosa/DPO) e tecnica (Ada/CTO) — **non è un parere legale**
**Dipendenze:** parzialmente dal censimento fonti (`t_3edaf673`, in corso); i casi noti sono analizzati qui.

---

## 1. Contesto e scopo

Il progetto pubblica:

- **dati**: database e ogni formato di esportazione (JSON, CSV, GeoJSON) sotto **ODbL 1.0** (ADR 0008, 2026-07-31);
- **software**: **AGPL-3.0-or-later** (LICENSE);
- **documentazione**: **CC BY-SA 4.0** salvo diversa indicazione (OPEN_SOURCE.md).

Questo documento risponde alla domanda: *per ogni licenza tipica delle fonti pubbliche italiane ed EU, possiamo importare i dati nel nostro database ODbL? con quali obblighi?* e definisce il **pattern di attribuzione** per la pagina `/licenze` già esistente.

Regola di metodo: ogni affermazione legale è verificata contro la fonte citata in § 9; dove la risposta non è certa, il caso è marcato **«da verificare con legale»**.

---

## 2. Sintesi esecutiva

| Licenza fonte | Importabile in DB ODbL? | Obbligo principale | Share-alike? | Verdetto |
|---|---|---|---|---|
| **IODL 2.0** (standard PA italiana) | ✅ Sì | Attribuzione: fonte + nome licenziante + link licenza | No (IODL 1.0 sì, 2.0 no) | Importabile |
| **CC BY 4.0** | ✅ Sì, con attribuzione | Attribuzione + indicazione modifiche | No | Importabile |
| **CC0** | ✅ Sì, senza obblighi | Nessuno (buona pratica: citare comunque) | No | Importabile |
| **ODbL 1.0** (OSM) | ✅ Sì (stessa licenza) | Attribuzione «© OpenStreetMap contributors» + link | Sì, già soddisfatto (nostro DB è ODbL) | Importabile |
| **CC BY-SA** (3.0/4.0) | ❌ No senza permesso del titolare | — | Sì, incompatibile con ODbL | **Da verificare con legale** — di norma NO |
| **CC BY 3.0 IT** (Milano) | ✅ Sì, con attribuzione | Attribuzione + link licenza | No | Importabile |
| **Licence Ouverte 2.0** (fr-lo, Francia) | ✅ Sì, con attribuzione | Attribuzione + link (Etalab) | No | Importabile |
| **dl-de-by-2.0** (Datenlizenz Deutschland Namensnennung, Amburgo) | ✅ Sì, con attribuzione | «Quelle: [ente]» + link licenza | No | Importabile |
| **CC-BY generico** (DGT Spagna NAP) | ✅ Sì, con attribuzione | Attribuzione + link | No | Importabile |
| **Licenze custom ministeriali** | ⚠️ Caso per caso | Dipende dai termini | Dipende | **Da verificare con legale** per ogni fonte |
| **Nessuna licenza esplicita** (art. 52 CAD) | ✅ Sì, con base normativa | Documentare la base (open data by default) | No | Importabile con verifiche |

> **Regola generale (compatibilità unidirezionale):** una licenza *permissiva* (solo attribuzione: IODL 2.0, CC BY, CC0) può essere importata in un database *share-alike* (ODbL), perché chi rispetta gli obblighi ODbL rispetta anche quelli della licenza più permissiva. L'inverso no: una fonte share-alike (CC BY-SA) non può entrare in un database con clausole diverse, salvo permesso del titolare. Fonte: ODI Licence Compatibility Guide (§ "What is Compatibility?").

---

## 3. Matrice di compatibilità dettagliata

### 3.1 IODL 2.0 (Italian Open Data License v2.0)

**Cos'è:** licenza standard italiana per i dati pubblici, pubblicata da FormezPA/AgID (2018, aggiornata 2020), raccomandata dalle Linee Guida Open Data nazionali insieme a CC BY 4.0.

| Domanda | Risposta |
|---|---|
| Si può importare? | ✅ **Sì.** La IODL 2.0 concede espressamente: riprodurre, distribuire, pubblicare, estrarre e reimpiegare le informazioni, creare lavori derivati e combinarli (mashup), **anche per finalità commerciali** (art. 2, 3). |
| Attribuzione: come? | Indicare **la fonte delle Informazioni e il nome del Licenziante**, includendo, se possibile, **una copia della licenza o un link** ad essa (art. 2, condizioni). |
| Attribuzione: dove? | Nel nostro caso: riga di attribuzione per-fonte nella pagina `/licenze` + notizia di provenienza nel record (campo `source`) + nota nelle esportazioni. La licenza chiede "se possibile" il link: nel web è sempre possibile. |
| Share-alike? | **No.** La IODL 2.0 ha eliminato l'obbligo di pubblicare i lavori derivati con la stessa licenza (presente nella IODL 1.0). Fonte: comunicazione dati.gov.it (2020-11-11). |
| Altri obblighi | Non riutilizzare in modo che suggerisca **ufficialità** o approvazione del licenziante; prendere misure ragionevoli contro usi fuorvianti (art. 2). |
| Note legali | Licenza perpetua, gratuita, irrevocabile, non esclusiva, regolata dalla **legge italiana** (art. 5). I diritti cessano automaticamente se non si rispettano le condizioni (art. 5). Copre anche il **diritto sui generis del costitutore di banche di dati** (preambolo). |
| Riferimento autorevole | L'**OSMF Licence Working Group** ha valutato la **IODL 2.0 come compatibile** con OSM/ODbL (verbali LWG 2022-11-10) — conferma indipendente che l'import in un DB ODbL è ammissibile. |
| Verdetto | **Importabile.** Attribuzione obbligatoria (fonte + nome ente + link). |

### 3.2 CC BY 4.0 (Creative Commons Attribuzione 4.0 Internazionale)

**Cos'è:** licenza di attribuzione pura, valida internazionalmente; raccomandata dalle Linee Guida Open Data italiane insieme a IODL 2.0; molto usata dai portali comunali/regionali e da data.europa.eu.

| Domanda | Risposta |
|---|---|
| Si può importare? | ✅ **Sì, con attribuzione.** CC BY permette copia, distribuzione, modifica, estrazione e riutilizzo anche commerciale; l'unica condizione è l'attribuzione (art. 3 CC BY 4.0). La compatibilità unidirezionale permissiva→share-alike rende l'import in un DB ODbL ammissibile. |
| Attribuzione: come? | Titolo, autore/ente, licenza, link alla licenza, **indicazione delle modifiche** apportate (art. 3(a)(1) CC BY 4.0). Nel nostro caso: notare che le coordinate sono arrotondate (~4 decimali) e i campi sono stati ristrutturati. |
| Attribuzione: dove? | Pagina `/licenze` (riga per fonte) + metadati esportazione (header/attribution già presenti in `app/lib/data-license.ts`) + campo `source` nel record. |
| Share-alike? | **No.** CC BY non ha clausola share-alike. |
| Altri obblighi | Non suggerire che il licenziante approvi l'uso (art. 3(a)(1)(C)); non applicare misure tecnologiche restrittive (art. 3(a)(1)(D)). |
| Note legali | Le licenze CC non impongono condizioni contrattuali dove non esiste diritto d'autore o diritto sui generis (FAQ CC) — diverso da ODbL che è contrattuale. **Attenzione (cautela OSMF):** il LWG OSM nota che tutte le versioni CC BY hanno termini aggiuntivi che le rendono incompatibili con l'import **in OpenStreetMap** senza waiver (perché OSM non può fornire attribuzione per-fonte sui lavori derivati). Per il **nostro** database l'attribuzione per-fonte è invece prevista (pagina /licenze + export), quindi il problema OSM non si pone nello stesso modo; resta la necessità di portare l'attribuzione anche nei *produced works* (export). |
| Verdetto | **Importabile con attribuzione** (inclusa l'indicazione delle modifiche). Da tenere d'occhio: attribuzione per-fonte anche nelle esportazioni. |

### 3.3 CC0 1.0 (Public Domain Dedication)

**Cos'è:** dedica al pubblico dominio; non è una licenza ma uno strumento legale che rinuncia a tutti i diritti, inclusi i diritti sui generis sulle banche dati.

| Domanda | Risposta |
|---|---|
| Si può importare? | ✅ **Sì, liberamente.** Nessun obbligo. |
| Attribuzione: come/dove? | **Non richiesta.** Buona pratica di progetto: citare comunque la fonte nella pagina `/licenze` e nel record (provenienza), come fa lo stesso OSM con i propri contributori (OSMF LWG: CC0 "in general compatible"). |
| Share-alike? | No. |
| Note legali | CC0 copre **solo ciò di cui il licenziante ha realmente i diritti**: non fa dichiarazioni su materiale di terzi incluso (OSMF LWG). Prima di importare, verificare che il dataset non contenga dati di terzi con licenza diversa. |
| Verdetto | **Importabile senza obblighi.** |

### 3.4 ODbL 1.0 — OpenStreetMap (e altre fonti ODbL)

**Cos'è:** la stessa licenza del nostro database. OSM pubblica i propri dati geografici sotto ODbL 1.0 (dati successivi a settembre 2012; i precedenti sono stati rilicenziati a ODbL).

| Domanda | Risposta |
|---|---|
| Si può importare? | ✅ **Sì.** Licenza identica alla nostra: nessun conflitto di clausole. L'import crea un **database derivato**, che deve essere rilasciato sotto ODbL 1.0 o successiva/compatibile (§ 4.4 ODbL) — il nostro DB **è** ODbL 1.0, quindi il requisito è soddisfatto. |
| Attribuzione: come? | Testo **«© OpenStreetMap contributors»** con link a `https://www.openstreetmap.org/copyright`; rendere chiaro che i dati sono disponibili sotto ODbL (pagina copyright OSM). Per un *database* (non mappa): attribuzione + testo ODbL o link **come parte del database o dei suoi metadati** (OSMF Attribution Guidelines, § Databases). |
| Attribuzione: dove? | Pagina `/licenze` (riga OSM + link), footer mappa (già presente, vedi OSM_INTEGRATION.md), metadati delle esportazioni (header ODbL). |
| Share-alike? | **Sì** — ma già soddisfatto: il nostro DB è ODbL 1.0. Se in futuro cambiassimo licenza, OSM imporrebbe una licenza compatibile. |
| Altri obblighi (ODbL §§ 4.2–4.6) | Conservare gli avvisi di copyright/diritti esistenti; includere URI della licenza nel DB e nella documentazione; per i *produced works* (le nostre esportazioni) un avviso "Contains information from … available under the Open Database License"; **offrire il database derivato o il file delle alterazioni** in forma machine-readable a chi riceve un produced work (§ 4.6) — vedi § 5. |
| Note legali | Le condizioni di attribuzione OSM valgono anche per la mappa di sfondo (OSM_INTEGRATION.md); l'uso dei tile segue la Tile Usage Policy OSMF (già auditata). Non usare l'API OSM per download di massa (policy § 4): per import serve un **estratto ufficiale** (es. Geofabrik/Planet) o Overpass con cautela. |
| Verdetto | **Importabile.** Attribuzione «© OpenStreetMap contributors» + link; share-alike compatibile. |

### 3.5 CC BY-SA (3.0 IT / 4.0)

**Cos'è:** licenza share-alike di Creative Commons: i lavori derivati devono essere rilasciati con la stessa licenza (o una compatibile).

| Domanda | Risposta |
|---|---|
| Si può importare? | ❌ **Di norma NO, senza permesso del titolare.** Un database che incorpora dati CC BY-SA è un *lavoro derivato* e deve essere distribuito sotto CC BY-SA o sotto una licenza dichiarata compatibile da CC. **ODbL non è nella lista delle licenze compatibili CC BY-SA** (CC Compatible Licenses: per BY-SA 4.0 solo BY-SA 4.0/later, FAL 1.3, GPLv3 unidirezionale). Quindi un DB misto ODbL+CC BY-SA violerebbe una delle due clausole share-alike. |
| Eccezioni possibili | (a) **Permesso scritto del titolare** dei diritti; (b) usare solo *fatti* non protetti (i fatti puri non sono coperti da copyright — ma la selezione/struttura del dataset sì, e in EU il diritto sui generis protegge l'investimento sostanziale); (c) dati CC BY-SA pre-2012 di OSM sono già stati rilicenziati a ODbL, quindi OSM attuale non è un caso CC BY-SA. |
| Note legali | OSMF LWG elenca **tutte** le CC BY-SA tra le licenze specificamente incompatibili con OSM/ODbL. Le linee guida AgID sconsigliano le licenze share-alike per i dati pubblici proprio per evitare questi blocchi. |
| Verdetto | **Da verificare con legale** per ogni fonte specifica; presunzione di **non importabilità** senza accordo col titolare. |

### 3.6 Licenze custom ministeriali (es. portali di Ministeri, prefetture, forze di polizia)

**Situazione tipica:** ogni ministero/ente può pubblicare con termini propri; alcuni usano IODL 2.0 o CC BY, altri formule tipo "riproduzione consentita citando la fonte", altri nessuna licenza.

| Domanda | Risposta |
|---|---|
| Si può importare? | ⚠️ **Caso per caso.** Nessuna generalizzazione possibile. |
| Cosa rende una licenza custom compatibile? | Deve essere: mondiale (non territoriale), perpetua/irrevocabile, gratuita, senza divieti d'uso (anche commerciale), senza obbligo di usare la versione corrente, senza richieste di indennizzo, senza attribuzione per-fonte sui lavori derivati (criteri OSMF LWG). |
| Cosa la rende incompatibile? | Share-alike; uso non commerciale; attribuzione per-fonte obbligatoria sui prodotti derivati; limiti di tempo; revocabilità; copertura territoriale limitata. |
| Verdetto | **Da verificare con legale, per ogni fonte.** Se i termini equivalgono a IODL 2.0/CC BY 4.0 → importabile con attribuzione. Se sono formule ambigue ("diritti riservati", "uso consentito previa richiesta") → non importare senza chiarimento scritto con l'ente. |

### 3.7 Dati pubblicati senza licenza esplicita (art. 52 CAD)

**Norma:** art. 52, comma 2, D.Lgs. 82/2005 (CAD): *"I dati e i documenti che le amministrazioni titolari pubblicano, con qualsiasi modalità, senza l'espressa adozione di una licenza […] si intendono rilasciati come dati di tipo aperto ai sensi dell'articolo 68, comma 3, del presente Codice, ad eccezione dei casi in cui la pubblicazione riguardi dati personali."*

Cioè il principio **"open data by default"**: dati pubblicati da una PA senza licenza = dati aperti riutilizzabili da chiunque, anche commercialmente, in formato disaggregato e aperto, gratuiti o al costo marginale (art. 1, comma 1, lett. l-bis/l-ter CAD).

| Domanda | Risposta |
|---|---|
| Si può importare? | ✅ **Sì, con base normativa.** La PA che pubblica senza licenza ha già rilasciato i dati come aperti per legge. |
| Condizioni | 1) Il soggetto pubblicante deve essere una **PA** soggetta al CAD (art. 2, comma 2); 2) **niente dati personali** (eccezione esplicita della norma); 3) il dato deve essere in **formato aperto** e machine-readable (art. 1(1)(l-bis/l-ter)); 4) il riutilizzo è disciplinato dal D.Lgs. 36/2006 (come modificato dal D.Lgs. 200/2021, recepimento della Direttiva UE 2019/1024). |
| Attribuzione | La norma non impone attribuzione, ma la buona pratica e la nostra policy di provenienza la richiedono: citare l'ente e il dataset in `/licenze` e nel record. |
| Note legali — cautele | **Assenza di licenza ≠ assenza di diritti**: vale per le PA soggette al CAD; per soggetti privati o società in-house la presunzione non opera. **Verificare** che non esista una pagina licenze/termini d'uso del portale che restringa il riutilizzo (una licenza espressa prevale sul default). Verificare che il dataset non contenga dati personali o dati di terzi. In caso di dubbio, chiedere conferma scritta all'ente. |
| Verdetto | **Importabile con base art. 52 CAD**, documentando la base normativa e verificando i presupposti (PA, no dati personali, formato aperto). In dubbio → **da verificare con legale**. |

### 3.8 Altre licenze EU comuni (cenni)

| Licenza | Uso tipico | Compatibile con ODbL? |
|---|---|---|
| **Licence Ouverte 2.0** (Francia, Etalab) | data.gouv.fr | ✅ Sì — permissiva, solo attribuzione (osservazione OSMF: affine a CC BY). |
| **Open Government Licence 3.0** (UK) | data.gov.uk | ✅ Sì — allineata a CC BY 4.0. |
| **DL-DE/By-2.0** (Germania, GovData) | govdata.de | ⚠️ Richiede attribuzione per-fonte anche sui prodotti derivati: per OSM serve permesso speciale; per il nostro DB va valutato con legale (la pagina /licenze può soddisfare l'attribuzione). |
| **CC BY-NC / CC BY-ND** | progetti civici, dataset di ricerca | ❌ No — NC (uso non commerciale) e ND (no opere derivate) sono incompatibili con ODbL (ODI Guide; OSMF LWG). |

---

## 4. Obblighi ODbL rilevanti quando importiamo dati

Il nostro database è ODbL 1.0; ogni **import** di dati ODbL (OSM o altri) crea un *database derivato* ai sensi del § 4.4(b) ODbL (estrazione/riutilizzo di una parte sostanziale). Obblighi che il progetto deve già rispettare e che l'import rende operativi:

1. **Attribuzione del database sorgente** (§ 4.2): conservare gli avvisi di copyright/diritti e l'URI della licenza ODbL nel database derivato e nella documentazione.
2. **Notice per i produced works** (§ 4.3): ogni esportazione (JSON/CSV/GeoJSON) deve portare un avviso tipo *"Contains information from OpenSurveillanceDB, made available here under the Open Database License (ODbL)"* — già implementato in `app/lib/data-license.ts` (`DATA_LICENSE_NOTICE`), da mantenere allineato con `/licenze`.
3. **Share-alike** (§ 4.4): il DB derivato deve restare ODbL 1.0 (o successiva/compatibile) — già il nostro caso.
4. **Accesso al database derivato** (§ 4.6): chi riceve un produced work deve poter ottenere **in forma machine-readable l'intero database derivato o il file delle alterazioni** (gratis via internet). Implicazione pratica: il progetto deve rendere disponibile un **export completo del DB** (o un file di diff/alterazioni) — da pianificare con la pipeline di import (task FONTI #3).
5. **Niente misure tecnologiche restrittive** (§ 4.7): nessun DRM/termine aggiuntivo che limiti i diritti ODbL (la "parallel distribution" è consentita solo con copia libera parallela).

---

## 5. Pattern di attribuzione nel sito (pagina `/licenze`)

La pagina `/licenze` esiste (route `app/licenze/page.tsx`, contenuto in `app/lib/legal/en.ts`/`it.ts`, sezioni 1–5). Si propone di aggiungere una **sezione 6 «Fonti dei dati importati / Imported data sources»** (titolo bilingue come le altre sezioni), con una **tabella per fonte**:

### 5.1 Struttura consigliata della tabella

| Colonna | Esempio |
|---|---|
| **Fonte** | Comune di Milano — Open Data |
| **Dataset** | "Varchi elettronici ZTL" |
| **URL dataset** | `https://dati.comune.milano.it/dataset/…` |
| **Licenza** | IODL 2.0 (link) |
| **Data import** | 2026-08-10 |
| **Frequenza aggiornamento** | mensile |
| **Attribuzione richiesta** | "Fonte: Comune di Milano, dataset 'Varchi ZTL', licenza IODL 2.0 (link)" |
| **Note** | coordinate arrotondate a ~4 decimali; campi ristrutturati (modifica ai sensi CC BY/IODL) |

Per **OSM**: riga fissa *"Dati cartografici © OpenStreetMap contributors (ODbL)"* con link a `https://www.openstreetmap.org/copyright` (già presente come attribuzione mappa; da replicare nella tabella fonti quando si importano dati OSM).

### 5.2 Testi di attribuzione (EN/IT)

- IT: *«Fonte: [Ente], dataset "[nome]" ([URL]), concesso con [licenza] ([URL]). Coordinate arrotondate a ~4 decimali (~10 m).»*
- EN: *"Source: [Authority], dataset "[name]" ([URL]), licensed under [licence] ([URL]). Coordinates rounded to ~4 decimal places (~10 m)."*
- OSM: IT *«© OpenStreetMap contributors»* — EN *"© OpenStreetMap contributors"* — sempre linkato a `openstreetmap.org/copyright`.

### 5.3 Integrazione con le esportazioni

`app/lib/data-license.ts` contiene oggi un'unica notice ODbL (`DATA_LICENSE_NOTICE`), usata da `app/api/cameras/route.ts` per CSV/GeoJSON. Con le fonti importate serve:

- un **elenco fonti** (registry) accanto alla notice: una costante `IMPORTED_SOURCES` con {fonte, dataset, URL, licenza, attribuzione} che alimenti sia la pagina `/licenze` sia l'header delle esportazioni;
- mantenere il vincolo già documentato in `data-license.ts`: la notice è provvisoria fino al lancio e va tenuta coerente tra pagina `/licenze` e export.

### 5.4 Provenance per record

Il modello dati ha già il campo `source` (survey / official / demo). Per i record importati da fonti pubbliche: `source: "official"` + riferimento alla fonte (URL dataset) e alla data di verifica, come già previsto da TERMS_OF_USE § 8.3 e LAWFUL_BASIS § 3.2. La pagina `/licenze` resta il punto di sintesi per l'attribuzione aggregata.

---

## 6. Raccomandazioni operative

1. **Importare subito (nessun ostacolo legale):** fonti **CC0**, **ODbL** (OSM), **IODL 2.0**, **CC BY 4.0** — con attribuzione per-fonte in `/licenze` + export.
2. **Documentare la base normativa** per i dati PA senza licenza (art. 52 CAD): registrare ente, dataset, URL, data di verifica in un registry fonti (il censimento `t_3edaf673` fornirà la lista; la pipeline `t_74e02c5a` definirà lo schema).
3. **Non importare dati CC BY-SA** senza permesso scritto del titolare → escalation a Rosa (DPO) per ogni fonte candidata in questa categoria.
4. **Checklist per ogni fonte custom ministeriale:** territorio mondiale? perpetua? gratuita? uso commerciale consentito? niente share-alike? niente attribuzione per-fonte sui derivati? se una risposta è NO → **da verificare con legale** prima dell'import.
5. **Preparare l'export completo del DB** (o file di alterazioni) per rispettare ODbL § 4.6 quando si importano dati ODbL/OSM — coordinare con la pipeline (FONTI #3).
6. **Aggiornare la pagina `/licenze`** con la sezione fonti **prima** del primo import reale; aggiornare `data-license.ts` nello stesso momento (vincolo già documentato nel file).
7. **Chiedere review legale** (Rosa) del presente documento prima del primo import in produzione; questo documento non è un parere legale.

---

## 7. Casi marcati «da verificare con legale»

| Caso | Motivo |
|---|---|
| CC BY-SA 3.0/4.0 | Share-alike incompatibile con ODbL; serve permesso del titolare. |
| Licenze custom ministeriali | Termini non standard; valutazione per singola fonte. |
| Dati PA senza licenza | Presunzione open-data (art. 52 CAD) ma da verificare: soggetto PA, no dati personali, formato aperto, assenza di licenza espressa prevalente. |
| DL-DE/By-2.0 (DE) | Attribuzione per-fonte sui prodotti derivati: compatibilità da confermare. |
| Fonti che richiedono attribuzione per-fonte sui prodotti derivati | L'OSMF le considera incompatibili per OSM; per il nostro DB la pagina /licenze può soddisfarle, ma va confermato per ogni fonte. |

---

## 8. Fonti consultate (verificate il 2026-08-04)

1. **IODL 2.0 — testo integrale**: dati.gov.it — "Italian Open Data License v2.0" (`https://www.dati.gov.it/content/italian-open-data-license-v20`).
2. **IODL 2.0 — comunicazione FormezPA/AgID**: dati.gov.it — "Italian Open Data Licence 2.0: la nuova licenza italiana" (`https://www.dati.gov.it/iodl/2.0`).
3. **OSMF Licence Working Group — Licence/Licence Compatibility** (`https://osmfoundation.org/wiki/Licence/Licence_Compatibility`): IODL 2.0 compatibile (verbali 2022-11-10); CC BY-SA/NC/ND incompatibili; CC0 compatibile; criteri per licenze custom.
4. **OSMF Attribution Guidelines** (`https://osmfoundation.org/wiki/Attribution_Guidelines`): requisiti attribuzione per database e produced works.
5. **OpenStreetMap Copyright page** (`https://www.openstreetmap.org/copyright`): testo attribuzione e summary ODbL.
6. **ODbL 1.0 — testo integrale** (`https://opendatacommons.org/licenses/odbl/1-0/`): §§ 4.2–4.7 (notice, produced works, share-alike, accesso ai derivati).
7. **Open Data Commons Licenses FAQ** (`https://opendatacommons.org/faq/licenses/`): struttura ODbL, database vs contenuti.
8. **ODI — Licence Compatibility Guide** (`https://github.com/theodi/open-data-licensing/blob/master/guides/licence-compatibility.md`): compatibilità unidirezionale, matrice remix, incompatibilità ODbL×NC.
9. **Creative Commons — Compatible Licenses** (`https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses/`): elenco ufficiale licenze compatibili con BY-SA (ODbL non presente).
10. **Creative Commons — FAQ** (`https://creativecommons.org/faq/`): natura delle licenze CC vs ODbL, CC0 come dedication.
11. **Art. 52 CAD (D.Lgs. 82/2005)** — testo vigente: docs.italia.it (CAD, v2018-09-28) e brocardi.it; principio open-data-by-default.
12. **Linee Guida Open Data AgID** (`https://docs.italia.it/AgID/.../licenze-e-condizioni-di-riutilizzo.html`): licenze raccomandate (CC BY 4.0, IODL 2.0), open data by default.
13. **D.Lgs. 200/2021** (recepimento Direttiva UE 2019/1024): modifica D.Lgs. 36/2006 (fonte: dati.gov.it e docs.italia.it).
14. **Documenti di progetto**: ADR 0008, OPEN_SOURCE.md, TERMS_OF_USE.md § 7, LAWFUL_BASIS.md § 3.2, OSM_INTEGRATION.md, `app/lib/data-license.ts`, `app/api/cameras/route.ts`, `app/lib/legal/en.ts`/`it.ts`.

---

*Fine documento. Bozza per review: Rosa (DPO) — aspetti legali; Ada (CTO) — coerenza con modello dati/export.*
