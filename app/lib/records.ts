import { isPublicStatus } from "./public-status";
import type { MapCamera } from "../components/SurveillanceMap";

export type Camera = MapCamera & {
  source: string;
  updated: string;
  description: string;
  address?: string | null;
  manufacturer?: string | null;
  observedOn?: string | null;
  /**
   * Community-verification aggregate count (ADR 0018 §2.3, C1). Public and
   * aggregate only — never attribution to any profile. Present on real API
   * records (GET /api/cameras fills it via confirmationCountsFor); absent
   * on the demo seed, which renders the widget without a counter until the
   * record detail loads the live value.
   */
  confirmationCount?: number;
  /**
   * Machine-readable last verification date (F0, FRONTEND_PLAN § 3.2.6):
   * the server freshness windows are anchored on this field. Present on
   * real API records; absent on the demo seed (which keeps `updated` as
   * the fallback anchor in the client freshness gate).
   */
  lastVerifiedAt?: string | null;
};

/**
 * Defense-in-depth client gate: only records whose status is whitelisted in
 * PUBLIC_CAMERA_STATUSES (verified/demo) may be rendered. The API already
 * filters server-side; this second gate guarantees a non-public record that
 * ever reaches the client bundle is dropped before any component can display
 * it, its location, or its internal status string.
 */
export function publicRecords(records: Camera[]): Camera[] {
  return records.filter((record) => isPublicStatus(record.status));
}

export const prototypeRecords: Camera[] = [
  {
    id: 1,
    title: "Illustrative record A",
    kind: "Fixed dome",
    status: "demo",
    latitude: 41.9004,
    longitude: 12.4936,
    source: "Prototype seed",
    updated: "Demo data",
    description: "This marker demonstrates how a verified public record will be presented. It is not a claim about a real camera.",
    address: "Illustrative location, Rome",
  },
  {
    id: 2,
    title: "Illustrative record B",
    kind: "Traffic monitoring",
    status: "demo",
    latitude: 41.9047,
    longitude: 12.5031,
    // Field-of-view bearing (t_f8b775ec): demonstrates the map cone on the
    // prototype seed (a dome would store NULL and render circular instead).
    direction: 45,
    source: "Prototype seed",
    updated: "Demo data",
    description: "The field of view is deliberately approximate and should never be treated as a record of live activity.",
    address: "Illustrative location, Rome",
  },
];
