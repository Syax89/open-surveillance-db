/**
 * Adapter Cipro — Traffic Enforcement Cameras (Cyprus National Access
 * Point / CyNAP, traffic4cyprus.org.cy). Scan coda giurisdizioni
 * (cron 2026-08-18, pass v2).
 *
 * Source: CyNAP DATEX II v3 open API (fixcyprus.cy), publisher
 * "Ministry of Transport, Communications and Works". 89 telecamere
 * enforcement (speed/red-light), coordinate WGS84 per camera.
 * Licence: CC BY 4.0 (dichiarata sulla pagina dataset). Live.
 *
 * - Fetch: XML DATEX II v3 (TrafficEquipmentPublication).
 * - Mapping: equipmentName (EN) → title; equipmentAddress → address;
 *   latitude/longitude dirette; identifier → external_id.
 * - external_id = "cy-enf:<identifier>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "cipro-traffic-enforcement-cameras-2026";

const DATEX_URL =
  "https://fixcyprus.cy/gnosis/open/api/nap/datasets/traffic_enforcement_cameras/";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/cipro-traffic-enforcement-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(DATEX_URL);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse DATEX II v3 trafficEquipment blocks into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const blocks = text.match(/<trafficEquipment[\s\S]*?<\/trafficEquipment>/g) ?? [];
  for (const b of blocks) {
    const type = /<equipmentType>([^<]+)<\/equipmentType>/.exec(b)?.[1];
    if (type !== "trafficEnforcementCamera") {
      recordSkip(`equipmentType ${type ?? "unknown"}`);
      continue;
    }

    const id = /<common:versionedIdentifier>\s*<common:identifier>([^<]+)<\/common:identifier>/.exec(b)?.[1];
    const name = /<equipmentName>[\s\S]*?<common:value[^>]*>([^<]+)<\/common:value>/.exec(b)?.[1];
    const address = /<equipmentAddress>[\s\S]*?<common:addressLineText>[\s\S]*?<common:value[^>]*>([^<]+)<\/common:value>/.exec(b)?.[1];
    const lat = Number.parseFloat(/<common:latitude>([^<]+)<\/common:latitude>/.exec(b)?.[1]);
    const lon = Number.parseFloat(/<common:longitude>([^<]+)<\/common:longitude>/.exec(b)?.[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const title = cleanText(name ?? `Cyprus enforcement cam ${id ?? ""}`.trim(), 90);

    staged.push({
      title,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: cleanText(address ?? "", 80) || null,
      notes: "CyNAP — traffic enforcement camera",
      description: null,
      external_id: `cy-enf:${id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
