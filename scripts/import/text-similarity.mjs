// Text-similarity primitives for the import runner (FONTI PUBBLICHE FASE A,
// kanban t_6030d390).
//
// The import pipeline MUST reuse the project's duplicate-detection math
// (design doc §4: "reuse the existing primitives from
// app/lib/duplicate-detection.ts — no new detection code for the core
// math"). The runner is a plain-Node .mjs script, so it cannot import the
// TypeScript module directly; this file is a VERBATIM mirror of the pure
// functions in app/lib/duplicate-detection.ts, which stays the single
// source of truth for the interactive gate.
//
// A parity test (tests/import-pipeline.test.mjs) transpiles
// duplicate-detection.ts through the db-runtime harness and asserts this
// mirror returns identical results on a corpus of pairs — drift is a test
// failure, not a silent divergence.

/** Lowercase, fold diacritics, keep letters/digits, collapse whitespace. */
export function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Distinct meaningful tokens: stopword-sized fragments (<= 2 chars) are dropped. */
export function tokenSet(value) {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter((token) => token.length > 2));
}

/** Jaccard similarity over normalized tokens, in [0, 1]. */
export function textSimilarity(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  let score = union === 0 ? 0 : intersection / union;

  const leftNormalized = normalizeText(left);
  const rightNormalized = normalizeText(right);
  if (
    leftNormalized.length >= 6
    && (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized))
  ) {
    score = Math.max(score, 0.75);
  }
  return score;
}

/** Map distance + text similarity to a human-meaningful strength label. */
export function classifyDuplicateMatch(distanceMeters, similarity, hasTextSignal) {
  if (distanceMeters <= 25) return "high";
  if (distanceMeters <= 75) return hasTextSignal && similarity >= 0.6 ? "high" : "medium";
  return hasTextSignal && similarity >= 0.6 && distanceMeters <= 200 ? "medium" : "low";
}
