/**
 * Adapter USA New England 511 — CCTV Vermont/NH/Maine (cron ricerca
 * 2026-08-09). Tre feed C2C XML (NE Compass) con la STESSA licenza
 * Tri-State Developer Agreement.
 *
 * Source: nec-por.ne-compass.com C2C API. VT 89 + NH 182 + ME 218.
 * Live (status per cam).
 * Licence: Tri-State Developer Agreement (use/reproduce/redistribute
 * with attribution, no NC clause).
 *
 * - Fetch: 3 GET XML (no key).
 * - Mapping: name → title; lat/lon in MICROdegrees (44975151 = 44.975151).
 * - external_id = "ne511:<net>:<id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "usa-new-england-511-cameras-2026";

const NETS = ["Vermont", "NewHampshire", "Maine"];

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-new-england-511-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  for (const net of NETS) {
    const res = await fetchWithRetry(`https://nec-por.ne-compass.com/NEC.XmlDataPortal/api/c2c?networks=${net}&dataTypes=cctvStatusData`);
    all.push({ __net: net, text: await res.text() });
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse C2C XML (microdegrees lat/lon) into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const src of data) {
    const text = src.text ?? "";
    const re = /<cctvStatus\s+id="([^"]*)"[^>]*>(.*?)<\/cctvStatus>/gs;
    let m;
    while ((m = re.exec(text)) !== null) {
      const id = m[1];
      const body = m[2];
      const name = /<name>([^<]*)</.exec(body)?.[1] ?? "";
      const latRaw = /<lat>([^<]*)</.exec(body)?.[1] ?? "";
      const lonRaw = /<lon>([^<]*)</.exec(body)?.[1] ?? "";
      const status = /<status>([^<]*)</.exec(body)?.[1] ?? "";
      const road = /<roadway>([^<]*)</.exec(body)?.[1] ?? "";
      const dir = /<direction>([^<]*)</.exec(body)?.[1] ?? "";

      const lat = Number.parseFloat(latRaw) / 1e6;
      const lon = Number.parseFloat(lonRaw) / 1e6;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
        recordSkip("non-finite/out-of-range/zero coordinates");
        continue;
      }

      const bits = [];
      if (road) bits.push(road);
      if (dir) bits.push(dir);
      if (status) bits.push(status);
      const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

      staged.push({
        title: name || `${src.__net} CCTV ${id || ""}`.trim(),
        kind: "Traffic / licence plate reader",
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
        direction: null,
        address: null,
        notes,
        description: null,
        external_id: `ne511:${src.__net}:${id || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
      });
    }
  }

  return { staged, skipped, checksum: null };
}
