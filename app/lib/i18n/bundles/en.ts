/**
 * English bundle — single-locale assembly (F5 qa#5, t_ab0d4c75).
 *
 * `messages` (index.ts) is built from this per-locale assembly so the
 * dictionary can be split by Vite: client chunks that only ever need ONE
 * locale (e.g. the root graph) import the domain files directly and never
 * pull the other language. The full two-locale `messages` map stays the
 * public API for server-side translation (server-i18n.ts, API routes) and
 * for client components that switch locale at runtime.
 */
import { en as commonEn } from "../common";
import { en as mapEn } from "../map";
import { en as directoryEn } from "../directory";
import { en as reportEn } from "../report";
import { en as correctionEn } from "../correction";
import { en as statusEn } from "../status";
import { en as homeEn } from "../home";
import { en as guideEn } from "../guide";
import { en as manifestoEn } from "../manifesto";
import { en as moderazioneEn } from "../moderazione";
import { en as faqEn } from "../faq";
import { en as contactEn } from "../contact";
import { en as rulesEn } from "../rules";
import { en as recordEn } from "../record";
import { en as moderationEn } from "../moderation";
import { en as authEn } from "../auth";
import { en as communityEn } from "../community";
import { en as errorsEn } from "../errors";
import { en as footerEn } from "../footer";

export const en = {
  common: commonEn,
  map: mapEn,
  directory: directoryEn,
  report: reportEn,
  correction: correctionEn,
  status: statusEn,
  home: homeEn,
  guide: guideEn,
  manifesto: manifestoEn,
  moderazione: moderazioneEn,
  faq: faqEn,
  contact: contactEn,
  rules: rulesEn,
  record: recordEn,
  moderation: moderationEn,
  auth: authEn,
  community: communityEn,
  errors: errorsEn,
  footer: footerEn,
} as const;
