"use client";

import { useMessages } from "../LocaleProvider";

type Props = {
  /** Number of public records shown in the hero prototype stats. */
  recordsCount: number;
};

/**
 * Home hero: headline, calls to action and prototype stats.
 * Presentational — receives only the record count it displays.
 */
export function Hero({ recordsCount }: Props) {
  const t = useMessages().home;
  return (
    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><span /> {t.openDatabase}</p><h1>{t.heroTitle}</h1><p className="hero-intro">{t.heroIntro}</p><div className="hero-actions"><a className="button button-primary" href="#map">{t.exploreTheMap} <span aria-hidden="true">↘</span></a><a className="button button-quiet" href="#how-it-works">{t.ourPrinciples}</a></div><dl className="hero-stats" aria-label={t.prototypeStats}><div><dt>{recordsCount}</dt><dd>{t.publicRecords}</dd></div><div><dt>0</dt><dd>{t.accountsRequired}</dd></div><div><dt>100%</dt><dd>{t.openPrototype}</dd></div></dl></div><div className="hero-visual" aria-hidden="true"><div className="hero-grid" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="signal signal-one"><i /><b /></div><div className="signal signal-two"><i /><b /></div><div className="signal signal-three"><i /><b /></div><div className="visual-label">{t.visualLabelFirst}<br />{t.visualLabelSecond}</div></div></section>

  );
}
