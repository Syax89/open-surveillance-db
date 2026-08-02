"use client";

import type { ReactNode } from "react";
import type { Camera } from "../lib/records";

export type RecordFact = { label: string; value: ReactNode };

type RecordCardProps = {
  camera: Camera;
  /** Whitelisted, localized status label shown next to the status dot. */
  statusLabel: string;
  /** Fact rows rendered in the card's <dl> (record id, source, distance…). */
  facts: RecordFact[];
  /** Optional action row (buttons/links) rendered under the facts. */
  actions?: ReactNode;
};

/**
 * Shared public record card: status dot + topline, title, kind, fact list and
 * an action slot. Single source of truth for the record-list-card markup used
 * by the home directory and the place-search results (audit t_c6da60f0, P2).
 *
 * Callers pass the whitelisted status label (publicStatusLabel) and their own
 * fact rows, so the component stays free of bundle/status coupling while the
 * rendered output is byte-identical to the markup it replaces.
 *
 * t_127492f1: the /directory catalog renders the SAME markup inside
 * `.directory-tool .record-list`; the flat-row styling comes from that list
 * context (one column, hairline rows — see globals.css), so the card class
 * and the a11y selectors that count `class="record-list-card"` stay intact.
 */
export function RecordCard({ camera, statusLabel, facts, actions }: RecordCardProps) {
  return (
    <article className="record-list-card">
      <div>
        <p className="card-topline"><span className={`status-dot ${camera.status}`} /> {statusLabel}</p>
        <h3>{camera.title}</h3>
        <p className="record-kind">{camera.kind}</p>
      </div>
      <dl>{facts.map((fact, index) => <div key={`${camera.id}-${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
      {actions && <div className="record-list-actions">{actions}</div>}
    </article>
  );
}
