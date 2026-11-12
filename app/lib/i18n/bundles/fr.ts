/**
 * FR bundle — single-locale assembly (F5 qa#5, t_ab0d4c75).
 *
 * Parity twin of bundles/en.ts: `it` is type-checked against `en` via
 * `Translation<typeof en>` (see ./types.ts), so a missing or extra key
 * fails `tsc --noEmit`.
 */
import type { Translation } from "../types";
import { fr as commonFr } from "../locales/fr/common";
import { fr as mapFr } from "../locales/fr/map";
import { fr as directoryFr } from "../locales/fr/directory";
import { fr as reportFr } from "../locales/fr/report";
import { fr as correctionFr } from "../locales/fr/correction";
import { fr as statusFr } from "../locales/fr/status";
import { fr as homeFr } from "../locales/fr/home";
import { fr as guideFr } from "../locales/fr/guide";
import { fr as manifestoFr } from "../locales/fr/manifesto";
import { fr as moderazioneFr } from "../locales/fr/moderazione";
import { fr as faqFr } from "../locales/fr/faq";
import { fr as contactFr } from "../locales/fr/contact";
import { fr as rulesFr } from "../locales/fr/rules";
import { fr as recordFr } from "../locales/fr/record";
import { fr as sourcesFr } from "../locales/fr/sources";
import { fr as apiFr } from "../locales/fr/api";
import { fr as moderationFr } from "../locales/fr/moderation";
import { fr as authFr } from "../locales/fr/auth";
import { fr as communityFr } from "../locales/fr/community";
import { fr as errorsFr } from "../locales/fr/errors";
import { fr as footerFr } from "../locales/fr/footer";
import { fr as contribuisciFr } from "../locales/fr/contribuisci";

export const fr: Translation<typeof import("./en").en> = {
  common: commonFr,
  map: mapFr,
  directory: directoryFr,
  report: reportFr,
  correction: correctionFr,
  status: statusFr,
  home: homeFr,
  guide: guideFr,
  manifesto: manifestoFr,
  moderazione: moderazioneFr,
  faq: faqFr,
  contact: contactFr,
  rules: rulesFr,
  record: recordFr,
  sources: sourcesFr,
  api: apiFr,
  moderation: moderationFr,
  auth: authFr,
  community: communityFr,
  errors: errorsFr,
  footer: footerFr,
  contribuisci: contribuisciFr,
};
