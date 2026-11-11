// Contribution-kind icons (account rework 2026-08-08): inline SVGs, 18px,
// stroke currentColor, aria-hidden — the two kinds are told apart by
// SHAPE + the text label next to it, never by colour alone (WCAG 1.4.1;
// colour stays reserved for the status rail/dot).

import type { Contribution } from "../lib/useContributions";

export function ContributionKindIcon({ kind }: { kind: Contribution["type"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "camera") {
    return (
      <svg {...common}>
        <rect x="2.5" y="7" width="13" height="10" rx="2" />
        <path d="M15.5 10.5l4-2.5v8l-4-2.5" />
        <circle cx="8.5" cy="12" r="2.2" />
      </svg>
    );
  }
  if (kind === "correction") {
    return (
      <svg {...common}>
        <path d="M4 20l1.2-4.2L16.5 4.5a2.1 2.1 0 013 3L8.2 18.8 4 20z" />
        <path d="M14.5 6.5l3 3" />
      </svg>
    );
  }
  return null;
}
