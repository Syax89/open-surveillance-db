/**
 * OSM ALPR (automatic licence plate reader) country adapter factory —
 * DeFlock-equivalent SELECTION, national Geofabrik extract.
 *
 * DeFlock's upstream query (worker/src/fetchers/cameras.ts,
 * https://github.com/FoggedLens/deflockhopper_maps) selects
 * `node|way["man_made"="surveillance"]["surveillance:type"="ALPR"]` and
 * keeps only elements whose tags still satisfy both filters after the
 * response arrives. We reuse the SAME tag selection, add this project's
 * stricter public-scope gate on top, and reuse the shared OSM country
 * factory for all normalisation (kind/direction/address/external_id/
 * entity-only operator policy) — see osm-country-factory.mjs.
 *
 * Deliberate differences from the shared factory (safety, not cosmetics):
 *   - every element must pass `gateAlprElement` BEFORE the shared
 *     normaliser runs, so the gates hold for `--source=<file>` fixtures
 *     and direct `parsePayload()` calls, not only for the fetch path;
 *   - tags are copied through an explicit ALLOWLIST: free text
 *     (description/note), image/url/mapillary, contact:*, wikidata and
 *     contributor metadata can never reach a staged row;
 *   - `surveillance` must be explicitly `public` or `outdoor` — a missing
 *     or different scope is SKIPPED, never inferred (DeFlock does not
 *     apply this filter; we do, because the DB only publishes public
 *     outdoor infrastructure);
 *   - `kind` is forced to the canonical ALPR kind instead of trusting the
 *     descriptor's surveillance_type_map.
 *
 * Licence: the data are OpenStreetMap, ODbL 1.0. Geofabrik is only the
 * extract host. DeFlock is NOT the data owner: it is an independent
 * ALPR map whose own terms (https://deflock.org/terms) reserve its text
 * and logos and ship its software under MIT. Nothing from DeFlock's
 * non-OSM material is copied here.
 */

import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

/** Canonical kind every staged row carries (app/lib/camera-kinds.ts). */
export const ALPR_KIND = "Traffic / licence plate reader";

/** Exact `surveillance:type` token DeFlock's query matches (case-sensitive). */
export const ALPR_TAG_VALUE = "ALPR";

/** Accepted `surveillance` scopes: explicit public-space values only. */
export const ALPR_SCOPES = Object.freeze(["public", "outdoor"]);

/** Title the shared normaliser falls back to when the tags carry no name. */
const GENERIC_TITLE = "Surveillance camera";

/**
 * Tags the shared normaliser is allowed to read. Everything else in
 * `element.tags` is dropped before parsing. `name`/`operator` feed the
 * title and the entity-only operator note; no other free text survives.
 */
const ALLOWED_TAGS = Object.freeze([
  "man_made",
  "surveillance",
  "surveillance:type",
  "camera:type",
  "camera:direction",
  "name",
  "operator",
  "addr:street",
  "addr:housenumber",
  "addr:city",
]);

/** Free-text name values that are really a link/address → dropped. */
const LINK_LIKE = /(https?:|www\.|@)/i;

/**
 * Normalise an OSM element id to a positive safe integer, or null.
 * `out meta` JSON always emits numbers; a digits-only string is accepted
 * (some converters stringify ids) — anything else fails closed.
 */
export function normalizeOsmId(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * The ALPR gate — the ONLY way an element may reach the normaliser.
 * Returns `{ ok: true, element }` with a sanitised element (allowlisted
 * tags, validated id) or `{ ok: false, reason }` for the skip report.
 *
 * Skip reasons (stable strings, aggregated in `skipped.reasons`):
 *   malformed element · unsupported element type · invalid OSM id ·
 *   missing tags · man_made!=surveillance · surveillance:type!=ALPR ·
 *   missing surveillance scope · surveillance scope not public/outdoor
 */
export function gateAlprElement(el) {
  if (!el || typeof el !== "object" || Array.isArray(el)) {
    return { ok: false, reason: "malformed element" };
  }
  if (el.type !== "node" && el.type !== "way") {
    return { ok: false, reason: "unsupported element type" };
  }
  const id = normalizeOsmId(el.id);
  if (id === null) return { ok: false, reason: "invalid OSM id" };

  const tags = el.tags;
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    return { ok: false, reason: "missing tags" };
  }
  if (tags.man_made !== "surveillance") {
    return { ok: false, reason: "man_made!=surveillance" };
  }
  // Exact, case-sensitive token: DeFlock matches "ALPR" only, and OSM's
  // documented value for plate readers is "ALPR".
  if (tags["surveillance:type"] !== ALPR_TAG_VALUE) {
    return { ok: false, reason: "surveillance:type!=ALPR" };
  }
  const scope = tags.surveillance;
  if (scope === undefined || scope === null || scope === "") {
    return { ok: false, reason: "missing surveillance scope" };
  }
  if (!ALPR_SCOPES.includes(scope)) {
    return { ok: false, reason: "surveillance scope not public/outdoor" };
  }

  const safeTags = {};
  for (const key of ALLOWED_TAGS) {
    if (tags[key] !== undefined) safeTags[key] = tags[key];
  }
  if (typeof safeTags.name === "string" && LINK_LIKE.test(safeTags.name)) {
    delete safeTags.name; // a bare link/e-mail is not a camera name
  }

  const element = { type: el.type, id, tags: safeTags };
  if (el.lat !== undefined) element.lat = el.lat;
  if (el.lon !== undefined) element.lon = el.lon;
  // Ways carry their position as `center` in the converted extract
  // (`out center`); child nodes, when present, are untagged and skipped.
  if (el.center && typeof el.center === "object") {
    element.center = { lat: el.center.lat, lon: el.center.lon };
  }
  return { ok: true, element };
}

/**
 * Coerce a payload into the raw element array. Accepts the object the
 * adapter's own fetchPayload returns (`{elements, checksum}`) and the raw
 * JSON STRING the runner passes when `--source=<file>` is used
 * (runner.mjs reads the file with readFile). Anything else is a fail-closed
 * error, never an empty import.
 */
export function elementsFromPayload(raw, slug = "osm-alpr") {
  let doc = raw;
  if (typeof raw === "string") {
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      throw new Error(`[${slug}] ALPR source payload is not valid JSON: ${err.message}`, { cause: err });
    }
  }
  const elements = Array.isArray(doc) ? doc : doc?.elements;
  if (!Array.isArray(elements)) {
    throw new Error(`[${slug}] ALPR source payload must be an object with an "elements" array`);
  }
  return elements;
}

/**
 * Title for a staged row. The shared normaliser's generic fallback makes
 * every unnamed camera share one title, and the pipeline's Pass 2 skips
 * rows whose text matches a candidate within 75 m — for ALPR that would
 * silently drop the second camera of a co-located pair (front/rear plate
 * readers are the norm). Unnamed rows therefore carry their OSM ref, which
 * keeps distinct nodes distinct; named rows keep the normaliser's title.
 */
export function alprTitle(row) {
  if (row.title !== GENERIC_TITLE) return row.title;
  const externalId = String(row.external_id ?? "");
  const ref = externalId.slice(externalId.lastIndexOf("/") + 1);
  return ref ? `ALPR camera ${ref}`.slice(0, 90) : row.title;
}

/**
 * Build one country's ALPR adapter: the shared OSM country factory plus the
 * ALPR gate in front of its parser. `localSourcePath` is the national
 * Geofabrik extract converted to `{elements:[...]}` JSON; when set there is
 * no network access at all (Overpass is never contacted).
 */
export function createOsmAlprAdapter({
  slug,
  iso3166,
  bbox,
  descriptorPath,
  grid = { nx: 3, ny: 2 },
  localSourcePath = null,
}) {
  const base = createOsmCountryAdapter({ slug, iso3166, bbox, descriptorPath, grid, localSourcePath });

  /**
   * Parse the national extract into canonical staged rows. Applies the ALPR
   * gate first (so fixture/`--source`/direct calls are gated identically),
   * then the shared normaliser, then the ALPR title rule.
   */
  function parsePayload(raw) {
    const elements = elementsFromPayload(raw, slug);
    const gateSkipped = { total: 0, reasons: {} };
    const accepted = [];
    for (const el of elements) {
      const gate = gateAlprElement(el);
      if (!gate.ok) {
        gateSkipped.total += 1;
        gateSkipped.reasons[gate.reason] = (gateSkipped.reasons[gate.reason] ?? 0) + 1;
        continue;
      }
      accepted.push(gate.element);
    }

    const parsed = base.parsePayload({ elements: accepted });
    const skipped = {
      total: gateSkipped.total + (parsed.skipped?.total ?? 0),
      reasons: { ...gateSkipped.reasons },
    };
    for (const [reason, count] of Object.entries(parsed.skipped?.reasons ?? {})) {
      skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + count;
    }

    const staged = (parsed.staged ?? []).map((row) => ({
      ...row,
      kind: ALPR_KIND, // never trust the descriptor for a safety-relevant kind
      title: alprTitle(row),
    }));
    return { staged, skipped, checksum: null };
  }

  return { ...base, parsePayload };
}
