import type { ReactNode } from "react";

/**
 * Truthful empty state (F1 route group (tools), D5): the existing `.empty-state`
 * markup extracted into a reusable component so /mappa, /directory and the
 * home page share one honest "no published record matches" presentation.
 * The empty state always states what it means and never implies an area has
 * no surveillance; callers pass their own action (reset / link to /segnala).
 */
export function EmptyState({ title, body, action }: { title: ReactNode; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
