/**
 * Adapter QLD Traffic Cameras (Queensland, Australia) — wave 14b.
 * Official mirror of the QLDTraffic camera feed on the Queensland OpenDataSoft
 * portal (publisher: QLD Traffic / Dept of Transport and Main Roads).
 * GeoJSON records: geo_point_2d {lat, lon}, id, title (locality), region,
 * direction, view (description), href (image URL), postcode.
 * Licence: CC BY 4.0 (metadata verified 2026-08-16; license_url
 * https://creativecommons.org/licenses/by/4.0/).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cleanText, mapKind } from "./lib.mjs";

export const slug = "australia-queensland-traffic-cameras-2026";

const DATA_PATH = "/opt/open-surveillance-db/.import-data/australia-queensland-traffic-cameras-2026.json";

export function getDescriptor() {
  return JSON.parse(
    readFileSync(new URL("../../../docs/data-sources/imports/australia-queensland-traffic-cameras-2026.json", import.meta.url), "utf8"),
  );
}

export async function fetchPayload() {
  let raw;
  try {
    raw = readFileSync(DATA_PATH, "utf8");
  } catch (err) {
    throw new Error(`[${slug}] local QLD data file missing or unreadable: ${DATA_PATH} (${err.code ?? err.message})`, { cause: err });
  }
  return { payload: raw, checksum: createHash("sha256").update(raw).digest("hex") };
}

export function parsePayload(raw, descriptor = getDescriptor()) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  let records;
  try {
    records = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    recordSkip("invalid json");
    return { staged, skipped, checksum: null };
  }
  // OpenDataSoft v2.1 returns {results:[{fields:{...}}]} — flatten.
  const list = Array.isArray(records) ? records : records.results ?? records.records ?? [];
  for (const entry of list) {
    const f = entry.fields ?? entry;
    const geo = f.geo_point_2d;
    let lat = null;
    let lon = null;
    if (Array.isArray(geo) && geo.length >= 2) {
      [lat, lon] = geo;
    } else if (geo && typeof geo === "object") {
      lat = geo.lat;
      lon = geo.lon;
    } else if (Array.isArray(f.geo_shape) && f.geo_shape.length >= 2) {
      [lat, lon] = f.geo_shape;
    }
    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      recordSkip("no coordinates");
      continue;
    }

    const id = f.id ?? f.record_id ?? entry.recordid;
    if (id === undefined || id === null) {
      recordSkip("no id");
      continue;
    }

    const title = cleanText(f.title ?? f.locality, 90) || `Traffic camera, ${cleanText(f.region ?? "Queensland", 40)}`;

    const region = cleanText(f.region, 60);
    const direction = cleanText(f.direction, 40);
    let notes = [];
    if (region) notes.push(`Region: ${region}`);
    if (direction) notes.push(`Direction: ${direction}`);
    if (f.view) notes.push(cleanText(f.view, 120));

    staged.push({
      title,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat),
      longitude: Number(lon),
      direction: null,
      address: null,
      notes: notes.length ? notes.join(" — ").slice(0, 200) : null,
      description: null,
      external_id: `qld-cam:${id}`,
    });
  }

  return { staged, skipped, checksum: null };
}
