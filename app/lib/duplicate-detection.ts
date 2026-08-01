/**
 * Pure duplicate-detection primitives used by the public-only nearby check
 * (Horizon 1: detect likely duplicates before a contributor submits a record).
 *
 * These functions are deliberately free of any Cloudflare/DB binding so the
 * test suite can exercise them directly in plain Node.
 */

export type MatchStrength = "high" | "medium" | "low";

/** Lowercase, fold diacritics, keep letters/digits, collapse whitespace. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Distinct meaningful tokens: stopword-sized fragments (<= 2 chars) are dropped. */
export function tokenSet(value: string): Set<string> {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter((token) => token.length > 2));
}

/**
 * Jaccard similarity over normalized tokens, in [0, 1]. 0 means no shared
 * signal (or no text supplied); 1 means identical token sets. A short exact
 * substring (one distinctive word shared by both strings) is upgraded to 0.75
 * because in practice titles like "Piazza Garibaldi camera" and "Camera Piazza
 * Garibaldi" share every meaningful token anyway.
 */
export function textSimilarity(left: string, right: string): number {
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

/**
 * Map a distance + text-similarity pair to a human-meaningful strength label.
 * The thresholds mirror the product language: <= 25 m is essentially the same
 * spot, <= 75 m is the classic warning radius, and matching text upgrades a
 * candidate up to 200 m so a same-named camera one street away is still caught.
 */
export function classifyDuplicateMatch(distanceMeters: number, similarity: number, hasTextSignal: boolean): MatchStrength {
  if (distanceMeters <= 25) return "high";
  if (distanceMeters <= 75) return hasTextSignal && similarity >= 0.6 ? "high" : "medium";
  return hasTextSignal && similarity >= 0.6 && distanceMeters <= 200 ? "medium" : "low";
}

/**
 * Strengths that force an explicit submitter confirmation before the report
 * is stored (Horizon 1 gate, ADR 0019). Only "high" — essentially the same
 * spot (<= 25 m) or <= 75 m with matching text — is treated as a likely
 * duplicate; medium/low stay informational warnings.
 */
export const DUPLICATE_CONFIRMATION_STRENGTHS: readonly MatchStrength[] = ["high"];

/** True when any candidate is strong enough to require explicit confirmation. */
export function requiresDuplicateConfirmation(candidates: readonly { matchStrength: MatchStrength }[]): boolean {
  return candidates.some((candidate) => DUPLICATE_CONFIRMATION_STRENGTHS.includes(candidate.matchStrength));
}
