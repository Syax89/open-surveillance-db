"use client";

import Link from "next/link";
import { useMessages } from "../lib/use-messages";

/**
 * The map and directory are two representations of the same public-record
 * explorer. Keeping this switch in one component makes that relationship
 * visible and gives both routes an identical, accessible way to change view.
 */
export function ExploreViewSwitch({
  active,
  mapHref,
  directoryHref,
}: {
  active: "map" | "directory";
  mapHref: string;
  directoryHref: string;
}) {
  const t = useMessages().common;
  return (
    <nav className="explore-view-switch" aria-label={t.exploreViews}>
      <Link href={mapHref} aria-current={active === "map" ? "page" : undefined}>{t.toolMap}</Link>
      <Link href={directoryHref} aria-current={active === "directory" ? "page" : undefined}>{t.toolDirectory}</Link>
    </nav>
  );
}
