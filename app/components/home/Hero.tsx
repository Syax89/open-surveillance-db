"use client";

import { useMessages } from "../LocaleProvider";
import { usePublicCount } from "../../lib/use-public-count";

/**
 * Home hero (F2 home hub, t_52dcb95e): headline, two CTAs and the
 * prototype stats.
 *
 * SSR-pure contract (criterion Grace): the hub must work without JS and
 * without a client data dependency. The record count is a progressive
 * enhancement — the server renders a neutral placeholder and the
 * usePublicCount island (single fetch → server total) replaces it when JS
 * is available. Nothing is invented server-side; the placeholder is the
 * honest no-JS state (the count is the only number that needs the API).
 *
 * The CTA row is simplified vs the pre-F2 hero: "Explore the map" → /mappa
 * and "Report a camera" → /segnala (the tools moved to their own routes).
 */
export function Hero() {
  const t = useMessages().home;
  const { total } = usePublicCount();
  return (
    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><span /> {t.openDatabase}</p><h1>{t.heroTitle}</h1><p className="hero-intro">{t.heroIntro}</p><div className="hero-actions"><a className="button button-primary" href="/mappa">{t.exploreTheMap} <span aria-hidden="true">↘</span></a><a className="button button-quiet" href="/segnala">{t.reportCta} <span aria-hidden="true">→</span></a></div><dl className="hero-stats" aria-label={t.prototypeStats}><div><dt><span role="status">{total ?? "—"}</span></dt><dd>{t.publicRecords}</dd></div><div><dt>0</dt><dd>{t.accountsRequired}</dd></div><div><dt>100%</dt><dd>{t.openPrototype}</dd></div></dl></div><div className="hero-visual" aria-hidden="true"><div className="hero-grid" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="signal signal-one"><i /><b /></div><div className="signal signal-two"><i /><b /></div><div className="signal signal-three"><i /><b /></div><div className="visual-label">{t.visualLabelFirst}<br />{t.visualLabelSecond}</div></div></section>

  );
}
