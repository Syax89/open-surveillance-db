"use client";

// GDPR art. 13 mini-notice as a native collapsible (issue #431).
//
// The full notice (purpose/basis + rights contact) sits inside a <details>
// so the consent line stays compact on every form: default state is the
// localized label only, one click expands the complete text. Native
// <details>/<summary> gives keyboard + screen-reader support for free (same
// pattern as the faq items and the filters disclosure). The element carries
// the id that the consent checkbox references via aria-describedby, so the
// accessible description points at the disclosure itself (summary + body).

import type { ReactNode } from "react";

type Props = {
  /** id referenced by the consent checkbox aria-describedby. */
  id: string;
  /** Localized collapsed label (e.g. "Privacy details"). */
  label: string;
  /** Full art. 13 text: purpose/basis sentence + privacy + rights links. */
  children: ReactNode;
};

export function Art13Notice({ id, label, children }: Props) {
  return (
    <details className="art13-disclosure" id={id}>
      <summary>{label}</summary>
      <p className="legal-microcopy">{children}</p>
    </details>
  );
}
