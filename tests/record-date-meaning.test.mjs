/**
 * M03 (design review 2026-10-22, P1) — the date labels must not lie.
 *
 * Evidence from the review: /records/27727 showed BOTH "Community status:
 * Never confirmed" and "Last confirmation: 8 August 2026". The badge is right
 * (it reads `lastVerifiedAt`); the detail row labelled "Last confirmation"
 * rendered `record.updated`, i.e. the record's last UPDATE (import/edits).
 * The same mislabel reached the directory cards and the place-search cards.
 *
 * Contract asserted here (EN + IT, three record shapes):
 *   1. a real community confirmation keeps its confirmation wording
 *      (badge: "Last confirmed"/"Ultima conferma" + count and date), taken
 *      from `lastVerifiedAt` — untouched by this fix;
 *   2. the update date (`record.updated`) is labelled as an UPDATE
 *      ("Last update"/"Ultimo aggiornamento") and never as a confirmation;
 *   3. badge and update date can never contradict each other: an imported,
 *      never-confirmed record still reads "Never confirmed" and its update
 *      date is not presented as a confirmation;
 *   4. the demo seed keeps its "Demo data" marker on both rows;
 *   5. directory cards (list + place search) show the update label too.
 *
 * Fixtures are fictitious (example.test, illustrative Rome coordinates).
 * No DB/model/API semantics change: only the presented label.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, loadDomModule, installFetchMock, installCamerasApiMock, jsonResponse,
  renderWithLocale, setNavState, setUrlState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let RecordPage;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  RecordPage = await loadDomPage("app/records/[id]/RecordPageBody.mjs");
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  if (typeof window !== "undefined") window.localStorage.removeItem("opensurveillancedb-locale");
});

const UPDATED = "2026-08-08T00:00:00.000Z";
const VERIFIED = "2026-03-02T00:00:00.000Z";

const BASE = {
  id: 7,
  title: "Fixture Date Camera",
  kind: "Fixed dome",
  status: "active",
  latitude: 41.9004,
  longitude: 12.4936,
  source: "Community report",
  updated: UPDATED,
  createdAt: "2026-03-01T00:00:00.000Z",
  description: "Fictitious public record used only in date-meaning tests.",
  address: "Illustrative location, Rome",
};

const IMPORTED = {
  ...BASE,
  source: "import:fixture-source-2026",
  lastVerifiedAt: null,
  importBatch: {
    sourceName: "Fixture Open Data (test)",
    sourceUrl: "https://example.invalid/fixture",
    license: "ODbL 1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
  },
};

const CONFIRMED = {
  ...BASE,
  lastVerifiedAt: VERIFIED,
  confirmCount: 3,
};

const DEMO = { ...BASE, status: "demo", source: "Development seed" };

function recordHandler(record) {
  return (input) => {
    const single = typeof input === "string" && input.match(/^\/api\/cameras\/(\d+)$/);
    if (single) {
      return Number(single[1]) === record.id
        ? jsonResponse({ record })
        : jsonResponse({ error: "not found" }, { status: 404 });
    }
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/events$/)) return jsonResponse({ events: [] });
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/actions$/)) return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

async function renderRecord(record, locale = "en") {
  installFetchMock(recordHandler(record));
  await setNavState({ params: { id: String(record.id) } });
  if (locale !== "en") window.localStorage.setItem("opensurveillancedb-locale", locale);
  const view = await renderWithLocale(React.createElement(RecordPage));
  await view.findByText(record.title);
  return view;
}

const longDate = (iso, tag) => new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric" });

/** The facts <dl> — the badge lives OUTSIDE it, so the two can be compared. */
function factsText(container) {
  return container.querySelector(".record-detail-facts")?.textContent ?? "";
}

test("EN imported, never confirmed: the update date is never labelled as a confirmation", async () => {
  const view = await renderRecord(IMPORTED);
  const facts = factsText(view.container);
  const updated = longDate(UPDATED, "en-GB");

  // Badge: a real "never confirmed" statement (lastVerifiedAt is null).
  assert.ok(view.getByText("Never confirmed"), "an imported row stays never-confirmed");
  // Facts: the update date is presented as an update…
  assert.match(facts, /Last update/, "the update date needs an update label");
  assert.ok(facts.includes(updated), "the updated date is shown next to its own label");
  // …and NEVER as a confirmation (the contradiction reported by the review).
  assert.doesNotMatch(facts, /Last confirmation/i, "record.updated must not be labelled 'Last confirmation'");
  // The badge carries no date, so the two rows cannot contradict.
  const badge = view.container.querySelector(".community-badge")?.textContent ?? "";
  assert.doesNotMatch(badge, /\d{4}/, "the never-confirmed badge must not show a date");
});

test("IT imported, never confirmed: 'Mai confermata' and 'Ultimo aggiornamento' (no 'Ultima conferma')", async () => {
  const view = await renderRecord(IMPORTED, "it");
  const facts = factsText(view.container);
  const updated = longDate(UPDATED, "it-IT");

  assert.ok(view.getByText("Mai confermata"), "the Italian badge keeps the never-confirmed meaning");
  assert.match(facts, /Ultimo aggiornamento/, "the update date needs the Italian update label");
  assert.ok(facts.includes(updated));
  assert.doesNotMatch(facts, /Ultima conferma/i, "record.updated must not read as a community confirmation");
});

test("confirmed record: the confirmation wording stays on the badge, the update date stays an update", async () => {
  const en = await renderRecord(CONFIRMED);
  assert.match(
    en.container.querySelector(".community-badge")?.textContent ?? "",
    new RegExp(`Last confirmed: ${longDate(VERIFIED, "en-GB")}`),
    "a real confirmation (lastVerifiedAt) keeps the confirmation wording",
  );
  assert.doesNotMatch(factsText(en.container), /Last confirmed/i, "the facts row never claims a confirmation");

  rtl.cleanup();
  window.localStorage.setItem("opensurveillancedb-locale", "it");
  const it = await renderRecord(CONFIRMED, "it");
  assert.match(
    it.container.querySelector(".community-badge")?.textContent ?? "",
    new RegExp(`Ultima conferma: ${longDate(VERIFIED, "it-IT")}`),
    "the Italian confirmation wording is untouched",
  );
  assert.match(factsText(it.container), /Ultimo aggiornamento/);
  assert.doesNotMatch(factsText(it.container), /Ultima conferma/i);
});

test("demo record: the illustrative marker wins on both the badge and the date row", async () => {
  const view = await renderRecord(DEMO);
  const badge = view.container.querySelector(".community-badge")?.textContent ?? "";
  assert.match(badge, /Demo data/, "the demo badge states the record is illustrative");
  const facts = factsText(view.container);
  assert.match(facts, /Demo data/, "the demo row keeps the illustrative marker, never a real update date");
  assert.doesNotMatch(facts, /Last confirmation/i);
});

test("directory cards label the update date as an update, not a confirmation", async () => {
  await setUrlState("/directory");
  installCamerasApiMock([
    { ...BASE, id: 1, title: "Corner shop entrance", kind: "Fixed dome", updated: "2026-07-01" },
    { ...DEMO, id: 2, title: "Illustrative demo row" },
  ]);
  const DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  const view = await renderWithLocale(React.createElement(DirectoryTool));

  const container = view.container;
  await rtl.waitFor(() => assert.equal(container.querySelectorAll("ul.record-list li").length, 2, "both fixture cards must render"), { timeout: 5000 });
  const text = container.querySelector("ul.record-list")?.textContent ?? "";
  assert.match(text, /Last update/, "the card shows the update label for record.updated");
  assert.doesNotMatch(text, /Last confirmed/i, "a card never presents the update date as a community confirmation");
  assert.match(text, /Demo data/, "the demo card keeps its illustrative marker");
});
