/**
 * map — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  mapLabel: "Interactive OpenStreetMap map",
  mapDescription:
    "The map shows the same public records as the accessible directory below. You can use the directory to search, filter, and open records without using the map.",
  mapDirectoryLink: "Go to the accessible directory",
  mapFallbackTitle: "The interactive map is unavailable.",
  mapFallbackBody:
    "You can still search, filter, and open every public record from the accessible directory below, which works without the map.",
  offlineTitle: "You are offline",
  offlineBody: "Showing the last loaded records.",
  offlineAction: "Try again",
} as const;

export const it: Translation<typeof en> = {
  mapLabel: "Mappa interattiva OpenStreetMap",
  mapDescription:
    "La mappa mostra gli stessi record pubblici dell'elenco accessibile sottostante. Puoi usare l'elenco per cercare, filtrare e aprire i record senza usare la mappa.",
  mapDirectoryLink: "Vai all'elenco accessibile",
  mapFallbackTitle: "La mappa interattiva non è disponibile.",
  mapFallbackBody:
    "Puoi comunque cercare, filtrare e aprire ogni record pubblico dall'elenco accessibile sottostante, che funziona senza la mappa.",
  offlineTitle: "Sei offline",
  offlineBody: "Mostriamo gli ultimi record caricati.",
  offlineAction: "Riprova",
};
