// Unit tests for app/lib/duplicate-detection.ts — the pure, DB-free
// primitives behind the pre-submit duplicate warning (Horizon 1).
//
// The harness transpiles every app/lib module into the temp route tree, so we
// can exercise the exact source that the API routes and db helpers use.

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

after(async () => cleanupRouteTree());

const libPromise = loadLib("app/lib/duplicate-detection.mjs");

async function lib() {
  return libPromise;
}

// ---------------------------------------------------------------------------
// normalizeText
// ---------------------------------------------------------------------------

test("normalizeText folds case, strips punctuation and collapses whitespace", async () => {
  const { normalizeText } = await lib();
  assert.equal(normalizeText("  Telecamera   Pubblica!  "), "telecamera pubblica");
  assert.equal(normalizeText("Via Roma, 12 — Incrocio"), "via roma 12 incrocio");
  assert.equal(normalizeText(""), "");
  assert.equal(normalizeText("   "), "");
});

test("normalizeText folds diacritics to ASCII letters", async () => {
  const { normalizeText } = await lib();
  assert.equal(normalizeText("Città Àngelo Òlmo"), "citta angelo olmo");
  assert.equal(normalizeText("Stazione Nord-Est"), "stazione nord est");
});

// ---------------------------------------------------------------------------
// tokenSet
// ---------------------------------------------------------------------------

test("tokenSet drops stopword-sized fragments and deduplicates", async () => {
  const { tokenSet } = await lib();
  assert.deepEqual([...tokenSet("la telecamera di via roma la")].sort(), ["roma", "telecamera", "via"]);
  assert.deepEqual([...tokenSet("")], []);
});

// ---------------------------------------------------------------------------
// textSimilarity
// ---------------------------------------------------------------------------

test("textSimilarity returns 1 for identical normalised text", async () => {
  const { textSimilarity } = await lib();
  assert.equal(textSimilarity("Piazza Garibaldi", "Piazza Garibaldi"), 1);
  assert.equal(textSimilarity("Telecamera Pubblica", "telecamera  pubblica!"), 1);
});

test("textSimilarity returns 0 for disjoint or empty input", async () => {
  const { textSimilarity } = await lib();
  assert.equal(textSimilarity("Via Roma", "Corso Milano"), 0);
  assert.equal(textSimilarity("", "Corso Milano"), 0);
  assert.equal(textSimilarity("Via Roma", ""), 0);
});

test("textSimilarity scores reordered and partially shared titles highly", async () => {
  const { textSimilarity } = await lib();
  assert.ok(textSimilarity("Garibaldi camera", "Camera Garibaldi") >= 0.9);
  assert.ok(textSimilarity("Piazza Garibaldi camera", "Camera piazza") > 0.6);
});

test("textSimilarity upgrades a distinctive substring match to 0.75", async () => {
  const { textSimilarity } = await lib();
  const score = textSimilarity("Piazza Garibaldi telecamera", "Garibaldi");
  assert.ok(score >= 0.75, `expected >= 0.75, got ${score}`);
});

// ---------------------------------------------------------------------------
// classifyDuplicateMatch
// ---------------------------------------------------------------------------

test("classifyDuplicateMatch treats <= 25 m as a very close match regardless of text", async () => {
  const { classifyDuplicateMatch } = await lib();
  assert.equal(classifyDuplicateMatch(0, 0, false), "high");
  assert.equal(classifyDuplicateMatch(25, 0, false), "high");
  assert.equal(classifyDuplicateMatch(25, 0.9, true), "high");
});

test("classifyDuplicateMatch upgrades text-matching candidates up to 75 m", async () => {
  const { classifyDuplicateMatch } = await lib();
  assert.equal(classifyDuplicateMatch(26, 0, false), "medium");
  assert.equal(classifyDuplicateMatch(75, 0, false), "medium");
  assert.equal(classifyDuplicateMatch(26, 0.7, true), "high");
  assert.equal(classifyDuplicateMatch(75, 0.7, true), "high");
  // Similar text below the threshold stays a plain medium warning.
  assert.equal(classifyDuplicateMatch(60, 0.4, true), "medium");
});

test("classifyDuplicateMatch extends the text upgrade to 200 m, then falls back to low", async () => {
  const { classifyDuplicateMatch } = await lib();
  assert.equal(classifyDuplicateMatch(100, 0.8, true), "medium");
  assert.equal(classifyDuplicateMatch(200, 0.8, true), "medium");
  assert.equal(classifyDuplicateMatch(201, 0.8, true), "low");
  assert.equal(classifyDuplicateMatch(300, 0, false), "low");
});
