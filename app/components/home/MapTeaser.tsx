import Link from "next/link";

/**
 * MapTeaser — static map preview for the home hub (F2, t_52dcb95e).
 *
 * The hub must stay SSR-pure (review criterion: no JS, no client data
 * dependency, zero Leaflet instances on the home). This is a purely
 * decorative preview: a CSS grid that echoes the map tiles plus a few
 * static markers — no leaflet import, no map instance, no JS. The CTA is
 * a plain link to the real interactive map on /mappa.
 *
 * Server Component (no "use client"): receives its strings as props from
 * the home page, which reads them from the server bundle (getServerMessages).
 */
export type MapTeaserProps = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
};

export function MapTeaser({ eyebrow, title, body, cta }: MapTeaserProps) {
  return (
    <section className="map-teaser" aria-labelledby="map-teaser-title">
      <div className="map-teaser-copy">
        <p className="eyebrow"><span /> {eyebrow}</p>
        <h2 id="map-teaser-title">{title}</h2>
        <p>{body}</p>
        <Link className="button button-primary" href="/mappa">{cta} <span aria-hidden="true">→</span></Link>
      </div>
      <div className="map-teaser-visual" aria-hidden="true">
        <div className="teaser-grid" />
        <span className="teaser-pin teaser-pin-one" />
        <span className="teaser-pin teaser-pin-two" />
        <span className="teaser-pin teaser-pin-three" />
        <span className="teaser-pin teaser-pin-four" />
        <span className="teaser-pin teaser-pin-five" />
      </div>
    </section>
  );
}
