// Descriptor schema + validation for the import pipeline (FONTI PUBBLICHE
// FASE A, kanban t_6030d390; docs/data-sources/normalizzazione-pipeline.md
// §8.2). A descriptor is a versioned JSON file at
// data-sources/imports/<slug>.json that declaratively describes ONE import
// source: provenance fields (name/licence/attribution), the adapter family
// (`format`), the column map and the transforms. It is the ONLY place where
// a source's quirks live — never hard-coded in an adapter (design §3).
//
// A broken descriptor is a runner error, not a partial import: validation
// runs at load time and the runner refuses to start.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Descriptors live under docs/data-sources/imports/<slug>.json (the census
// workstream's convention — see docs/data-sources/censimento-fonti.md and
// the FASE B descriptors already committed there).
export const DESCRIPTORS_DIR = path.join(root, "docs", "data-sources", "imports");

/** Adapter families the runner can dispatch (FASE B adds concrete parsers). */
export const SUPPORTED_FORMATS = ["csv", "geojson", "osm-overpass", "wfs"];

/**
 * Minimal structural validation of a descriptor object. Returns an array of
 * human-readable problems; an empty array means "loadable". The runner also
 * hard-gates `license` against the licence matrix before --apply.
 */
export function validateDescriptorShape(descriptor) {
  const problems = [];
  if (!descriptor || typeof descriptor !== "object") {
    return ["descriptor is not an object"];
  }
  if (typeof descriptor.slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(descriptor.slug)) {
    problems.push(`slug must be lower-kebab alphanumeric, got ${JSON.stringify(descriptor.slug)}`);
  }
  if (typeof descriptor.source_name !== "string" || descriptor.source_name.trim() === "") {
    problems.push("source_name is required");
  }
  if (!SUPPORTED_FORMATS.includes(descriptor.format)) {
    problems.push(`format must be one of ${SUPPORTED_FORMATS.join(", ")}, got ${JSON.stringify(descriptor.format)}`);
  }
  if (typeof descriptor.license !== "string" || descriptor.license.trim() === "") {
    problems.push("license is required");
  }
  if (descriptor.license_url !== undefined && typeof descriptor.license_url !== "string") {
    problems.push("license_url must be a string");
  }
  if (typeof descriptor.source_url !== "string" || descriptor.source_url.trim() === "") {
    problems.push("source_url is required");
  }
  if (descriptor.attribution_text !== undefined && typeof descriptor.attribution_text !== "string") {
    problems.push("attribution_text must be a string");
  }
  if (descriptor.columns && typeof descriptor.columns !== "object") {
    problems.push("columns must be an object (source column -> target field)");
  }
  if (descriptor.kind_map && typeof descriptor.kind_map !== "object") {
    problems.push("kind_map must be an object (source value -> canonical kind)");
  }
  if (descriptor.skip_if && typeof descriptor.skip_if !== "object") {
    problems.push("skip_if must be an object (column -> value to skip)");
  }
  if (descriptor.external_id_prefix !== undefined && typeof descriptor.external_id_prefix !== "string") {
    problems.push("external_id_prefix must be a string");
  }
  if (descriptor.enrich !== undefined && typeof descriptor.enrich !== "boolean") {
    problems.push("enrich must be a boolean");
  }
  if (descriptor.max_records !== undefined && (!Number.isInteger(descriptor.max_records) || descriptor.max_records < 1)) {
    problems.push("max_records must be a positive integer");
  }
  return problems;
}

/** Load + validate a descriptor file from data-sources/imports/<slug>.json. */
export async function loadDescriptor(slug) {
  const safe = String(slug).replace(/[^a-z0-9-]/g, "");
  const filePath = path.join(DESCRIPTORS_DIR, `${safe}.json`);
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`descriptor not found: ${path.relative(root, filePath)} (expected at data-sources/imports/<slug>.json)`);
  }
  let descriptor;
  try {
    descriptor = JSON.parse(raw);
  } catch (err) {
    throw new Error(`descriptor ${safe}.json is not valid JSON: ${err.message}`);
  }
  const problems = validateDescriptorShape(descriptor);
  if (problems.length > 0) {
    throw new Error(`descriptor ${safe}.json is invalid:\n  - ${problems.join("\n  - ")}`);
  }
  if (descriptor.slug !== safe) {
    throw new Error(`descriptor slug mismatch: file is ${safe}.json but descriptor.slug is ${descriptor.slug}`);
  }
  return descriptor;
}
