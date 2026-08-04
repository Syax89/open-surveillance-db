# Data sources (fonti pubbliche)

Documentazione sulle **fonti pubbliche** di dati di videosorveglianza e sulla
loro compatibilità legale con il database del progetto (ODbL 1.0, ADR 0008).

| Documento | Contenuto | Stato |
| --- | --- | --- |
| [censimento-fonti.md](censimento-fonti.md) | Censimento e ranking delle fonti (portali comunali, dati.gov.it, ministeri, EU, OSM, progetti civici) | in lavorazione (FONTI #1) |
| [licenze-compatibilita.md](licenze-compatibilita.md) | Matrice di compatibilità licenze → import ODbL + pattern di attribuzione per la pagina `/licenze` | bozza per review (FONTI #2) |
| [normalizzazione-pipeline.md](normalizzazione-pipeline.md) | Design della normalizzazione e della pipeline di import | in lavorazione (FONTI #3) |

Vincoli operativi:

- Ogni import deve rispettare la **matrice di compatibilità** e le
  raccomandazioni di `licenze-compatibilita.md`; i casi marcati
  «da verificare con legale» richiedono l'ok di Rosa (DPO) prima dell'import.
- I record importati usano `source: "official"` con riferimento alla fonte e
  alla data di verifica (TERMS_OF_USE § 8.3; LAWFUL_BASIS § 3.2).
- L'attribuzione aggregata delle fonti importate vive nella pagina `/licenze`
  (sezione «Fonti dei dati importati») ed è mantenuta allineata con
  `app/lib/data-license.ts` e con gli header delle esportazioni.
