/**
 * ES bundle — single-locale assembly (F5 qa#5, t_ab0d4c75).
 *
 * Parity twin of bundles/en.ts: `it` is type-checked against `en` via
 * `Translation<typeof en>` (see ./types.ts), so a missing or extra key
 * fails `tsc --noEmit`.
 */
import type { Translation } from "../types";
import { es as commonEs } from "../locales/es/common";
import { es as mapEs } from "../locales/es/map";
import { es as directoryEs } from "../locales/es/directory";
import { es as reportEs } from "../locales/es/report";
import { es as correctionEs } from "../locales/es/correction";
import { es as statusEs } from "../locales/es/status";
import { es as homeEs } from "../locales/es/home";
import { es as guideEs } from "../locales/es/guide";
import { es as manifestoEs } from "../locales/es/manifesto";
import { es as moderazioneEs } from "../locales/es/moderazione";
import { es as faqEs } from "../locales/es/faq";
import { es as contactEs } from "../locales/es/contact";
import { es as rulesEs } from "../locales/es/rules";
import { es as recordEs } from "../locales/es/record";
import { es as sourcesEs } from "../locales/es/sources";
import { es as apiEs } from "../locales/es/api";
import { es as moderationEs } from "../locales/es/moderation";
import { es as authEs } from "../locales/es/auth";
import { es as communityEs } from "../locales/es/community";
import { es as errorsEs } from "../locales/es/errors";
import { es as footerEs } from "../locales/es/footer";
import { es as contribuisciEs } from "../locales/es/contribuisci";

export const es: Translation<typeof import("./en").en> = {
  common: commonEs,
  map: mapEs,
  directory: directoryEs,
  report: reportEs,
  correction: correctionEs,
  status: statusEs,
  home: homeEs,
  guide: guideEs,
  manifesto: manifestoEs,
  moderazione: moderazioneEs,
  faq: faqEs,
  contact: contactEs,
  rules: rulesEs,
  record: recordEs,
  sources: sourcesEs,
  api: apiEs,
  moderation: moderationEs,
  auth: authEs,
  community: communityEs,
  errors: errorsEs,
  footer: footerEs,
  contribuisci: contribuisciEs,
};
