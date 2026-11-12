/**
 * DE bundle — single-locale assembly (F5 qa#5, t_ab0d4c75).
 *
 * Parity twin of bundles/en.ts: `it` is type-checked against `en` via
 * `Translation<typeof en>` (see ./types.ts), so a missing or extra key
 * fails `tsc --noEmit`.
 */
import type { Translation } from "../types";
import { de as commonDe } from "../locales/de/common";
import { de as mapDe } from "../locales/de/map";
import { de as directoryDe } from "../locales/de/directory";
import { de as reportDe } from "../locales/de/report";
import { de as correctionDe } from "../locales/de/correction";
import { de as statusDe } from "../locales/de/status";
import { de as homeDe } from "../locales/de/home";
import { de as guideDe } from "../locales/de/guide";
import { de as manifestoDe } from "../locales/de/manifesto";
import { de as moderazioneDe } from "../locales/de/moderazione";
import { de as faqDe } from "../locales/de/faq";
import { de as contactDe } from "../locales/de/contact";
import { de as rulesDe } from "../locales/de/rules";
import { de as recordDe } from "../locales/de/record";
import { de as sourcesDe } from "../locales/de/sources";
import { de as apiDe } from "../locales/de/api";
import { de as moderationDe } from "../locales/de/moderation";
import { de as authDe } from "../locales/de/auth";
import { de as communityDe } from "../locales/de/community";
import { de as errorsDe } from "../locales/de/errors";
import { de as footerDe } from "../locales/de/footer";
import { de as contribuisciDe } from "../locales/de/contribuisci";

export const de: Translation<typeof import("./en").en> = {
  common: commonDe,
  map: mapDe,
  directory: directoryDe,
  report: reportDe,
  correction: correctionDe,
  status: statusDe,
  home: homeDe,
  guide: guideDe,
  manifesto: manifestoDe,
  moderazione: moderazioneDe,
  faq: faqDe,
  contact: contactDe,
  rules: rulesDe,
  record: recordDe,
  sources: sourcesDe,
  api: apiDe,
  moderation: moderationDe,
  auth: authDe,
  community: communityDe,
  errors: errorsDe,
  footer: footerDe,
  contribuisci: contribuisciDe,
};
