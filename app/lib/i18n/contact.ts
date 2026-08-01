/**
 * contact — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Contacts navigation",
  homeAria: "OpenSurveillanceDB home",
  map: "Map",
  directory: "Directory",
  home: "Home",
  faqLabel: "FAQ",
  contactLabel: "Contacts",
  eyebrow: "Contacts and accountability",
  title: "Who runs this, and how to reach us.",
  intro:
    "OpenSurveillanceDB is an open, non-commercial civic database of visible public surveillance infrastructure. It documents public-facing equipment; it never provides feeds, tracking tools or advice on avoiding lawful surveillance.",
  whoTitle: "Who we are",
  whoBody:
    "A small pilot team of named volunteers maintains the project. These are initial nominations for the pilot, not a claim that a full public governance structure already exists.",
  rolesTitle: "Roles and owners",
  rolesIntro: "Initial roles were named on 2026-07-31 (Wave A pilot boundary, GOVERNANCE.md):",
  roleMaintainers: "Maintainers",
  roleMaintainersBody: "Simone (syax89) and Ada (CTO). Ada is the sole merge authority.",
  roleOps: "Operations owner",
  roleOpsBody: "Ken — hosting, deployments, backups.",
  roleData: "Data stewards",
  roleDataBody: "Linus and Grace — data model, quality and retention.",
  roleSecurity: "Security contact",
  roleSecurityBody: "Ken — private reporting route in SECURITY.md.",
  roleModeration: "Moderation contact",
  roleModerationBody: "Grace.",
  controllerTitle: "Data controller",
  controllerBody:
    "Simone Rondina (syax89) / OpenSurveillanceDB — Italy (decision of 2026-07-31; final legal-entity wording to be confirmed at launch).",
  correctionTitle: "Corrections and removal",
  correctionBody:
    "Use the private correction form on the home page, or write to the privacy contact. Requests are private, reviewed by a human, and never published. Response targets: first response within 48 hours, substantive response within 14 days, emergency content hide within 24 hours (MODERATION_SLA).",
  correctionForm: "Open the correction form",
  correctionEmail: "privacy@opensurveillancedb",
  correctionEmailNote:
    "Dedicated mailbox — to be created before launch; final domain to be confirmed.",
  securityTitle: "Reporting a security vulnerability",
  securityBody:
    "Use the GitHub Private Vulnerability Reporting flow, which creates a confidential advisory only the maintainers can see. Do not open a public issue for a vulnerability.",
  securityAdvisory: "Open the private advisory form",
  securityPgpTitle: "Encrypting sensitive payloads",
  securityPgpBody:
    "For payloads that contain personal data or operational details, encrypt them with the project PGP key (fingerprint 04E8 A3EE 7C72 188B D3AF 925D 496C F0BD 4920 D3F7) and include the ciphertext in the advisory. Response commitment: first response within 48 hours, substantive response within 14 days, emergency hide within 24 hours.",
  securityRouteNote:
    "Security reports and privacy requests travel on separate channels: private advisories for vulnerabilities, the correction form and privacy contact for data-subject requests.",
  footer: "Built for transparency, not tracking.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione contatti",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  map: "Mappa",
  directory: "Elenco",
  home: "Home",
  faqLabel: "FAQ",
  contactLabel: "Contatti",
  eyebrow: "Contatti e responsabilità",
  title: "Chi gestisce il progetto e come contattarci.",
  intro:
    "OpenSurveillanceDB è un database civico aperto e non commerciale delle infrastrutture di sorveglianza pubblica visibili. Documenta apparecchiature rivolte allo spazio pubblico; non fornisce feed, strumenti di tracciamento né consigli per eludere la sorveglianza legittima.",
  whoTitle: "Chi siamo",
  whoBody:
    "Un piccolo team pilota di volontari nominati mantiene il progetto. Sono nomine iniziali per il pilota, non la rivendicazione di una struttura di governance pubblica già completa.",
  rolesTitle: "Ruoli e responsabili",
  rolesIntro: "I ruoli iniziali sono stati nominati il 2026-07-31 (confine pilota Wave A, GOVERNANCE.md):",
  roleMaintainers: "Manutentori",
  roleMaintainersBody: "Simone (syax89) e Ada (CTO). Ada è l'unica autorità di merge.",
  roleOps: "Responsabile operativo",
  roleOpsBody: "Ken — hosting, deployment, backup.",
  roleData: "Data steward",
  roleDataBody: "Linus e Grace — modello dati, qualità e conservazione.",
  roleSecurity: "Contatto sicurezza",
  roleSecurityBody: "Ken — canale di segnalazione privato in SECURITY.md.",
  roleModeration: "Contatto moderazione",
  roleModerationBody: "Grace.",
  controllerTitle: "Titolare del trattamento",
  controllerBody:
    "Simone Rondina (syax89) / OpenSurveillanceDB — Italia (decisione del 2026-07-31; formulazione definitiva dell'entità giuridica da confermare al lancio).",
  correctionTitle: "Correzioni e rimozioni",
  correctionBody:
    "Usa il modulo privato di correzione nella home page oppure scrivi al contatto privacy. Le richieste sono private, esaminate da una persona e mai pubblicate. Obiettivi di risposta: prima risposta entro 48 ore, risposta sostanziale entro 14 giorni, rimozione d'emergenza dei contenuti entro 24 ore (MODERATION_SLA).",
  correctionForm: "Apri il modulo di correzione",
  correctionEmail: "privacy@opensurveillancedb",
  correctionEmailNote:
    "Casella dedicata — da creare prima del lancio; dominio finale da confermare.",
  securityTitle: "Segnalare una vulnerabilità di sicurezza",
  securityBody:
    "Usa il flusso GitHub Private Vulnerability Reporting, che crea un advisory confidenziale visibile solo ai manutentori. Non aprire un issue pubblico per una vulnerabilità.",
  securityAdvisory: "Apri il modulo per l'advisory privato",
  securityPgpTitle: "Crittografia dei dati sensibili",
  securityPgpBody:
    "Per payload che contengono dati personali o dettagli operativi, crittografali con la chiave PGP del progetto (impronta 04E8 A3EE 7C72 188B D3AF 925D 496C F0BD 4920 D3F7) e includi il testo cifrato nell'advisory. Impegno di risposta: prima risposta entro 48 ore, risposta sostanziale entro 14 giorni, rimozione d'emergenza entro 24 ore.",
  securityRouteNote:
    "Le segnalazioni di sicurezza e le richieste relative alla privacy viaggiano su canali separati: advisory privati per le vulnerabilità, modulo di correzione e contatto privacy per le richieste dell'interessato.",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
