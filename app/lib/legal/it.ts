/**
 * Contenuto legale in italiano.
 *
 * Specchio del bundle inglese (app/lib/legal/en.ts), vincolato allo
 * stesso tipo `LegalContent`: una chiave mancante o estranea fa fallire
 * `tsc`, esattamente come il controllo di parità i18n (ADR 0007 —
 * l'inglese è la lingua pilota, l'italiano deve rispecchiarla).
 *
 * Adattamento web delle bozze legali:
 *   - docs/TERMS_OF_USE.md          → terms
 *   - docs/legal/PRIVACY_NOTICE.md  → privacy
 *   - docs/OPEN_SOURCE.md           → licenses
 *
 * Le copie repository restano la fonte canonica; questo file è il livello
 * di presentazione per le pagine pubbliche. Markup inline supportato:
 * **grassetto** e [etichetta](url).
 */
import type { LegalContent } from "./types";

export const itLegal: LegalContent = {
  privacy: {
    eyebrow: "Legale · Privacy",
    title: "Informativa sulla privacy",
    intro:
      "Come OpenSurveillanceDB tratta i dati personali, cosa pubblichiamo, cosa non raccogliamo mai e come puoi esercitare i tuoi diritti ai sensi del GDPR.",
    versionNote:
      "Versione 0.4 — 1 agosto 2026. Bozza per la revisione pre-lancio; la copia repository (docs/legal/PRIVACY_NOTICE.md) resta la versione canonica.",
    sections: [
      {
        heading: "1. Chi siamo (titolare del trattamento)",
        blocks: [
          {
            type: "paragraph",
            text: "**Titolare del trattamento:** Simone Rondina (syax89) / OpenSurveillanceDB — Italia.",
          },
          {
            type: "paragraph",
            text: "**Contatto privacy:** [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) — casella dedicata, da creare prima del lancio — per ogni domanda, richiesta dell'interessato o segnalazione. Prima risposta entro 48 ore, risposta sostanziale entro 14 giorni.",
          },
        ],
      },
      {
        heading: "2. Cosa fa il servizio",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB pubblica una mappa di interesse pubblico delle **infrastrutture di sorveglianza visibili e pubbliche** (ad esempio telecamere installate in strade, piazze, esterni di stazioni), verificate da moderatori formati prima della pubblicazione. È un progetto di trasparenza civica, non una piattaforma commerciale: niente pubblicità comportamentale, niente tracciamento, nessuna vendita di dati.",
          },
        ],
      },
      {
        heading: "3. Quali dati personali trattiamo",
        blocks: [
          {
            type: "paragraph",
            text: "La tabella seguente descrive i dati personali trattati dal Servizio, la loro origine, la finalità e la base giuridica.",
          },
          {
            type: "table",
            caption: "Dati personali trattati dal Servizio",
            headers: ["Dato", "Origine", "Finalità", "Base giuridica"],
            rows: [
              [
                "Contenuto della segnalazione: posizione, descrizione, produttore / data di osservazione facoltativi, note private",
                "Segnalante (interessato)",
                "Costruire il registro pubblico; coda di moderazione",
                "Art. 6(1)(f) GDPR",
              ],
              [
                "ID interno pseudonimo del contributore + data e ora di invio",
                "Segnalante",
                "Prevenzione degli abusi, provenienza",
                "Art. 6(1)(f) GDPR",
              ],
              [
                "Account del contributore (email, nome visualizzato facoltativo, hash della password)",
                "Contributore (registrazione volontaria)",
                "Accesso, attribuzione delle segnalazioni, prevenzione degli abusi",
                "Art. 6(1)(f) GDPR — minimizzazione: facoltativo, nickname pseudonimo, password hashata PBKDF2-SHA256, mai esposta nelle risposte API",
              ],
              [
                "Record di sessione (token hashato, token CSRF, data e ora)",
                "Il progetto (accesso)",
                "Mantenere l'accesso del contributore; protezione CSRF",
                "Art. 6(1)(f) GDPR; token memorizzato solo come SHA-256, scade dopo 30 giorni o alla disconnessione",
              ],
              [
                "Prove fotografiche (upload JPEG/PNG/WebP, fino a 10 MB / 4096 px)",
                "Segnalante",
                "Verifica del record",
                "Art. 6(1)(f) GDPR; EXIF/XMP/IPTC rimossi al confine (fail-closed), byte in R2 con metadati solo in D1, conservate privatamente e legate al record; mai pubbliche finché un moderatore approva con redazione confermata",
              ],
              [
                "Richiesta di correzione / rimozione (dati di contatto forniti dal richiedente, es. email)",
                "Richiedente",
                "Esercizio dei diritti, segnalazioni di danno",
                "Art. 6(1)(c) GDPR (artt. 15–22) e 6(1)(f)",
              ],
              [
                "Identità del moderatore (email, nome visualizzato, nome completo tramite accesso ChatGPT)",
                "OpenAI (fornitore di identità)",
                "Autenticare i moderatori; credenziali di moderazione separate",
                "Art. 6(1)(f) GDPR; mai registrata né memorizzata dall'applicazione",
              ],
              [
                "Voci di audit della moderazione (decisione, codice motivo, data e ora, pseudonimo del revisore)",
                "Il progetto",
                "Responsabilità, ricorsi",
                "Art. 6(1)(f) GDPR; mai pubbliche (solo report di trasparenza aggregati)",
              ],
              [
                "Record pubblicati",
                "Segnalazioni moderate / fonti pubbliche ufficiali",
                "Il dataset pubblico (ODbL 1.0)",
                "Art. 6(1)(f) / 6(1)(e) GDPR",
              ],
            ],
          },
          {
            type: "note",
            text: "**Record provenienti da fonti pubbliche ufficiali:** quando un record è ripubblicato da una fonte pubblica ufficiale, i dati non sono stati ottenuti dall'interessato. Categorie di origine: registri pubblici e portali di trasparenza delle pubbliche amministrazioni (ad esempio in Italia i dataset del D.Lgs. 33/2013), documenti pubblicati dalle autorità pubbliche e altre fonti ufficiali accessibili al pubblico. Tali record sono verificati caso per caso secondo il regime giuridico proprio della fonte.",
          },
          {
            type: "note",
            text: "**Conferimento volontario:** fornire dati per una segnalazione è **volontario** — non è un requisito di legge né contrattuale. L'unica conseguenza del mancato conferimento è che la segnalazione non può essere trattata. Non esiste alcun obbligo di fornire dati, né alcuna penalità per chi rifiuta.",
          },
          {
            type: "note",
            text: "**Categorie particolari (art. 9 GDPR):** nessuna viene raccolta intenzionalmente. Le prove che catturano incidentalmente persone identificabili, targhe o interni privati vengono oscurate o eliminate.",
          },
          {
            type: "note",
            text: "**Minori:** il servizio è rivolto ad adulti. In Italia, inviare una segnalazione richiede l'età del consenso per i servizi della società dell'informazione (14 anni, art. 2-quinquies D.Lgs. 196/2003); le altre giurisdizioni applicano le proprie soglie di età.",
          },
        ],
      },
      {
        heading: "4. Cosa NON raccogliamo né pubblichiamo",
        blocks: [
          {
            type: "list",
            items: [
              "**Niente video, live stream, credenziali, informazioni di rete o interfacce di controllo** — il progetto documenta l'*esistenza* di infrastrutture di sorveglianza visibili, mai il loro output o accesso.",
              "**Niente telecamere di case private** né telecamere puntate verso interni privati.",
              "**Niente nomi, volti, targhe o dettagli operativi precisi.**",
              "**Niente coordinate oltre la precisione di zona:** le posizioni pubblicate sono arrotondate a **~4 decimali (~10 m)**; la posizione esatta resta nel record privato di moderazione, visibile solo ai moderatori.",
              "**Niente pubblicità comportamentale, niente tracciamento, nessuna vendita di dati**, nessuna libreria di analisi.",
              "**Nessuna foto pubblicata senza moderazione e redazione confermata:** le foto caricate (JPEG/PNG/WebP, ≤10 MB / 4096 px) vengono private dei metadati EXIF/XMP/IPTC al confine (fail-closed — un contenitore che non può essere percorso in sicurezza viene rifiutato, mai memorizzato senza stripping), conservate con byte sanitizzati in R2 e metadati solo in D1, e **non sono mai pubbliche** finché un moderatore non le approva con `redaction_confirmed = 1`. La chiave di storage non viene mai esposta.",
              "Le segnalazioni sono conservate come pending e **non sono mai pubbliche** finché un moderatore non le approva. Il contenuto rifiutato non viene mai pubblicato.",
            ],
          },
        ],
      },
      {
        heading: "5. Destinatari e trasferimenti",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare, Inc.** — hosting e database (Workers + D1). Responsabile del trattamento (art. 28) ai sensi del Cloudflare Data Processing Addendum (DPA v6.3, giugno 2025) che incorpora le **clausole contrattuali standard UE (2021/914)**; Cloudflare è certificato ai sensi dell'**EU–US Data Privacy Framework**. D1 è configurato con residenza dati UE.",
              "**OpenAI (accesso ChatGPT)** — fornitore di identità per i moderatori. OpenAI è **titolare autonomo del proprio servizio di autenticazione** (la sua privacy policy si applica al momento dell'accesso); nessun dato di OpenSurveillanceDB viene inviato a OpenAI — riceviamo solo gli attributi di identità elencati sopra. Mai pubblicati, mai registrati.",
              "**La pubblicazione stessa:** i record verificati diventano parte di un dataset pubblico con licenza ODbL 1.0 e possono essere scaricati o esportati (JSON/CSV/GeoJSON). Le copie già scaricate non possono essere richiamate; i record rimossi sono esclusi dalle esportazioni future.",
              "Nessun altro destinatario; niente pubblicità comportamentale; nessuna libreria di analisi.",
            ],
          },
        ],
      },
      {
        heading: "6. Trasferimenti internazionali di dati",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare:** trasferimenti coperti dal DPA Cloudflare che incorpora le **clausole contrattuali standard UE (2021/914)**; misure supplementari valutate per il trattamento negli USA (crittografia in transito, residenza UE per D1).",
              "**Accesso OpenAI:** gli attributi di identità sono scambiati con i servizi OpenAI; il flusso di accesso è disciplinato dai termini e dalla privacy policy di OpenAI.",
            ],
          },
        ],
      },
      {
        heading: "7. Conservazione",
        blocks: [
          {
            type: "paragraph",
            text: "Segnalazioni pending: 90 giorni. Segnalazioni rifiutate: 30 giorni. Record verificati: **ciclo di revisione con rinnovo a 12 mesi**. Richieste di correzione e voci di audit: 2 anni. Prove: legate al record. Log operativi: fino a 12 mesi (aggregati). Backup: ruotati dal fornitore (fino a 30 giorni di ripristino point-in-time).",
          },
          {
            type: "paragraph",
            text: "L'applicazione automatica delle regole di cancellazione e scadenza è un elemento di implementazione pre-lancio; fino ad allora il calendario è applicato dal flusso di moderazione.",
          },
        ],
      },
      {
        heading: "8. I tuoi diritti (artt. 15–22 GDPR)",
        blocks: [
          {
            type: "paragraph",
            text: "Puoi richiedere, gratuitamente:",
          },
          {
            type: "list",
            items: [
              "**Accesso** (art. 15) — conferma e copia dei tuoi dati.",
              "**Rettifica** (art. 16) — correzione dei dati inesatti.",
              "**Cancellazione** (art. 17) — eliminazione, fatte salve le eccezioni dell'art. 17(3) e il calendario di conservazione.",
              "**Limitazione** (art. 18) e **opposizione** (art. 21).",
              "**Portabilità** (art. 20) — ove tecnicamente applicabile.",
              "Nessuna decisione automatizzata, incluso il profiling, viene effettuata (art. 22).",
            ],
          },
          {
            type: "paragraph",
            text: "**Come esercitarli:** scrivi a [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb). Per tutelare gli interessati, potremmo chiederti di verificare la tua identità, in modo proporzionato alla richiesta.",
          },
          {
            type: "paragraph",
            text: "**Tempi:** rispondiamo entro **1 mese** (art. 12(3)); per richieste complesse il termine può essere prorogato di altri 2 mesi, con avviso. In caso di rifiuto spieghiamo il motivo e ti ricordiamo il diritto di reclamo.",
          },
          {
            type: "paragraph",
            text: "**Reclami:** puoi rivolgerti all'autorità di controllo competente — in Italia, il [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Contatti e monitoraggio",
        blocks: [
          {
            type: "paragraph",
            text: "Contatto privacy: [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) — prima risposta entro 48 ore, risposta sostanziale entro 14 giorni.",
          },
          {
            type: "paragraph",
            text: "Questa informativa è rivista al lancio e successivamente almeno ogni anno, o in occasione di modifiche sostanziali; la cronologia delle versioni è conservata nel repository.",
          },
        ],
      },
    ],
  },

  terms: {
    eyebrow: "Legale · Termini di utilizzo",
    title: "Termini di utilizzo",
    intro:
      "Questi termini disciplinano l'uso di OpenSurveillanceDB, il database aperto e gestito dalla comunità delle infrastrutture di sorveglianza pubbliche e visibili. Si applicano all'applicazione web, all'API pubblica, alle esportazioni dei dati e ai servizi correlati (\"il Servizio\").",
    versionNote:
      "Versione 0.3 — 1 agosto 2026. Bozza per la revisione pre-lancio; la copia repository (docs/TERMS_OF_USE.md) resta la versione canonica.",
    sections: [
      {
        heading: "1. Chi siamo",
        blocks: [
          {
            type: "paragraph",
            text: "**Titolare / gestore:** Simone Rondina (syax89) / OpenSurveillanceDB — Italia (la formulazione definitiva dell'entità giuridica sarà confermata al lancio).",
          },
          {
            type: "paragraph",
            text: "**Contatto:** [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) — casella dedicata, da creare prima del lancio — per ogni domanda, correzione, ricorso o richiesta relativa alla privacy. Tempi di risposta: prima risposta entro 48 ore, decisione sostanziale entro 14 giorni.",
          },
        ],
      },
      {
        heading: "2. Cosa coprono questi termini",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB è un **progetto di trasparenza civica non commerciale, governato dalla comunità**, che documenta le **infrastrutture di sorveglianza pubbliche e visibili** (ad esempio telecamere installate in strade, piazze, esterni di stazioni). È gratuito: niente pubblicità, niente profilazione comportamentale, nessuna vendita di dati.",
              "Usando il Servizio accetti questi termini. Se **invi una segnalazione**, accetti inoltre gli obblighi di invio di cui alla sezione 5.",
              "Il Servizio non fornisce flussi video, strumenti di tracciamento, accesso a telecamere private né consigli su come eludere la sorveglianza legittima.",
            ],
          },
        ],
      },
      {
        heading: "3. Uso consentito del Servizio",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Consultazione:** navigare la mappa, l'elenco dei record e le singole pagine dei record; cercare e leggere il dataset pubblico.",
              "**Esportazioni:** scaricare i dati pubblici tramite le esportazioni JSON/CSV/GeoJSON e l'API pubblica, e riutilizzarli, nel rispetto della licenza ODbL 1.0 (sezione 7) e dei limiti anti-abuso della sezione 4.",
              "**Segnalazioni:** inviare osservazioni su infrastrutture di sorveglianza pubbliche e visibili per la moderazione umana. Le segnalazioni non sono mai garantite come pubblicate (sezione 5).",
              "**Finalità lecite:** i dati possono essere usati per ricerca, giornalismo, attivismo civico e per qualsiasi finalità compatibile con questi termini e con la licenza ODbL 1.0. Non è richiesto alcun account per navigare **né per segnalare**: gli invii possono essere anonimi o attribuiti a un account contributore gratuito facoltativo (email + nome visualizzato pseudonimo). I contributi usano un **ID interno pseudonimo**, mai un requisito di nome reale.",
            ],
          },
        ],
      },
      {
        heading: "4. Cosa non puoi fare",
        blocks: [
          {
            type: "paragraph",
            text: "**Contenuti vietati.** Le esclusioni della policy di moderazione si applicano a tutto ciò che invii, incluse segnalazioni, note ed eventuali futuri caricamenti di prove. In particolare, non inviare:",
          },
          {
            type: "list",
            items: [
              "telecamere residenziali o private, inclusi videocitofoni e telecamere puntate verso un'abitazione privata;",
              "video in diretta, URL di streaming, credenziali, informazioni di rete o interfacce di controllo;",
              "dettagli sul campo visivo o sulle capacità operative che potrebbero creare un rischio per la sicurezza;",
              "impianti o luoghi sensibili la cui pubblicazione potrebbe aumentare materialmente il rischio;",
              "immagini contenenti persone identificabili, targhe o interni privati, salvo che tu le abbia oscurate in modo sicuro **prima del caricamento** e che siano necessarie — il caricamento di prove fotografiche è **attivo** (sezione 5): le immagini vengono private dei metadati EXIF/XMP/IPTC al confine (fail-closed) e non vengono mai pubblicate finché un moderatore non le approva con redazione confermata;",
              "accuse non verificabili su persone o organizzazioni;",
              "contenuti che non hai il diritto di condividere.",
            ],
          },
          {
            type: "paragraph",
            text: "**Niente dati personali superflui.** Le segnalazioni e le note non devono contenere dati personali che non servono al registro pubblico (minimizzazione dei dati).",
          },
          {
            type: "paragraph",
            text: "**Niente abusi.** Non superare i limiti di frequenza applicabili, non fare scraping del Servizio oltre un ragionevole uso personale, non tentare di accedere a record non pubblici (pending, rifiutati, code di moderazione, richieste di correzione) e non aggirare i controlli di accesso né usare il Servizio per molestare o facilitare danni.",
          },
          {
            type: "paragraph",
            text: "**Nessuna rivendita commerciale del Servizio stesso.** Il riutilizzo dei *dati* ai sensi della licenza ODbL 1.0 (incluso il riutilizzo commerciale) resta consentito; questa clausola riguarda la rivendita del Servizio come prodotto.",
          },
        ],
      },
      {
        heading: "5. Segnalazioni e pubblicazione",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Nessuna garanzia di pubblicazione.** Ogni segnalazione entra nel database come pending. Moderatori umani formati la esaminano, verificano e decidono secondo la policy di moderazione. Una segnalazione può essere rifiutata, nascosta o rimossa in qualsiasi momento; il contenuto rifiutato non viene mai pubblicato ed è programmato per la cancellazione 30 giorni dopo la decisione di rifiuto.",
              "**Cosa conservi e cosa concedi.** Conservi tutti i diritti che hai sul contenuto che invii. Con l'invio concedi al progetto una licenza non esclusiva, mondiale, esente da royalty per conservare ed esaminare la segnalazione e — **solo se** il record viene verificato e pubblicato — per pubblicarla e renderla disponibile con licenza **ODbL 1.0**, come parte del database aperto, con attribuzione ai contributori secondo l'avviso ODbL. Il semplice atto di inviare non concede alcuna licenza di pubblicazione.",
              "**Le tue dichiarazioni.** Inviando confermi che: il contenuto è accurato al meglio delle tue conoscenze; hai il diritto di condividerlo; è conforme alla sezione 4; e hai l'età minima per usare il Servizio nella tua giurisdizione (in Italia, 14 anni).",
              "**La verifica può essere rifiutata.** I record ripubblicati da fonti pubbliche ufficiali seguono il proprio regime giuridico, verificato caso per caso; le segnalazioni della comunità sono verificate secondo lo standard di pubblicazione della moderazione, non contro registri ufficiali.",
              "**Prove fotografiche.** Le segnalazioni possono includere foto (JPEG, PNG o WebP, fino a **10 MB e 4096 px per lato**). Al caricamento, il servizio **rimuove i metadati EXIF/XMP/IPTC al confine** (fail-closed: se il contenitore non può essere percorso in sicurezza il caricamento viene rifiutato — mai memorizzato senza stripping), verifica il contenitore dai magic bytes (senza mai fidarsi del Content-Type dichiarato), conserva i byte sanitizzati nell'object storage (**R2**) con metadati solo nel database (**D1**), e tiene ogni foto **privata (`pending`) e mai pubblica** finché un moderatore non la approva con `redaction_confirmed = 1` — il moderatore deve confermare che il soggetto è stato oscurato. Le foto seguono la conservazione del record (cancellate col record; hard-delete immediato se il record viene rifiutato o rimosso). `storage_key` non viene mai esposto; i client interagiscono con le foto solo tramite id.",
            ],
          },
        ],
      },
      {
        heading: "6. Moderazione, correzioni, ricorsi",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "La moderazione segue la policy e i livelli di servizio pubblicati: nascondimenti d'emergenza entro **24 ore**, prima risposta entro **48 ore**, decisione sostanziale entro **14 giorni**, riesame dei nascondimenti temporanei entro **30 giorni**.",
              "Chiunque sia interessato da una decisione di moderazione può richiederne la correzione o la rimozione tramite il modulo di correzione nell'app (home page, sezione \"Segnala un problema / correzione\") o [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) entro **30 giorni** dalla decisione. I ricorsi sono decisi da un **revisore diverso** da quello della decisione originaria, con escalation per i casi contestati.",
              "I diritti dell'interessato (accesso, rettifica, cancellazione, limitazione, opposizione, portabilità) sono descritti nell'[informativa sulla privacy](/privacy) e si esercitano tramite lo stesso contatto.",
            ],
          },
        ],
      },
      {
        heading: "7. Licenze",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Dati:** il database pubblico e le sue esportazioni sono concessi con licenza **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** — il riutilizzo è consentito, anche a fini commerciali, a condizione di attribuire il database e, se crei un database derivato, di condividerlo con licenza ODbL 1.0. Le esportazioni riportano l'avviso ODbL. I record demo illustrativi fanno parte del database concesso in licenza.",
              "**Software:** il codice sorgente dell'applicazione è concesso con licenza **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)**.",
              "**Documentazione:** la documentazione di progetto è proposta con licenza [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).",
              "**OpenStreetMap:** i dati della mappa di base sono utilizzati secondo i termini OSM/ODbL; si applicano i requisiti di attribuzione OSM.",
            ],
          },
        ],
      },
      {
        heading: "8. Disclaimer sull'accuratezza",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB è un **dataset civico, mantenuto dalla comunità — non un registro ufficiale e non una dichiarazione di fatto giuridico.** Nonostante la moderazione umana, i record possono essere incompleti, obsoleti o imprecisi; la pubblicazione è deliberatamente prudente.",
              "Non fare affidamento sul dataset per decisioni critiche per la sicurezza o ufficiali. Verifica presso fonti ufficiali (ad esempio la pubblica amministrazione competente) prima di agire. Il Servizio fornisce informazioni solo sulle infrastrutture visibili — non è un elenco di tutte le telecamere, e l'assenza di un record non prova nulla.",
              "I record provenienti da fonti ufficiali riportano la fonte e la data di verifica; i record della comunità non offrono tale garanzia.",
              "Le coordinate pubblicate sono arrotondate a **~4 decimali (~10 m)** — precisione di zona. La posizione esatta non viene mai pubblicata e resta nel record privato di moderazione, visibile solo ai moderatori.",
            ],
          },
        ],
      },
      {
        heading: "9. Privacy",
        blocks: [
          {
            type: "paragraph",
            text: "Il tuo uso del Servizio è disciplinato dall'[informativa sulla privacy](/privacy). Punti chiave: niente tracciamento, niente pubblicità comportamentale; le segnalazioni sono private finché pending; i tuoi diritti GDPR si esercitano tramite [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) nei termini di legge (art. 12(3) GDPR).",
          },
        ],
      },
      {
        heading: "10. Disponibilità e limitazione di responsabilità",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Il Servizio è fornito **\"così com'è\" e \"come disponibile\"**, senza garanzie di accuratezza, completezza, disponibilità o idoneità a uno scopo particolare.",
              "Nella misura massima consentita dalla legge, il progetto e i suoi contributori **non sono responsabili** per alcun danno — inclusa la perdita indiretta, incidentale o consequenziale — derivante dall'uso o dall'affidamento sul Servizio o sui suoi dati. In particolare, il progetto non è responsabile per decisioni prese sulla base del dataset.",
              "Nessuna disposizione di questi termini esclude o limita la responsabilità che non può essere esclusa o limitata per legge (ad esempio frode, morte o lesioni personali causate da negligenza, diritti inderogabili di protezione dei consumatori).",
              "Il Servizio non è destinato all'uso di emergenza o critico per la sicurezza; non sostituisce i canali informativi ufficiali.",
            ],
          },
        ],
      },
      {
        heading: "11. Sospensione e rimozione",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Possiamo sospendere o limitare l'accesso, o rimuovere contenuti, quando necessario per far rispettare questi termini, per proteggere utenti o interessati, o secondo la policy di moderazione — con l'obiettivo di informare la persona interessata dove proporzionato e possibile.",
              "I contributori possono richiedere la cancellazione delle proprie segnalazioni pending tramite [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb); i record verificati e pubblicati sono soggetti al ciclo di conservazione e revisione con **rinnovo a 12 mesi** e al percorso di correzione della sezione 6.",
            ],
          },
        ],
      },
      {
        heading: "12. Legge applicabile e giurisdizione",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Questi termini sono disciplinati dal **diritto dell'UE e, ove applicabile, dal diritto italiano** — in particolare dal GDPR e dal D.Lgs. 196/2003 (Codice Privacy, come modificato dal D.Lgs. 101/2018).",
              "**Controversie:** hanno giurisdizione i tribunali del luogo in cui è stabilito il titolare (Italia), **fatto salvo** il diritto dei consumatori residenti nell'UE di adire i tribunali del proprio paese di residenza e la tutela delle loro disposizioni nazionali inderogabili.",
              "**Reclami:** puoi rivolgerti all'autorità di controllo competente — in Italia, il [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
            ],
          },
        ],
      },
      {
        heading: "13. Modifiche ai termini",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Questi termini sono versionati e conservati nel repository. **Le modifiche sostanziali** (finalità, licenze, pubblicazione dei dati, governance) richiedono una proposta pubblica documentata e un periodo ragionevole di commenti.",
              "Le modifiche non sostanziali prendono effetto alla pubblicazione, con apposito avviso. Il proseguimento dell'uso del Servizio dopo la data di efficacia costituisce accettazione; ove la legge richieda il consenso, questo sarà ottenuto separatamente.",
            ],
          },
        ],
      },
      {
        heading: "14. Contatti",
        blocks: [
          {
            type: "list",
            items: [
              "**Privacy, correzioni, ricorsi, diritti:** [privacy@opensurveillancedb](mailto:privacy@opensurveillancedb) (casella dedicata — da creare prima del lancio).",
              "Le emergenze di moderazione o abuso usano lo stesso canale (nascondimento entro 24 ore).",
            ],
          },
        ],
      },
    ],
  },

  licenses: {
    eyebrow: "Legale · Licenze",
    title: "Licenze",
    intro:
      "Come sono concessi in licenza il software, la documentazione e i dati di OpenSurveillanceDB, e cosa significa per il riutilizzo.",
    versionNote:
      "Aggiornato il 31 luglio 2026 (decisione sulla licenza dei dati — ADR 0008). La copia repository (docs/OPEN_SOURCE.md) resta la versione canonica.",
    sections: [
      {
        heading: "1. Software",
        blocks: [
          {
            type: "paragraph",
            text: "Il codice sorgente dell'applicazione è concesso con licenza **AGPL-3.0-or-later**. Questo mantiene disponibili alla comunità le versioni modificate dei servizi di rete. Vedi il file [LICENSE](https://github.com/Syax89/open-surveillance-db/blob/main/LICENSE).",
          },
        ],
      },
      {
        heading: "2. Documentazione",
        blocks: [
          {
            type: "paragraph",
            text: "Salvo diversa indicazione in un singolo documento, la documentazione di progetto è proposta con licenza [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). I contributori mantengono il riconoscimento dei propri contributi nella normale cronologia del repository.",
          },
        ],
      },
      {
        heading: "3. Database ed esportazioni",
        blocks: [
          {
            type: "paragraph",
            text: "Il database pubblico e ogni formato di esportazione sono concessi con licenza **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)**, con chiari avvisi di attribuzione e share-alike (decisione del 31 luglio 2026, [ADR 0008](https://github.com/Syax89/open-surveillance-db/blob/main/docs/decisions/0008-data-licence-precision-retention-contact.md)). Il riutilizzo è consentito, anche a fini commerciali, a condizione di attribuire il database e, se crei un database derivato, di condividerlo con licenza ODbL 1.0.",
          },
          {
            type: "note",
            text: "Questa scelta deve ancora essere verificata rispetto alle regole giurisdizionali, ai termini delle fonti e al modello dati definitivo prima della beta pubblica.",
          },
        ],
      },
      {
        heading: "4. Dati OpenStreetMap",
        blocks: [
          {
            type: "paragraph",
            text: "I dati OpenStreetMap sono disponibili con la [Open Database License](https://www.openstreetmap.org/copyright). Usare uno sfondo cartografico OSM non rende automaticamente ogni record del progetto un contributo OSM. Se i dati vengono importati da OSM, derivati o combinati in un database derivato, il progetto deve documentare il rapporto, fornire l'attribuzione richiesta e rispettare gli obblighi ODbL.",
          },
        ],
      },
      {
        heading: "5. Impegno dei contributori",
        blocks: [
          {
            type: "paragraph",
            text: "I contributori devono inviare solo materiale che hanno il diritto di condividere. Concedono al progetto i diritti necessari a pubblicare codice, documentazione e dati accettati con la licenza di progetto pertinente. Il caricamento di prove fotografiche è **attivo** (agosto 2026): le immagini vengono private dei metadati EXIF/XMP/IPTC al confine (fail-closed), conservate privatamente (byte in R2, metadati in D1), e mai pubblicate finché un moderatore non le approva con redazione confermata (vedi sezione 5 dei Termini).",
          },
        ],
      },
    ],
  },
};
