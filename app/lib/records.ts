import type { MapCamera } from "../components/SurveillanceMap";

export type Camera = MapCamera & {
  source: string;
  updated: string;
  description: string;
  address?: string | null;
  manufacturer?: string | null;
  observedOn?: string | null;
};

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
    source: "Prototype seed",
    updated: "Demo data",
    description: "The field of view is deliberately approximate and should never be treated as a record of live activity.",
    address: "Illustrative location, Rome",
  },
];
