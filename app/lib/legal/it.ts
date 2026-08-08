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
      "Versione 0.6 — 5 agosto 2026. Aggiornata per il modello community-driven (ADR 0021): le segnalazioni vengono pubblicate subito da account verificati; § 7 conservazione allineata al ciclo di revisione ritirato; § 10 (cookie) invariato. Risincronizzata con la PRIVACY_NOTICE canonica v0.11 mergiata (docs/legal/PRIVACY_NOTICE.md resta la versione canonica): tabella § 3 allineata alle disclosure canoniche (riga azioni della community aggiunta; finalità dell'audit di moderazione aggiornata a \"ricorsi storici chiusi con la migrazione\") e aggiunta la nota sulla cronologia pubblica degli eventi per record.",
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
            text: "**Contatto privacy:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — casella dedicata — per ogni domanda, richiesta dell'interessato o segnalazione. Prima risposta entro 48 ore, risposta sostanziale entro 14 giorni.",
          },
        ],
      },
      {
        heading: "2. Cosa fa il servizio",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB pubblica una mappa di interesse pubblico delle **infrastrutture di sorveglianza visibili e pubbliche** (ad esempio telecamere installate in strade, piazze, esterni di stazioni), pubblicate subito da account contributori verificati e mantenute accurate dalla community tramite conferme, segnalazioni e soglie automatiche (ADR 0021). È un progetto di trasparenza civica, non una piattaforma commerciale: niente pubblicità comportamentale, niente tracciamento, nessuna vendita di dati.",
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
                "Costruire il registro pubblico; azioni della community per l'accuratezza",
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
                "Richiesta di correzione / rimozione (dati di contatto forniti dal richiedente, es. email)",
                "Richiedente",
                "Esercizio dei diritti, segnalazioni di danno",
                "Art. 6(1)(c) GDPR (artt. 15–22) e 6(1)(f)",
              ],
              [
                "Azioni della community sui record (tipo di azione `like` / `confirm` / `gone` / `problem` / `privacy`, snapshot del peso, data e ora)",
                "Contributore (account verificato)",
                "Accuratezza del dataset — moderazione community-driven",
                "Art. 6(1)(f) GDPR; un'azione per utente per record (`UNIQUE(camera_id, contributor_id)`), peso catturato al momento dell'azione, **solo aggregati nei payload pubblici** — mai attribuiti a un profilo (ADR 0021 §3/§13)",
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
                "Responsabilità; ricorsi storici chiusi con la migrazione (ADR 0021 §7)",
                "Art. 6(1)(f) GDPR; mai pubbliche (solo report di trasparenza aggregati)",
              ],
              [
                "Record pubblicati",
                "Segnalazioni pubblicate / fonti pubbliche ufficiali",
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
            text: "**Cronologia pubblica degli eventi per record (ADR 0021 § 7):** ogni transizione della community (pubblicato, confermato, apprezzato, segnalato come non più presente, nascosto, rimosso, ripristinato) è registrata in una **cronologia pubblica del ciclo di vita senza alcuna attribuzione** — niente id di contributori, email o dati derivati da IP nelle righe pubbliche. È un controllo di trasparenza del titolare, non una nuova raccolta di dati personali (solo aggregati).",
          },
          {
            type: "note",
            text: "**Conferimento volontario:** fornire dati per una segnalazione è **volontario** — non è un requisito di legge né contrattuale. L'unica conseguenza del mancato conferimento è che la segnalazione non può essere trattata. Non esiste alcun obbligo di fornire dati, né alcuna penalità per chi rifiuta.",
          },
          {
            type: "note",
            text: "**Categorie particolari (art. 9 GDPR):** nessuna viene raccolta intenzionalmente. I contenuti che catturano incidentalmente persone identificabili, targhe o interni privati vengono oscurati o eliminati.",
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
              "**Niente coordinate oltre la precisione di zona:** le posizioni pubblicate sono arrotondate a **~4 decimali (~10 m)**; la posizione esatta resta nel database e non viene mai pubblicata.",
              "**Niente pubblicità comportamentale, niente tracciamento, nessuna vendita di dati**, nessuna libreria di analisi.",
              "Le segnalazioni vengono pubblicate subito da account verificati e fanno parte del dataset pubblico dal momento dell'invio. I contenuti che violano le regole vengono ritirati dalla community o per emergenza legale, e i contenuti ritirati non vengono mai ripubblicati.",
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
              "**La pubblicazione stessa:** i record pubblicati diventano parte di un dataset pubblico con licenza ODbL 1.0 e possono essere scaricati o esportati (JSON/CSV/GeoJSON). Le copie già scaricate non possono essere richiamate; i record ritirati sono esclusi dalle esportazioni future.",
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
            text: "Le segnalazioni vengono pubblicate subito e restano pubbliche finché la community continua a confermarle; i record ritirati dalla community o per emergenza legale sono esclusi dagli output pubblici e seguono il calendario di conservazione del repository (docs/legal/RETENTION_SCHEDULE.md). Richieste di correzione e voci di audit: 2 anni. Log operativi: fino a 12 mesi (aggregati). Backup: ruotati dal fornitore (fino a 30 giorni di ripristino point-in-time).",
          },
          {
            type: "paragraph",
            text: "Le regole di cancellazione e scadenza sono applicate automaticamente dallo sweep giornaliero di conservazione (vedi il calendario di conservazione nell'informativa privacy); le richieste di correzione e le voci di audit: 2 anni. Log operativi: fino a 12 mesi (aggregato). Backup: ruotati dal fornitore (fino a 30 giorni di point-in-time recovery).",
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
            text: "**Come esercitarli:** scrivi a [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Per tutelare gli interessati, potremmo chiederti di verificare la tua identità, in modo proporzionato alla richiesta.",
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
            text: "Contatto privacy: [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — prima risposta entro 48 ore, risposta sostanziale entro 14 giorni.",
          },
          {
            type: "paragraph",
            text: "Questa informativa è rivista al lancio e successivamente almeno ogni anno, o in occasione di modifiche sostanziali; la cronologia delle versioni è conservata nel repository.",
          },
        ],
      },
      {
        heading: "10. Cookie",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB utilizza un solo cookie funzionale:",
          },
          {
            type: "paragraph",
            text: "**opensurveillancedb-locale** — ricorda la lingua che hai scelto su questo dispositivo/browser (italiano o inglese). Viene impostato **solo quando cambi lingua**; non viene mai utilizzato per tracciarti.",
          },
          {
            type: "list",
            items: [
              "**Tipo:** funzionale — strettamente necessario a fornire la preferenza di lingua che hai esplicitamente richiesto",
              "**Finalità:** memorizzare la lingua dell'interfaccia",
              "**Durata:** 1 anno (`max-age=31536000`)",
              "**Contenuto:** nessun tuo dato — solo il codice lingua (`it` / `en`)",
              "**Proprietà:** `SameSite=Lax`, `path=/`, non leggibile cross-site (nessuna superficie di tracciamento o sessione)",
              "**Base giuridica:** art. 122 D.Lgs. 196/2003 (recepimento dell'art. 5(3) della Direttiva 2002/58/CE, come modificata dalla 2009/136/CE) — il consenso **non** è richiesto per i cookie strettamente necessari a fornire un servizio esplicitamente richiesto dall'utente; nessun banner di consenso è pertanto mostrato.",
              "**Gestione:** puoi eliminarlo in qualsiasi momento dalle impostazioni del browser; senza di esso l'interfaccia torna alla lingua predefinita (inglese) su questo dispositivo.",
            ],
          },
          {
            type: "paragraph",
            text: "La stessa preferenza è replicata nel `localStorage` del browser per la sincronizzazione tra schede. Il `localStorage` è una tecnologia di archiviazione del browser, non un cookie, e non viene mai trasmesso ai nostri server.",
          },
          {
            type: "note",
            text: "**Impegno:** se il redesign o una futura funzionalità introducesse cookie non strettamente necessari (analytics, pubblicità, profilazione), richiederemo il tuo consenso esplicito tramite banner **prima** di installarli, ai sensi dell'art. 122 D.Lgs. 196/2003.",
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
      "Versione 0.4 — 5 agosto 2026. Aggiornati per il modello community-driven (ADR 0021): il § 5 descrive la pubblicazione immediata e le azioni della community al posto della coda di revisione umana; il § 6 sostituisce i ricorsi con le correzioni private e il potere di emergenza legale. Risincronizzati con la TERMS_OF_USE canonica v0.7 mergiata (docs/TERMS_OF_USE.md resta la versione canonica): ripristinata la disclosure di autenticazione § 3.7 (verifica email per l'accesso in scrittura, passkey, OIDC — ADR 0020).",
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
            text: "**Contatto:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — casella dedicata — per ogni domanda, correzione, rimozione o richiesta relativa alla privacy. Tempi di risposta: prima risposta entro 48 ore, decisione sostanziale entro 14 giorni.",
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
              "**Segnalazioni:** inviare osservazioni su infrastrutture di sorveglianza pubbliche e visibili. Una segnalazione di un account verificato viene **pubblicata subito** e fa parte del dataset pubblico dal momento dell'invio (sezione 5).",
              "**Finalità lecite:** i dati possono essere usati per ricerca, giornalismo, attivismo civico e per qualsiasi finalità compatibile con questi termini e con la licenza ODbL 1.0. La consultazione dei dati pubblici non richiede mai un account. Inviare una segnalazione o una correzione richiede un account contributore verificato (sezione 3.5; ADR 0020) e ogni invio è attribuito a esso tramite un **ID interno pseudonimo** — mai un requisito di nome reale.",
              "**Metodi di autenticazione (multi-metodo, ADR 0020).** Gli account contributore supportano **tre metodi**, a tua scelta: **(a) email + password** — il metodo di base, con **verifica dell'email richiesta per l'accesso in scrittura** (link monouso, 24 ore; finché non verifichi, la tua sessione è in sola lettura); **(b) passkey (WebAuthn)** — facoltative, senza password; **(c) OIDC tramite GitHub o Google** — facoltativo, opt-in. Le regole:",
            ],
          },
          {
            type: "list",
            items: [
              "**Verifica dell'email.** Dopo la registrazione devi verificare l'indirizzo email prima di poter inviare, modificare o verificare record; finché non lo fai, la tua sessione è in sola lettura. Le email di verifica e di reset della password vengono inviate tramite Cloudflare Email Routing senza contenuti di tracciamento. Un indirizzo email = un account; tienilo accessibile se perdi la password.",
              "**Passkey.** Se registri una passkey, il sito memorizza solo materiale di chiave pubblica; la chiave privata resta sul tuo dispositivo. **Nota del fornitore:** le passkey *sincronizzate* sono salvate nel cloud del fornitore del sistema operativo (Apple/Google/Microsoft) a tua scelta — il fornitore viene a sapere che hai un account qui, il sito non condivide nulla con loro e tu controlli la sincronizzazione. Conserva i 10 codici di recupero emessi alla registrazione in un luogo sicuro; senza di essi, un dispositivo smarrito può significare perdere l'accesso al metodo passkey (il percorso email+password resta comunque disponibile).",
              "**OIDC tramite GitHub/Google — disclosure di tracciamento.** Accedendo con GitHub o Google, **GitHub o Google osserva che accedi a questo Servizio, e il tuo indirizzo IP**, a ogni accesso; si applicano i termini e l'informativa privacy del fornitore. **Non importiamo la tua email** dal fornitore (solo subject id + flag di verifica) e non uniamo mai gli account automaticamente in base alla corrispondenza dell'email — un conflitto richiede un'unione manuale e verificata. Questo metodo è **opt-in e dichiarato** (matrice dei rischi nella pagina di accesso); i pulsanti sono mostrati solo quando l'operatore ha attivato il fornitore (credenziali configurate su questa installazione).",
              "Puoi aggiungere, cambiare o rimuovere i metodi in qualsiasi momento dalla pagina del tuo account; eliminando l'account vengono eliminati i dati di ogni metodo (informativa privacy § 7 R15, § 8).",
            ],
          },
        ],
      },
      {
        heading: "4. Cosa non puoi fare",
        blocks: [
          {
            type: "paragraph",
            text: "**Contenuti vietati.** Le esclusioni delle regole di pubblicazione si applicano a tutto ciò che invii, incluse segnalazioni e note. In particolare, non inviare:",
          },
          {
            type: "list",
            items: [
              "telecamere residenziali o private, inclusi videocitofoni e telecamere puntate verso un'abitazione privata;",
              "video in diretta, URL di streaming, credenziali, informazioni di rete o interfacce di controllo;",
              "dettagli sul campo visivo o sulle capacità operative che potrebbero creare un rischio per la sicurezza;",
              "impianti o luoghi sensibili la cui pubblicazione potrebbe aumentare materialmente il rischio;",
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
            text: "**Niente abusi.** Non superare i limiti di frequenza applicabili, non fare scraping del Servizio oltre un ragionevole uso personale, non tentare di accedere a record non pubblici (record ritirati, richieste di correzione) e non aggirare i controlli di accesso né usare il Servizio per molestare o facilitare danni.",
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
              "**Pubblicazione immediata.** Una segnalazione di un contributore verificato viene pubblicata subito: entra nel dataset pubblico appena inviata. Niente coda di revisione, niente attese. È la community a mantenere accurato l'elenco: i record vengono confermati, segnalati come non più presenti, marcati come utili o ritirati attraverso soglie automatiche (ADR 0021). Un record può essere nascosto o rimosso in qualsiasi momento da abbastanza segnalazioni della community, o da una decisione di emergenza legale; i record ritirati restano raggiungibili tramite link diretto con un banner e una cronologia pubblica degli eventi, e possono essere ripristinati da abbastanza conferme.",
              "**Cosa conservi e cosa concedi.** Conservi tutti i diritti che hai sul contenuto che invii. Con l'invio concedi al progetto una licenza non esclusiva, mondiale, esente da royalty per conservare, esaminare e pubblicare la segnalazione come parte del database aperto, reso disponibile con licenza **ODbL 1.0**, con attribuzione ai contributori secondo l'avviso ODbL. La pubblicazione avviene all'invio, non dopo un passaggio di approvazione.",
              "**Le tue dichiarazioni.** Inviando conferisci che: il contenuto è accurato al meglio delle tue conoscenze; hai il diritto di condividerlo; è conforme alla sezione 4; e hai l'età minima per usare il Servizio nella tua giurisdizione (in Italia, 14 anni).",
              "**Accuratezza della community.** I record ripubblicati da fonti pubbliche ufficiali seguono il proprio regime giuridico, verificato caso per caso; i record della community sono mantenuti accurati da conferme e segnalazioni sotto le soglie automatiche, non contro registri ufficiali.",
            ],
          },
        ],
      },
      {
        heading: "6. Azioni della community, correzioni, emergenze legali",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Azioni della community.** Ogni account verificato può marcare un record come utile, confermare che è ancora presente, segnalarlo come non più presente o sollevare un problema o una preoccupazione di privacy. Un account, un'azione attiva per record. Soglie automatiche — inclusa una soglia di privacy deliberatamente bassa — decidono quando un record viene nascosto o rimosso; ogni transizione è registrata nella cronologia pubblica del record senza attribuzione a nessun profilo.",
              "**Correzioni.** Chiunque può richiedere una correzione o una rimozione tramite il modulo privato di correzione (home page, sezione \"Segnala un problema / correzione\") o [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Le richieste sono private, esaminate da una persona e non modificano mai la mappa automaticamente. Obiettivi di risposta: prima risposta entro **48 ore**, risposta sostanziale entro **14 giorni**; i nascondimenti per emergenza legale sono immediati.",
              "**Emergenze legali.** L'unico potere di scrittura umano rimasto è il nascondimento o la rimozione per emergenza legale da parte dell'amministratore, usato quando la legge lo richiede e rivisto a posteriori. Gli amministratori non possono ripristinare o rendere visibile un record unilateralmente: il consenso della community della sezione 5 è l'unico percorso di inversione.",
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
              "OpenSurveillanceDB è un **dataset civico, mantenuto dalla comunità — non un registro ufficiale e non una dichiarazione di fatto giuridico.** Nonostante la manutenzione della community, i record possono essere incompleti, obsoleti o imprecisi; la pubblicazione è immediata, non prudente.",
              "Non fare affidamento sul dataset per decisioni critiche per la sicurezza o ufficiali. Verifica presso fonti ufficiali (ad esempio la pubblica amministrazione competente) prima di agire. Il Servizio fornisce informazioni solo sulle infrastrutture visibili — non è un elenco di tutte le telecamere, e l'assenza di un record non prova nulla.",
              "I record provenienti da fonti ufficiali riportano la fonte e la data di verifica; i record della comunità non offrono tale garanzia.",
              "Le coordinate pubblicate sono arrotondate a **~4 decimali (~10 m)** — precisione di zona. La posizione esatta non viene mai pubblicata e resta nel database.",
            ],
          },
        ],
      },
      {
        heading: "9. Privacy",
        blocks: [
          {
            type: "paragraph",
            text: "Il tuo uso del Servizio è disciplinato dall'[informativa sulla privacy](/privacy). Punti chiave: niente tracciamento, niente pubblicità comportamentale; le segnalazioni sono pubbliche appena pubblicate e le richieste private di correzione restano private; i tuoi diritti GDPR si esercitano tramite [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) nei termini di legge (art. 12(3) GDPR).",
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
              "Possiamo sospendere o limitare l'accesso, o rimuovere contenuti, quando necessario per far rispettare questi termini, per proteggere utenti o interessati, o secondo le regole di pubblicazione — con l'obiettivo di informare la persona interessata dove proporzionato e possibile.",
              "I contributori possono richiedere la cancellazione delle proprie segnalazioni tramite [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org); i record pubblicati restano pubblici finché la community continua a confermarli e seguono i percorsi di correzione e ritiro della sezione 6.",
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
              "**Privacy, correzioni, diritti:** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) (casella dedicata).",
              "Le emergenze legali e le segnalazioni di abuso usano lo stesso canale (nascondimento immediato).",
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
      "Aggiornato il 31 luglio 2026 (decisione sulla licenza dei dati — ADR 0008) e il 5 agosto 2026 (dataset pubblici importati). La copia repository (docs/OPEN_SOURCE.md) resta la versione canonica.",
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
            text: "I contributori devono inviare solo materiale che hanno il diritto di condividere. Concedono al progetto i diritti necessari a pubblicare codice, documentazione e dati accettati con la licenza di progetto pertinente. ",
          },
        ],
      },
      {
        heading: "6. Dataset pubblici importati",
        blocks: [
          {
            type: "paragraph",
            text: "Il progetto può integrare dataset pubblici rilasciati da amministrazioni pubbliche e progetti open data (per esempio inventari comunali delle telecamere o elementi di sorveglianza di OpenStreetMap). Ogni fonte integrata mantiene la propria licenza e la propria attribuzione: la licenza del database sopra indicata si applica alla compilazione del progetto e non sostituisce mai la licenza di una singola fonte. La pagina [Fonti dei dati](/fonti) elenca ogni dataset importato con la fonte, la licenza, la data di importazione, il numero di record e il testo di attribuzione richiesto.",
          },
          {
            type: "note",
            text: "I record importati da una fonte riportano la loro provenienza nella pagina del record. Sono soggetti alla stessa verifica della community di qualsiasi altro record e non sono mai esenti da revisione.",
          },
        ],
      },
    ],
  },

  accessibility: {
    eyebrow: "Informazioni · Accessibilità",
    title: "Dichiarazione di accessibilità",
    intro:
      "OpenSurveillanceDB è un database civico di interesse pubblico. Questa dichiarazione descrive il nostro impegno per l'accessibilità, lo stato attuale di conformità e come segnalare una barriera.",
    versionNote:
      "Versione 0.2 — 8 agosto 2026. In vigore (progetto personale open-source). La copia repository (docs/ACCESSIBILITY_STATEMENT.md) resta la versione canonica.",
    sections: [
      {
        heading: "1. Impegno",
        blocks: [
          {
            type: "paragraph",
            text: "I percorsi principali — sfogliare, cercare, segnalare e correggere/rimuovere — devono essere utilizzabili con la tastiera, con le tecnologie assistive e su schermi piccoli, nella lingua pilota e in inglese. L'obiettivo di prodotto è la conformità **WCAG 2.2 AA** per il sito pubblico, con test manuali da parte di persone con disabilità prima di ampliare il pilot.",
          },
        ],
      },
      {
        heading: "2. Stato di conformità",
        blocks: [
          {
            type: "paragraph",
            text: "**Parzialmente conforme.** Il progetto implementa una base di accessibilità significativa ed esegue **controlli automatici di accessibilità (Lighthouse ≥ 0.95) su ogni pull request**; resta previsto un audit manuale completo di conformità WCAG 2.2 A/AA con utenti di tecnologie assistive. Le limitazioni note sono elencate sotto.",
          },
        ],
      },
      {
        heading: "3. Cosa è già implementato",
        blocks: [
          {
            type: "list",
            items: [
              "Un link salta-contenuto e un target main-content su ogni pagina.",
              "Stati di focus da tastiera visibili e un ordine di focus logico.",
              "Supporto di `prefers-reduced-motion` (animazioni ridotte su richiesta).",
              "Una directory testuale ricercabile e pagine di dettaglio dei record che funzionano **senza interazione con la mappa**; mappa e directory presentano gli stessi campi pubblici.",
              "Selezione della posizione della segnalazione tramite clic sulla mappa **o** coordinate manuali validate.",
              "Un'interfaccia in inglese/italiano con preferenza di lingua locale al dispositivo; la scelta della lingua non influisce sui dati API.",
              "Una guida in-app bilingue su [/guide](/guide) che spiega gli stati dei dati e il flusso di pubblicazione.",
              "Lo stato delle informazioni non è mai comunicato solo con il colore (vengono usati testo ed etichette con icone).",
            ],
          },
        ],
      },
      {
        heading: "4. Limitazioni note",
        blocks: [
          {
            type: "list",
            items: [
              "**Le attività sulla mappa sono operabili da tastiera.** I marker della mappa sono focalizzabili e rispondono a Invio/Spazio (apertura/chiusura popup); l'alternativa a elenco testuale copre la navigazione e la ricerca dei record senza mappa.",
              "**Nessun audit manuale di conformità ancora.** Un audit manuale completo con screen reader, zoom al 200%, verifica del contrasto e dispositivi a schermo piccolo non è stato ancora eseguito; i controlli automatici girano su ogni pull request e l'audit manuale è previsto.",
              "**Alcune stringhe visibili all'utente sono ancora definite inline** nei componenti, mentre è in corso l'esternalizzazione delle stringhe dell'interfaccia e la revisione della lingua pilota.",
              "**La pagina dedicata di feedback (/feedback) non è ancora offerta.** Le barriere si segnalano tramite i canali della sezione 5.",
            ],
          },
        ],
      },
      {
        heading: "5. Segnalare una barriera",
        blocks: [
          {
            type: "paragraph",
            text: "Il progetto prevede **canali di feedback non sensibili all'usabilità**, così che chiunque possa segnalare una barriera dell'interfaccia **senza creare un account e senza fornire dati personali**. I canali chiedono solo:",
          },
          {
            type: "list",
            items: [
              "il tipo di barriera (navigazione/tastiera, screen reader, colore/contrasto, zoom/layout, altro);",
              "una descrizione in parole semplici di cosa è successo;",
              "un URL facoltativo della pagina in cui si è verificata la barriera;",
              "un recapito facoltativo, **solo se** desideri una risposta (mai obbligatorio, mai usato per altro, ed eliminato a conclusione dello scambio).",
            ],
          },
          {
            type: "paragraph",
            text: "Segnala le barriere di accessibilità tramite uno di questi canali:",
          },
          {
            type: "list",
            items: [
              "apri una segnalazione sul repository del progetto (contenuto pubblico e non sensibile — non includere dati personali o luoghi privati);",
              "usa il [modulo di correzione](/) nella pagina pubblica per problemi relativi a un record specifico;",
              "scrivi al contatto privacy indicato nell'[informativa sulla privacy](/privacy): [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org).",
            ],
          },
          {
            type: "paragraph",
            text: "**Impegno di risposta:** il feedback è gestito con gli stessi obiettivi delle richieste di correzione e rimozione — un riscontro entro **48 ore** e una risposta sostanziale entro **14 giorni**, nella lingua del messaggio quando possibile.",
          },
        ],
      },
      {
        heading: "6. Calendario di revisione",
        blocks: [
          {
            type: "paragraph",
            text: "Questa dichiarazione viene rivista dopo ogni rilascio che modifica l'interfaccia o il comportamento di accessibilità; almeno ogni tre mesi una volta che il servizio è operativo; e prima di ogni lancio pubblico, registrando qui i risultati finali di conformità e le eccezioni note.",
          },
        ],
      },
    ],
  },
};
