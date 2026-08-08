/**
 * contribuisci — support / contribute page (/contribuisci).
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 *
 * The page is a static InfoPage with two external CTA cards (Buy Me a
 * Coffee + GitHub). Copy is sober civic-tech: no reward promises, no
 * tracking, no forms — just the two ways to support the project.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Support navigation",
  homeAria: "OpenSurveillanceDB home",
  eyebrow: "Support the project",
  title: "Keep the database open.",
  intro:
    "OpenSurveillanceDB is a civic, non-commercial project: the code is open source, the data is free to reuse, and every record has a source and a status. If the project is useful to you, there are two simple ways to support it.",
  waysEyebrow: "How to support",
  waysTitle: "Two ways to help",
  waysIntro:
    "A donation helps cover the costs of keeping the database online; a code contribution makes the project better for everyone.",
  coffeeTitle: "Buy Me a Coffee",
  coffeeBody:
    "A one-off donation — the amount is up to you, no subscription required. A simple way to say that the project is useful.",
  coffeeCta: "Buy a coffee",
  githubTitle: "GitHub",
  githubBody:
    "The whole project is open source: report an issue, suggest a feature or open a pull request. Every contribution is welcome.",
  githubCta: "View the repository",
  footnote:
    "OpenSurveillanceDB never sells data and shows no advertising. Any support — a coffee or a commit — helps keep it open and accurate.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione supporto",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  eyebrow: "Sostieni il progetto",
  title: "Mantieni aperto il database.",
  intro:
    "OpenSurveillanceDB è un progetto civico e non commerciale: il codice è open source, i dati sono liberi da riusare e ogni record ha una fonte e uno stato. Se il progetto ti è utile, ci sono due modi semplici per sostenerlo.",
  waysEyebrow: "Come sostenere",
  waysTitle: "Due modi per aiutare",
  waysIntro:
    "Una donazione aiuta a coprire i costi per tenere online il database; un contributo al codice migliora il progetto per tutti.",
  coffeeTitle: "Buy Me a Coffee",
  coffeeBody:
    "Una donazione una tantum: l'importo lo scegli tu, senza abbonamenti. Un modo semplice per dire che il progetto ti è utile.",
  coffeeCta: "Offri un caffè",
  githubTitle: "GitHub",
  githubBody:
    "L'intero progetto è open source: segnala un problema, proponi una funzione o apri una pull request. Ogni contributo è benvenuto.",
  githubCta: "Vai al repository",
  footnote:
    "OpenSurveillanceDB non vende dati e non mostra pubblicità. Qualsiasi supporto — un caffè o un commit — aiuta a mantenerlo aperto e accurato.",
};
