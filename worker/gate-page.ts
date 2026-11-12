/** Gate-denial HTML shell for /moderation (split from worker/index.ts). */
import { en as gateCommonEn, commonByLocale } from "../app/lib/i18n/common";
import { en as gateErrorsEn, errorsByLocale } from "../app/lib/i18n/errors";
import { SUPPORTED_LOCALES, localeFromCookieHeader, resolveLocale, type Locale, type Translation } from "../app/lib/i18n/types";

// Gate-denial HTML shell for a human visiting /moderation directly in a
// browser (CEO decision 2026-10-05: style the one canonical page path,
// never /api/* — API consumers keep the existing plain JSON contract
// unchanged, same status/Cache-Control as before). Deliberately NOT
// rendered through the real React tree: the edge gate above must deny
// before any app/router code runs (ADR 0003/0014, the P1 audit this
// gate exists for), so this is plain markup, reusing the exact classes
// RootLayout/SiteHeader/SiteFooter/ErrorPage already render elsewhere —
// no new visual design. Static (no client JS): the locale toggle below
// is two real links to the existing /api/locale deep-link route, not the
// buttons SiteHeader renders for the hydrated app.
//
// Never echoes the requested path or any gate detail (same privacy
// stance as ErrorPage.tsx) — only the generic copy and the live status.
const GATE_PAGE_COPY = Object.fromEntries(
  SUPPORTED_LOCALES.map(({ code }) => [code, { ...errorsByLocale[code], ...commonByLocale[code] }]),
) as Record<Locale, Translation<typeof gateErrorsEn> & Translation<typeof gateCommonEn>>;

const BRAND_MARK_SVG =
  '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="5.5" fill="currentColor"></circle><circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="55 20" transform="rotate(-20 24 24)"></circle><circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="90 30" transform="rotate(35 24 24)"></circle></svg>';

// Verbatim SiteFooter output (captured from a live render, one per
// locale — ponytail: hand-copied markup, keep in sync with
// app/components/SiteFooter.tsx if its links ever change; a drift here
// is cosmetic, not a security issue, since the gate decision above never
// depends on this template). Locales without a captured footer use the
// English one (moderator-only page).
const GATE_PAGE_FOOTER: Partial<Record<Locale, string>> & { en: string } = {
  en: `<footer class="site-footer" aria-label="Site footer"><div class="footer-brand"><a href="/" class="brand" aria-label="OpenSurveillanceDB home"><span class="brand-mark" aria-hidden="true">${BRAND_MARK_SVG}</span><span>OpenSurveillanceDB</span></a><p>An open database of public surveillance cameras, built for transparency, not tracking.</p></div><nav class="footer-links" aria-label="Site navigation"><div class="footer-link-group"><p class="footer-link-group-title">Explore</p><a href="/mappa">Map</a><a href="/directory">Directory</a></div><div class="footer-link-group"><p class="footer-link-group-title">Contribute</p><a href="/segnala">Report</a><a href="/correggi">Correct</a><a href="/regole">Rules</a><a href="/moderazione">Moderation</a></div><div class="footer-link-group"><p class="footer-link-group-title">The project</p><a href="/guide">Guide</a><a href="/manifesto">Manifesto</a><a href="/fonti">Method &amp; sources</a><a href="/api-docs">Public API</a><a href="/faq">FAQ</a><a href="/contatti">Contact</a></div><details class="footer-link-group footer-policy-group"><summary>Legal information</summary><div class="footer-policy-links"><a href="/privacy">Privacy</a><a href="/termini">Terms of use</a><a href="/licenze">Licenses</a><a href="/accessibility">Accessibility statement</a></div></details></nav><p class="footer-legal"><a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="license">Database and exports licensed under ODbL 1.0</a><span aria-hidden="true"> · </span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Map data © OpenStreetMap contributors</a></p></footer>`,
  it: `<footer class="site-footer" aria-label="Piè di pagina del sito"><div class="footer-brand"><a href="/" class="brand" aria-label="Pagina iniziale di OpenSurveillanceDB"><span class="brand-mark" aria-hidden="true">${BRAND_MARK_SVG}</span><span>OpenSurveillanceDB</span></a><p>Un database aperto delle telecamere di sorveglianza pubblica, creato per la trasparenza, non per il tracciamento.</p></div><nav class="footer-links" aria-label="Navigazione del sito"><div class="footer-link-group"><p class="footer-link-group-title">Esplora</p><a href="/mappa">Mappa</a><a href="/directory">Elenco</a></div><div class="footer-link-group"><p class="footer-link-group-title">Contribuisci</p><a href="/segnala">Segnala</a><a href="/correggi">Correggi</a><a href="/regole">Regole</a><a href="/moderazione">Moderazione</a></div><div class="footer-link-group"><p class="footer-link-group-title">Il progetto</p><a href="/guide">Guida</a><a href="/manifesto">Manifesto</a><a href="/fonti">Metodo e fonti</a><a href="/api-docs">API pubblica</a><a href="/faq">FAQ</a><a href="/contatti">Contatti</a></div><details class="footer-link-group footer-policy-group"><summary>Informazioni legali</summary><div class="footer-policy-links"><a href="/privacy">Privacy</a><a href="/termini">Termini d'uso</a><a href="/licenze">Licenze</a><a href="/accessibility">Dichiarazione di accessibilità</a></div></details></nav><p class="footer-legal"><a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="license">Database ed esportazioni concessi in licenza ODbL 1.0</a><span aria-hidden="true"> · </span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Dati cartografici © OpenStreetMap contributors</a></p></footer>`,
};

export function wantsHtml(request: Request): boolean {
  return (request.headers.get("Accept") ?? "").includes("text/html");
}

// Same resolution LocaleProvider/api/locale use: the persisted preference
// cookie, whitelisted against the real locale registry (never trust the
// raw cookie value as-is).
export function localeFromRequest(request: Request): Locale {
  return localeFromCookieHeader(request.headers.get("Cookie")) ?? resolveLocale(null);
}

export function renderGateUnavailablePage(locale: Locale, status: number): string {
  const t = GATE_PAGE_COPY[locale];
  // A 404 denial must look exactly like any missing page (the moderation
  // area is not advertised to visitors who are not moderators).
  const notFound = status === 404;
  const metaTitle = notFound ? t.notFoundMetaTitle : t.serviceUnavailableMetaTitle;
  const title = notFound ? t.notFoundTitle : t.serviceUnavailableTitle;
  const summary = notFound ? t.notFoundSummary : t.serviceUnavailableSummary;
  const nextParam = encodeURIComponent("/moderation");
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/app/globals.css"/><link rel="icon" href="/favicon.svg"/><meta name="robots" content="noindex"/><title>${metaTitle}</title></head><body class="antialiased"><a class="skip-link" href="#main-content">${t.skipLink}</a><main id="main-content" class="record-page"><nav class="nav-shell" aria-label="${t.navigation}"><a href="/" class="brand" aria-label="${t.homeAria}"><span class="brand-mark" aria-hidden="true">${BRAND_MARK_SVG}</span><span>OpenSurveillanceDB</span></a><div class="nav-links"><a href="/" class="nav-action">${t.backHome}</a></div><div class="locale-toggle" aria-label="${t.languageSelection}">${SUPPORTED_LOCALES.map(({ code, label }) => `<a href="/api/locale?lang=${code}&next=${nextParam}" class="${locale === code ? "is-active" : ""}" aria-pressed="${locale === code}">${label}</a>`).join("")}</div></nav><article class="record-detail"><p class="eyebrow"><span></span> ${status}</p><h1>${title}</h1><p class="record-detail-summary">${summary}</p><div class="record-detail-actions"><a href="/" class="button button-primary">${t.backHome} <span aria-hidden="true">←</span></a></div></article></main>${GATE_PAGE_FOOTER[locale] ?? GATE_PAGE_FOOTER.en}</body></html>`;
}
