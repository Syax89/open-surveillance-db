/**
 * Adapter Singapore — LTA Traffic Images API (data.gov.sg).
 * Live API v1, no key required: returns ~8 active cameras with lat/lon,
 * image URL + metadata. The legacy static CSV collection (~80 cams) was
 * decommissioned (redirects to this API, verified 2026-08-16).
 * Licence: Singapore Open Data Licence v1.0 (gate-extended 2026-08-16).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "singapore-lta-traffic-images-2026";

const API_URL = "https://api.data.gov.sg/v1/transport/traffic-images";

export function getDescriptor() {
  return JSON.parse(
    readFileSync(
      new URL("../../../docs/data-sources/imports/singapore-lta-traffic-images-2026.json", import.meta.url),
      "utf8",
    ),
  );
}

export async function fetchPayload() {
  const res = await fetch(API_URL, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0" }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`[${slug}] HTTP ${res.status} from ${API_URL}`);
  const text = await res.text();
  return { payload: text, checksum: createHash("sha256").update(text).digest("hex") };
}

export function parsePayload(raw, descriptor = getDescriptor()) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    recordSkip("invalid json");
    return { staged, skipped, checksum: null };
  }
  const items = data.items ?? [];
  const cameras = items.length ? items[0].cameras ?? [] : [];
  const seen = new Set();
  for (const cam of cameras) {
    const id = cam.camera_id;
    const loc = cam.location;
    if (id === undefined || !loc) {
      recordSkip("no id/location");
      continue;
    }
    const lat = Number(loc.latitude);
    const lon = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      recordSkip("invalid coordinates");
      continue;
    }
    const key = `sg:${id}`;
    if (seen.has(key)) {
      recordSkip("duplicate");
      continue;
    }
    seen.add(key);
    staged.push({
      title: `LTA traffic camera ${id}`,
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: null,
      notes: cam.image ? `Live image: ${cleanText(cam.image, 160)}` : null,
      description: null,
      external_id: key,
    });
  }
  return { staged, skipped, checksum: null };
}
