/**
 * PT bundle — single-locale assembly (F5 qa#5, t_ab0d4c75).
 *
 * Parity twin of bundles/en.ts: `it` is type-checked against `en` via
 * `Translation<typeof en>` (see ./types.ts), so a missing or extra key
 * fails `tsc --noEmit`.
 */
import type { Translation } from "../types";
import { pt as commonPt } from "../locales/pt/common";
import { pt as mapPt } from "../locales/pt/map";
import { pt as directoryPt } from "../locales/pt/directory";
import { pt as reportPt } from "../locales/pt/report";
import { pt as correctionPt } from "../locales/pt/correction";
import { pt as statusPt } from "../locales/pt/status";
import { pt as homePt } from "../locales/pt/home";
import { pt as guidePt } from "../locales/pt/guide";
import { pt as manifestoPt } from "../locales/pt/manifesto";
import { pt as moderazionePt } from "../locales/pt/moderazione";
import { pt as faqPt } from "../locales/pt/faq";
import { pt as contactPt } from "../locales/pt/contact";
import { pt as rulesPt } from "../locales/pt/rules";
import { pt as recordPt } from "../locales/pt/record";
import { pt as sourcesPt } from "../locales/pt/sources";
import { pt as apiPt } from "../locales/pt/api";
import { pt as moderationPt } from "../locales/pt/moderation";
import { pt as authPt } from "../locales/pt/auth";
import { pt as communityPt } from "../locales/pt/community";
import { pt as errorsPt } from "../locales/pt/errors";
import { pt as footerPt } from "../locales/pt/footer";
import { pt as contribuisciPt } from "../locales/pt/contribuisci";

export const pt: Translation<typeof import("./en").en> = {
  common: commonPt,
  map: mapPt,
  directory: directoryPt,
  report: reportPt,
  correction: correctionPt,
  status: statusPt,
  home: homePt,
  guide: guidePt,
  manifesto: manifestoPt,
  moderazione: moderazionePt,
  faq: faqPt,
  contact: contactPt,
  rules: rulesPt,
  record: recordPt,
  sources: sourcesPt,
  api: apiPt,
  moderation: moderationPt,
  auth: authPt,
  community: communityPt,
  errors: errorsPt,
  footer: footerPt,
  contribuisci: contribuisciPt,
};
