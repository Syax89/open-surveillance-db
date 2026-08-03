/**
 * i18n registry suite (kanban t_6424f961) — the locale registry is the
 * single source of truth for the supported languages.
 *
 * The CEO asked for a language system that is "facilmente aggiornabile, in
 * caso aggiungiamo altre" (easily extendable if we add more). Before this
 * refactor, `Locale = "en" | "it"` was hardcoded in five-plus places
 * (types.ts, index.ts, LocaleToggle, server-i18n, format-date,
 * legalMessages, email templates). Now SUPPORTED_LOCALES in
 * app/lib/i18n/types.ts drives everything.
 *
 * This suite pins the registry contract:
 *   1. SUPPORTED_LOCALES is well-formed: ≥2 entries, unique codes, the
 *      pilot language ("en") first, every entry has code/label/bcp47.
 *   2. Registry ↔ bundles parity: `messages` and `legalMessages` are
 *      keyed EXACTLY by the registry — no drift in either direction, and
 *      every locale's bundle carries the same namespaces as the pilot.
 *   3. Dynamic resolution: resolveLocale/isLocale accept registered codes
 *      and fall back to the pilot for anything unknown/missing (the
 *      server lookup and the API routes use these — no ternaries).
 *   4. BCP 47 tags derive from the registry (LOCALE_BCP47) and actually
 *      localize Intl output (formatPublicDate: it → it-IT, en → en-GB).
 *   5. The LocaleToggle renders one button per registry entry — and with
 *      a 3+-language MOCK registry it renders all three (proving the
 *      buttons are data-driven, not a hardcoded EN/IT pair); an unknown
 *      mock click falls back to the pilot (same contract as the invalid
 *      stored-value test in client-locale-toggle.test.mjs).
 *
 * Fixtures: interface strings and registry metadata only — no personal
 * data (privacy & safety by design).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let i18n;
let legalIndex;
let formatDate;
let LocaleToggle;

/** A 3+-language mock registry — what SUPPORTED_LOCALES will look like
 *  when the CEO's "aggiungiamo altre" happens. Plain JS on purpose: the
 *  component's prop type is readonly LocaleInfo[], and the test passes a
 *  runtime-only wider array (no tsc on .mjs). */
const MOCK_THREE_LOCALES = [
  { code: "en", label: "EN", bcp47: "en-GB" },
  { code: "it", label: "IT", bcp47: "it-IT" },
  { code: "de", label: "DE", bcp47: "de-DE" },
];

before(async () => {
  rtl = await setupDom();
  i18n = await loadDomModule("app/lib/i18n/index.mjs");
  legalIndex = await loadDomModule("app/lib/legal/index.mjs");
  formatDate = await loadDomModule("app/lib/format-date.mjs");
  const localeMod = await loadDomModule("app/components/LocaleProvider.mjs");
  LocaleToggle = localeMod.LocaleToggle;
});

afterEach(() => rtl?.cleanup());

// ---------------------------------------------------------------------------
// 1. Registry well-formedness
// ---------------------------------------------------------------------------

test("registry: SUPPORTED_LOCALES is well-formed (unique codes, pilot first, full entries)", () => {
  const { SUPPORTED_LOCALES, DEFAULT_LOCALE } = i18n;
  assert.ok(Array.isArray(SUPPORTED_LOCALES) && SUPPORTED_LOCALES.length >= 2, "at least two languages");
  const codes = SUPPORTED_LOCALES.map((l) => l.code);
  assert.equal(new Set(codes).size, codes.length, "locale codes must be unique");
  assert.equal(codes[0], "en", "English (the pilot, ADR 0007) must stay the first registry entry");
  for (const entry of SUPPORTED_LOCALES) {
    assert.equal(typeof entry.code, "string", "entry.code");
    assert.equal(typeof entry.label, "string", "entry.label (toggle button text)");
    assert.match(entry.bcp47, /^[a-z]{2}(-[A-Za-z0-9]+)*$/, `entry.bcp47 must be a BCP 47 tag (${entry.code})`);
  }
  assert.equal(DEFAULT_LOCALE, "en", "DEFAULT_LOCALE derives from the first entry");
});

// ---------------------------------------------------------------------------
// 2. Registry ↔ bundles parity (messages + legalMessages)
// ---------------------------------------------------------------------------

test("parity: messages and legalMessages are keyed exactly by the registry", () => {
  const codes = i18n.SUPPORTED_LOCALES.map((l) => l.code).sort();
  const { messages } = i18n;
  const { legalMessages } = legalIndex;

  assert.deepEqual(Object.keys(messages).sort(), codes, "every registered locale must have a message bundle (and no bundle without a registry entry)");
  assert.deepEqual(Object.keys(legalMessages).sort(), codes, "every registered locale must have a legal content bundle (and vice versa)");
});

test("parity: every locale's bundle carries the same top-level namespaces as the pilot", () => {
  const { messages } = i18n;
  const pilotNamespaces = Object.keys(messages.en).sort();
  for (const { code } of i18n.SUPPORTED_LOCALES) {
    assert.deepEqual(
      Object.keys(messages[code]).sort(),
      pilotNamespaces,
      `${code} bundle must expose the same namespaces as the English pilot`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Dynamic resolution (what server-i18n and the API routes use)
// ---------------------------------------------------------------------------

test("resolution: resolveLocale accepts registered codes and falls back to the pilot", () => {
  const { resolveLocale, isLocale } = i18n;
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("it"), "it");
  assert.equal(resolveLocale("fr"), "en", "unknown code → pilot");
  assert.equal(resolveLocale(""), "en", "empty string → pilot");
  assert.equal(resolveLocale(null), "en");
  assert.equal(resolveLocale(undefined), "en");

  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("it"), true);
  assert.equal(isLocale("fr"), false);
  assert.equal(isLocale(null), false);
});

// ---------------------------------------------------------------------------
// 4. BCP 47 tags from the registry drive Intl output
// ---------------------------------------------------------------------------

test("bcp47: LOCALE_BCP47 derives from the registry and formatPublicDate localizes", () => {
  const { LOCALE_BCP47 } = i18n;
  assert.equal(LOCALE_BCP47.en, "en-GB");
  assert.equal(LOCALE_BCP47.it, "it-IT");
  // The registry has exactly the bcp47 entries of SUPPORTED_LOCALES.
  assert.equal(Object.keys(LOCALE_BCP47).length, i18n.SUPPORTED_LOCALES.length);

  const iso = "2026-01-05T12:00:00.000Z";
  const it = formatDate.formatPublicDate(iso, "it");
  const en = formatDate.formatPublicDate(iso, "en");
  assert.ok(it.includes("gennaio"), `Italian date must render in it-IT (got: ${it})`);
  assert.ok(en.includes("January"), `English date must render in en-GB (got: ${en})`);
  // Non-parseable values stay untouched (formatPublicDate contract).
  assert.equal(formatDate.formatPublicDate("Demo data", "it"), "Demo data");
  assert.equal(formatDate.formatPublicDate(null, "it"), "");
});

// ---------------------------------------------------------------------------
// 5. LocaleToggle is generated from the registry (incl. 3+ language mock)
// ---------------------------------------------------------------------------

test("toggle: renders exactly one button per registry entry, pilot pressed by default", async () => {
  const { screen } = rtl;
  window.localStorage.clear();

  await renderWithLocale(React.createElement(LocaleToggle));

  const buttons = screen.getAllByRole("button");
  assert.equal(buttons.length, i18n.SUPPORTED_LOCALES.length, "one button per registered locale — never a hardcoded pair");
  for (const [index, entry] of i18n.SUPPORTED_LOCALES.entries()) {
    assert.equal(buttons[index].textContent, entry.label, "button label from the registry");
  }
  assert.equal(screen.getByText("EN").getAttribute("aria-pressed"), "true", "pilot pressed by default");
  assert.equal(screen.getByText("IT").getAttribute("aria-pressed"), "false");
});

test("toggle: with a 3+ language mock registry it renders every entry (data-driven, not EN/IT)", async () => {
  const { screen } = rtl;
  window.localStorage.clear();

  await renderWithLocale(
    React.createElement(LocaleToggle, { locales: MOCK_THREE_LOCALES }),
  );

  const buttons = screen.getAllByRole("button");
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    ["EN", "IT", "DE"],
    "a third registry entry must produce a third button with zero component changes",
  );
  assert.equal(buttons[0].getAttribute("aria-pressed"), "true", "EN pressed by default");
  assert.equal(buttons[1].getAttribute("aria-pressed"), "false");
  assert.equal(buttons[2].getAttribute("aria-pressed"), "false");

  // Clicking an unregistered mock locale must not break the store: it falls
  // back to the pilot (same contract as the invalid stored-value test).
  const user = rtl.userEvent.setup();
  await user.click(screen.getByText("DE"));
  assert.equal(document.documentElement.getAttribute("lang"), "en", "unknown locale falls back to the pilot");
  assert.equal(screen.getByText("EN").getAttribute("aria-pressed"), "true");
});
