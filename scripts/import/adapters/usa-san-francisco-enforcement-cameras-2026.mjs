/**
 * Adapter USA San Francisco — Red Light & Speed enforcement locations
 * (CEO 2026-08-08, scan catalog.csv fonti ufficiali).
 *
 * Source: SFMTA open data (Socrata). 13 red-light + 56 speed camera
 * locations (site_ids unici da citation datasets). Live.
 * Licence: PDDL (Open Data Commons Public Domain Dedication — public
 * domain, aggiunta al gate 2026-08-08).
 *
 * - Fetch: SODA $select=site_id,point,location + $group=site_id (dedup).
 * - Mapping: location → title; point [lon,lat]; site_id → external_id.
 * - external_id = "sf-redlight:<site>" / "sf-speed:<site_id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "usa-san-francisco-enforcement-cameras-2026";

const REDLIGHT_URL = "https://data.sfgov.org/resource/uzmr-g2uc.json";
const SPEED_URL = "https://data.sfgov.org/resource/d5uh-bk84.json";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-san-francisco-enforcement-cameras-2026.json", import.meta.url), "utf8"));
}

/** Fetch both datasets, dedup by site/intersection, merge into one list. */
export async function fetchPayload() {
  const out = [];
  // Red light: ~646 citation rows → dedup per intersection in JS (SODA
  // $group non accetta campi geometria nel $select).
  const rl = await fetchWithRetry(`${REDLIGHT_URL}?$select=intersection,point&$limit=2000`);
  const rlRows = await rl.json();
  const seenRl = new Set();
  if (Array.isArray(rlRows)) {
    for (const r of rlRows) {
      const key = String(r.intersection ?? "");
      if (!key || seenRl.has(key)) continue;
      seenRl.add(key);
      out.push({ ...r, site_id: key, location: r.intersection, __src: "redlight" });
    }
  }
  // Speed: ~17.5k citation rows → dedup per site_id.
  const sp = await fetchWithRetry(`${SPEED_URL}?$select=site_id,point,location&$limit=30000`);
  const spRows = await sp.json();
  const seenSp = new Set();
  if (Array.isArray(spRows)) {
    for (const r of spRows) {
      const key = String(r.site_id ?? "");
      if (!key || seenSp.has(key)) continue;
      seenSp.add(key);
      out.push({ ...r, __src: "speed" });
    }
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(out));
  return { data: out, checksum: hasher.digest("hex") };
}

/** Parse rows into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const r of data) {
    const coords = r.point?.coordinates;
    const lon = Number.parseFloat(coords?.[0]);
    const lat = Number.parseFloat(coords?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const loc = cleanText(String(r.location ?? ""), 90);
    const src = r.__src === "redlight" ? "red-light" : "speed";
    const site = String(r.site_id ?? "");

    staged.push({
      title: loc || `${src} camera ${site || ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: loc || null,
      notes: `${src === "red-light" ? "Red light" : "Speed enforcement"} · site ${site}`.slice(0, 200),
      description: null,
      external_id: `sf-${src}:${site || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
