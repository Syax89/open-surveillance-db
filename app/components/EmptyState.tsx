import type { ReactNode } from "react";

/**
 * Truthful empty state (F1 route group (tools), D5): the existing `.empty-state`
 * markup extracted into a reusable component so /mappa, /directory and the
 * home page share one honest "no published record matches" presentation.
 * The empty state always states what it means and never implies an area has
 * no surveillance; callers pass their own action (reset / link to /segnala).
 *
 * `heading` (t_966254a1): the empty state's title heading level. /mappa has
 * exactly one header (h1) and no section heading anymore, so its empty state
 * renders h2 to keep the heading ladder unbroken; /directory and the home
 * hub sit under their own h2 section headings and keep the default h3.
 */
export function EmptyState({ title, body, action, heading = "h3" }: { title: ReactNode; body: ReactNode; action?: ReactNode; heading?: "h2" | "h3" }) {
  const HeadingTag = heading;
  return (
    <div className="empty-state">
      <HeadingTag>{title}</HeadingTag>
      <p>{body}</p>
      {action}
    </div>
  );
}
