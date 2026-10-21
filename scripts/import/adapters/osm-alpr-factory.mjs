/**
 * OSM ALPR (licence plate reader) adapter factory — file-mode, national
 * Geofabrik extract. Rationale, source and licence: docs/data-sources/osm-alpr-imports.md.
 *
 * Selection is DeFlock's (node|way with man_made=surveillance and
 * surveillance:type=ALPR) plus this project's explicit public/outdoor scope
 * gate. Everything else — normalisation, kind, external_id, address, dedup,
 * licence gate — is the shared OSM country factory and runner, unchanged.
 *
 * The gate runs inside `parsePayload`, so `--source=<file>`, fixtures and
 * direct calls are filtered exactly like the local-extract fetch path.
 */

import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

/** Scopes we accept on top of DeFlock's selection: explicit public space only. */
const SCOPES = new Set(["public", "outdoor"]);

/**
 * The only source tags forwarded to the shared normaliser. `name` and
 * `operator` are deliberately NOT forwarded: they are free text that can
 * carry a person's name, and a camera's location does not need them.
 */
const ALLOWED_TAGS = ["camera:direction", "addr:street", "addr:housenumber", "addr:city"];

/** Reason an element is skipped (aggregated in `skipped.reasons`). */
function gateReason(el) {
  if (!el || typeof el !== "object" || Array.isArray(el)) return "malformed element";
  if (el.type !== "node" && el.type !== "way") return "unsupported element type";
  if (!Number.isSafeInteger(el.id) || el.id <= 0) return "invalid OSM id";
  const tags = el.tags;
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return "missing tags";
  if (tags.man_made !== "surveillance") return "man_made!=surveillance";
  if (tags["surveillance:type"] !== "ALPR") return "surveillance:type!=ALPR";
  if (tags.surveillance === undefined || tags.surveillance === null || tags.surveillance === "") {
    return "missing surveillance scope";
  }
  if (!SCOPES.has(tags.surveillance)) return "surveillance scope not public/outdoor";
  return null;
}

/** Element with the allowlisted tags copied over (node: lat/lon, way: center). */
function sanitise(el) {
  const tags = {
    man_made: "surveillance",
    surveillance: el.tags.surveillance,
    "surveillance:type": "ALPR",
  };
  for (const key of ALLOWED_TAGS) {
    if (el.tags[key] !== undefined) tags[key] = el.tags[key];
  }
  const element = { type: el.type, id: el.id, tags };
  if (el.lat !== undefined) element.lat = el.lat;
  if (el.lon !== undefined) element.lon = el.lon;
  if (el.center && typeof el.center === "object") {
    element.center = { lat: el.center.lat, lon: el.center.lon };
  }
  return element;
}

/** `{elements:[...]}` object, or the raw JSON string the runner passes for `--source`. */
function elementsOf(raw, slug) {
  let doc = raw;
  if (typeof raw === "string") {
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      throw new Error(`[${slug}] ALPR source payload is not valid JSON: ${err.message}`, { cause: err });
    }
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.elements)) {
    throw new Error(`[${slug}] ALPR source payload must be an object with an "elements" array`);
  }
  return doc.elements;
}

/**
 * Build a country adapter: the shared file-mode OSM adapter plus the ALPR gate.
 * Only the runner-facing contract (slug, getDescriptor, fetchPayload,
 * parsePayload) is exposed — there is no Overpass path for this source.
 */
export function createOsmAlprAdapter({ slug, descriptorPath, localSourcePath }) {
  const base = createOsmCountryAdapter({ slug, descriptorPath, localSourcePath });

  function parsePayload(raw) {
    const skipped = { total: 0, reasons: {} };
    const accepted = [];
    for (const el of elementsOf(raw, slug)) {
      const reason = gateReason(el);
      if (reason) {
        skipped.total += 1;
        skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
        continue;
      }
      accepted.push(sanitise(el));
    }

    const parsed = base.parsePayload({ elements: accepted });
    skipped.total += parsed.skipped?.total ?? 0;
    for (const [reason, count] of Object.entries(parsed.skipped?.reasons ?? {})) {
      skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + count;
    }
    return { staged: parsed.staged ?? [], skipped, checksum: null };
  }

  return { slug, getDescriptor: base.getDescriptor, fetchPayload: base.fetchPayload, parsePayload };
}
