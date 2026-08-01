import Link from "next/link";

/**
 * ToolCards — the four public tools of the home hub (F2, t_52dcb95e).
 *
 * Grid 2×2 on desktop, 1 column on mobile (docs/FRONTEND_DESIGN.md §2.4):
 * Map, Directory, Report, Correction — each card is a plain link with a
 * sober icon, a title and one description line. Server Component (no
 * "use client"): strings arrive as props from the home page (server bundle).
 */
export type ToolCard = {
  href: string;
  icon: string;
  title: string;
  body: string;
};

export type ToolCardsProps = {
  heading: string;
  cards: ToolCard[];
};

export function ToolCards({ heading, cards }: ToolCardsProps) {
  return (
    <section className="tool-cards" aria-labelledby="tool-cards-title">
      <div className="tool-cards-heading">
        <p className="eyebrow"><span /> {heading}</p>
        <h2 id="tool-cards-title" className="sr-only">{heading}</h2>
      </div>
      <div className="tool-cards-grid">
        {cards.map((card) => (
          <Link key={card.href} className="tool-card" href={card.href}>
            <span className="tool-card-icon" aria-hidden="true">{card.icon}</span>
            <span className="tool-card-title">{card.title}</span>
            <span className="tool-card-body">{card.body}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
