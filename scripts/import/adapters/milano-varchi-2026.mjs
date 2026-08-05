/**
 * Adapter MILANO — «Varchi elettronici» Area C + Area B (Comune di Milano,
 * dati.comune.milano.it, CC BY — attribuzione "Comune di Milano").
 *
 * Source (census docs/data-sources/censimento-fonti.md § 3.2):
 *   Area C: https://dati.comune.milano.it/it/dataset/ds82_infogeo_varchi_elettronici_localizzazione_
 *   Area B: https://dati.comune.milano.it/dataset/ds959-varchi-areab
 *
 * Verified live (2026-08-05): both packages expose GeoJSON (CRS84, Point
 * [lon, lat]). Area C features: { id_amat, label }. Area B features:
 * { id_amat, nome, autorizzaz, stato } with stato ∈ ATTIVI E SANZIONANTI /
 * IN PRE-ESERCIZIO / DA PROGRAMMARE PRE-ESERCIZIO.
 *
 * Mapping decisions:
 * - kind = "Traffic / licence plate reader" for every varco (electronic
 *   access gates = plate readers; pipeline § 3.4 "varchi ztl").
 * - `stato` NEVER maps to cameras.status (§ 5.2). "DA PROGRAMMARE
 *   PRE-ESERCIZIO" (not installed) is dropped via the descriptor skip_if;
 *   the two installed states are imported.
 * - external_id = "milano:<id_amat>" (source-native stable id).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { cleanText, fetchWithRetry, mapKind, parseCoord } from "./lib.mjs";

export const slug = "milano-varchi-2026";

const DESCRIPTOR_PATH = fileURLToPath(new URL("../../../docs/data-sources/imports/milano-varchi-2026.json", import.meta.url));

/** CKAN dataset ids (stable slugs from the census URLs). */
const CKAN_DATASETS = [
  { key: "areaC", id: "ds82_infogeo_varchi_elettronici_localizzazione_" },
  { key: "areaB", id: "ds959-varchi-areab" },
];

export function getDescriptor() {
  return JSON.parse(readFileSync(DESCRIPTOR_PATH, "utf8"));
}

/** Discover the GeoJSON resource URLs via the CKAN package_show API. */
export async function discoverResources() {
  const found = [];
  for (const dataset of CKAN_DATASETS) {
    const url = `https://dati.comune.milano.it/api/3/action/package_show?id=${encodeURIComponent(dataset.id)}`;
    const res = await fetchWithRetry(url, { timeoutMs: 30000 });
    const body = await res.json();
    if (!body.success) throw new Error(`CKAN package_show failed for ${dataset.id}`);
    const resources = (body.result?.resources ?? []).filter(
      (r) => (r.format ?? "").toLowerCase() === "geojson",
    );
    if (resources.length === 0) throw new Error(`no GeoJSON resource for ${dataset.id}`);
    // Prefer the resource whose name/url mentions the dataset (first GeoJSON).
    found.push({ key: dataset.key, url: resources[0].url });
  }
  return found;
}

/**
 * Fetch both GeoJSON payloads. Returns
 * { payloads: [{ key, geojson }], checksum } — checksum over the raw bodies.
 */
export async function fetchPayload() {
  const resources = await discoverResources();
  const payloads = [];
  const hasher = createHash("sha256");
  for (const { key, url } of resources) {
    const res = await fetchWithRetry(url, { timeoutMs: 60000 });
    const text = await res.text();
    hasher.update(text);
    payloads.push({ key, geojson: JSON.parse(text) });
  }
  return { payloads, checksum: hasher.digest("hex") };
}

/**
 * Parse both FeatureCollections into canonical staged rows. Returns
 * { staged, skipped, checksum } — `skipped` carries per-reason counters so the
 * dry-run report can show why rows were dropped.
 */
export function parsePayload({ payloads } = {}) {
  const descriptor = getDescriptor();
  const staged = [];
  const skipped = { total: 0, reasons: {} };

  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  const skipIf = descriptor.skip_if ?? {};
  const externalPrefix = descriptor.external_id_prefix ?? "";

  for (const { key, geojson } of payloads ?? []) {
    const features = geojson?.type === "FeatureCollection" ? geojson.features : [];
    for (const feature of features) {
      const props = feature.properties ?? {};
      const geometry = feature.geometry;

      // skip_if filter (source status ≠ cameras.status, § 5.2).
      let matchesSkipIf = false;
      for (const [column, value] of Object.entries(skipIf)) {
        if (String(props[column] ?? "").toLocaleLowerCase() === String(value).toLocaleLowerCase()) {
          matchesSkipIf = true;
          recordSkip(`skip_if:${column}=${value}`);
        }
      }
      if (matchesSkipIf) continue;

      if (!geometry || geometry.type !== "Point") {
        recordSkip("non-Point geometry");
        continue;
      }
      const [lon, lat] = geometry.coordinates;
      if (!Number.isFinite(parseCoord(lon)) || !Number.isFinite(parseCoord(lat))) {
        recordSkip("non-finite coordinates");
        continue;
      }

      const sourceId = props.id_amat ?? props.id ?? props["@id"];
      if (sourceId === null || sourceId === undefined || sourceId === "") {
        recordSkip("missing id");
        continue;
      }

      const title = cleanText(props.label ?? props.nome ?? props.name, 90);
      if (!title) {
        recordSkip("missing title");
        continue;
      }

      // Varchi elettronici = plate readers (§ 3.4 "varchi ztl").
      const { kind } = mapKind("varco", descriptor.kind_map);
      const address = cleanText(props.indirizzo ?? props.address ?? null, 180);
      const direction = null;

      // external_id namespaced per dataset: the two CKAN packages use the SAME
      // id_amat sequence (Area C 57–98, Area B 1–971), so a bare "milano:57"
      // would collide across datasets. "milano:areac:57" / "milano:areab:57"
      // keeps the source-native id stable AND unique (verified live 2026-08-05).
      const datasetKey = String(key ?? "area").toLocaleLowerCase();

      staged.push({
        title,
        kind,
        latitude: Number(lat),
        longitude: Number(lon),
        direction,
        address,
        description: null,
        external_id: `${externalPrefix}${datasetKey}:${sourceId}`,
        // dataset provenance for the report (not stored on the row).
        _dataset: key,
      });
    }
  }

  return { staged, skipped, checksum: null };
}
