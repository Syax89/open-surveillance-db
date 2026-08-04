/**
 * Italian bundle — single-locale assembly (F5 qa#5, t_ab0d4c75).
 *
 * Parity twin of bundles/en.ts: `it` is type-checked against `en` via
 * `Translation<typeof en>` (see ./types.ts), so a missing or extra key
 * fails `tsc --noEmit`.
 */
import type { Translation } from "../types";
import { it as commonIt } from "../common";
import { it as mapIt } from "../map";
import { it as directoryIt } from "../directory";
import { it as reportIt } from "../report";
import { it as correctionIt } from "../correction";
import { it as statusIt } from "../status";
import { it as homeIt } from "../home";
import { it as guideIt } from "../guide";
import { it as manifestoIt } from "../manifesto";
import { it as moderazioneIt } from "../moderazione";
import { it as faqIt } from "../faq";
import { it as contactIt } from "../contact";
import { it as rulesIt } from "../rules";
import { it as recordIt } from "../record";
import { it as moderationIt } from "../moderation";
import { it as authIt } from "../auth";
import { it as communityIt } from "../community";
import { it as errorsIt } from "../errors";
import { it as footerIt } from "../footer";

export const it: Translation<typeof import("./en").en> = {
  common: commonIt,
  map: mapIt,
  directory: directoryIt,
  report: reportIt,
  correction: correctionIt,
  status: statusIt,
  home: homeIt,
  guide: guideIt,
  manifesto: manifestoIt,
  moderazione: moderazioneIt,
  faq: faqIt,
  contact: contactIt,
  rules: rulesIt,
  record: recordIt,
  moderation: moderationIt,
  auth: authIt,
  community: communityIt,
  errors: errorsIt,
  footer: footerIt,
};
