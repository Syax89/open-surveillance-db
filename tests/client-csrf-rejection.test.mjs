/**
 * Client copy for a CSRF/same-origin rejection — F-csrf (follow-up).
 *
 * Defect this suite pins down: every session write that fails the server
 * gate (`sameOrigin(request) && csrfVerified(...)`, plus its 6 routes) is
 * answered with 403 + {"error":"Cross-site request rejected. Refresh the
 * page and try again."} — but so are the DOMAIN refusals of the same
 * endpoints (write gate: unverified session, self-action, self-verify,
 * not-owner). The clients mapped EVERY 403 to their domain message, so a
 * contributor with an expired/missing CSRF cookie was told their email was
 * unverified, or that they could not act on their own record — advice that
 * does not apply and cannot be acted on.
 *
 * The fix: the marker literal lives once in app/lib/csrf.ts
 * (CSRF_REJECTED_ERROR) and `isCsrfRejection(status, body)` tells the two
 * 403s apart. These tests render the REAL clients, drive their REAL submit /
 * toggle handlers against a mocked fetch, and assert on the RENDERED copy —
 * both directions (marker body → refresh advice; domain body → the previous
 * message, unchanged). Expected strings are read from the real i18n bundles
 * (app/lib/i18n), never hard-coded here.
 *
 * Fixtures are fictitious (example.test addresses, made-up titles) — never
 * real personal data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, loadDomPage, installFetchMock, jsonResponse,
  renderWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let csrf;
let messages;
let CorrectionForm;
let SegnalaTool;
let CommunityActions;
let VerificationWidget;
let RecordEditPage;

/** The marker body the server sends for a CSRF/same-origin rejection. */
const csrfBody = () => ({ error: csrf.CSRF_REJECTED_ERROR });
/** Any DOMAIN refusal body (the write gate's canonical 403). */
const DOMAIN_BODY = { error: "Authentication required." };

/**
 * Expected copy — read from the real bundles. `csrf` is the new
 * common.csrfExpired; the rest are the domain messages that must NOT move.
 * Filled in `before()` because the bundles only exist once the harness has
 * built its transpile tree.
 */
let expected;

before(async () => {
  rtl = await setupDom();
  csrf = await loadDomModule("app/lib/csrf.mjs");
  messages = (await loadDomModule("app/lib/i18n/index.mjs")).messages;
  CorrectionForm = (await loadDomModule("app/components/home/CorrectionForm.mjs")).CorrectionForm;
  SegnalaTool = (await loadDomModule("app/components/tools/SegnalaTool.mjs")).SegnalaTool;
  CommunityActions = (await loadDomModule("app/components/CommunityActions.mjs")).CommunityActions;
  VerificationWidget = (await loadDomModule("app/components/VerificationWidget.mjs")).VerificationWidget;
  RecordEditPage = await loadDomPage("app/records/[id]/edit/page.mjs");
  expected = {
    csrf: messages.en.common.csrfExpired,
    csrfIt: messages.it.common.csrfExpired,
    correctionVerify: messages.en.correction.verifyRequired,
    reportVerify: messages.en.report.verifyRequired,
    selfAction: messages.en.community.actions.errorSelfAction,
    selfVerify: messages.en.community.errorSelfVerify,
    editNotOwner: messages.en.community.errorEditNotOwner,
  };
});

afterEach(() => {
  rtl?.cleanup();
  document.cookie = "osdb_csrf=; max-age=0; path=/";
});

// ---------------------------------------------------------------------------
// Unit: the marker predicate
// ---------------------------------------------------------------------------

test("isCsrfRejection: true only for a 403 whose body carries the CSRF marker", () => {
  assert.equal(csrf.isCsrfRejection(403, { error: csrf.CSRF_REJECTED_ERROR }), true, "the marker body is a CSRF rejection");
  assert.equal(csrf.isCsrfRejection(403, { error: "Some other refused write." }), false, "another 403 body is a domain refusal");
  assert.equal(csrf.isCsrfRejection(401, { error: csrf.CSRF_REJECTED_ERROR }), false, "the status must be 403");
  assert.equal(csrf.isCsrfRejection(403, null), false, "a null body is not a marker");
  assert.equal(csrf.isCsrfRejection(403, "text"), false, "a non-object body is not a marker");
  assert.equal(csrf.isCsrfRejection(403, {}), false, "an object without `error` is not a marker");
  assert.equal(csrf.isCsrfRejection(403, undefined), false, "an undefined body is not a marker");
});

test("common.csrfExpired is the shared expired-token copy in EN and IT (same wording as the passkey flow)", () => {
  assert.equal(expected.csrf, "Your security token expired. Refresh the page and try again.");
  assert.equal(expected.csrfIt, "Il token di sicurezza è scaduto. Ricarica la pagina e riprova.");
  assert.equal(expected.csrf, messages.en.auth.passkeyCsrfExpired, "one wording for one condition, EN");
  assert.equal(expected.csrfIt, messages.it.auth.passkeyCsrfExpired, "one wording for one condition, IT");
});

// ---------------------------------------------------------------------------
// 1. CorrectionForm (POST /api/corrections)
// ---------------------------------------------------------------------------

async function submitCorrection(status, body) {
  installFetchMock((input, init) => {
    if (input === "/api/corrections" && init?.method === "POST") return jsonResponse(body, { status });
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  const user = rtl.userEvent.setup();
  const { container } = await renderWithLocale(React.createElement(CorrectionForm));
  const form = container.querySelector("form.correction-form");
  await user.selectOptions(form.querySelector("select[name='issueType']"), "inaccurate");
  await user.type(form.querySelector("textarea[name='message']"), "Fixture correction request");
  await user.click(form.querySelector("input[type='checkbox']"));
  await user.click(form.querySelector("button[type='submit']"));
}

test("correction form: a CSRF 403 shows the expired-token copy, not the verify-required one", async () => {
  const { screen } = rtl;
  await submitCorrection(403, csrfBody());

  assert.ok(await screen.findByText(expected.csrf), "the expired-token copy is rendered");
  assert.equal(screen.queryByText(expected.correctionVerify), null, "the domain copy stays out of this case");
});

test("correction form: a domain 403 keeps the verify-required copy", async () => {
  const { screen } = rtl;
  await submitCorrection(403, DOMAIN_BODY);

  assert.ok(await screen.findByText(expected.correctionVerify), "the domain copy is unchanged");
  assert.equal(screen.queryByText(expected.csrf), null, "no refresh advice for a domain refusal");
});

// ---------------------------------------------------------------------------
// 2. /segnala report flow (useReportFlow + ReportForm through SegnalaTool)
// ---------------------------------------------------------------------------

const verifiedProfile = {
  contributor: {
    id: 1,
    email: "contributor@example.test",
    displayName: "Fixture Contributor",
    emailVerifiedAt: "2026-01-15T10:00:00.000Z",
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T10:00:00.000Z",
  },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

async function submitReport(status, body) {
  installFetchMock((input, init) => {
    const url = String(input);
    // The write gate (P1-2) reads the session first: answer a VERIFIED
    // contributor so the test drives the form, not the login wall.
    if (url === "/api/auth/me") return jsonResponse(verifiedProfile);
    if (url.startsWith("/api/cameras/nearby")) return jsonResponse({ records: [] });
    if (url.startsWith("/api/geocode")) return jsonResponse({ address: "" });
    if (url === "/api/cameras" && init?.method === "POST") return jsonResponse(body, { status });
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  const user = rtl.userEvent.setup();
  const { container } = await renderWithLocale(React.createElement(SegnalaTool, {
    initialCoordinates: { latitude: 44.8378, longitude: 11.6183 },
  }));
  await rtl.screen.findByLabelText("Latitude");
  const form = container.querySelector("form.report-form");
  await user.type(form.querySelector("input[name='title']"), "Fixture public camera");
  await user.selectOptions(form.querySelector("select[name='kind']"), "Fixed dome");
  await user.click(form.querySelector("input[type='checkbox'][required]"));
  await user.click(form.querySelector("button[type='submit']"));
}

test("report flow: a CSRF 403 shows the expired-token copy, not the verify-required one", async () => {
  const { screen } = rtl;
  await submitReport(403, csrfBody());

  assert.ok(await screen.findByText(expected.csrf), "the expired-token copy is rendered");
  assert.equal(screen.queryByText(expected.reportVerify), null, "the domain copy stays out of this case");
});

test("report flow: a domain 403 keeps the verify-required copy", async () => {
  const { screen } = rtl;
  await submitReport(403, DOMAIN_BODY);

  assert.ok(await screen.findByText(expected.reportVerify), "the domain copy is unchanged");
  assert.equal(screen.queryByText(expected.csrf), null, "no refresh advice for a domain refusal");
});

// ---------------------------------------------------------------------------
// 3. CommunityActions (PUT /api/cameras/[id]/actions)
// ---------------------------------------------------------------------------

async function toggleCommunityAction(status, body) {
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Fixture Contributor" });
    if (input === "/api/cameras/7/actions" && method === "GET") return jsonResponse({ action: null });
    if (input === "/api/cameras/7/actions") return jsonResponse(body, { status });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: { like: 3, confirm: 1, gone: 0, problem: 0, privacy: 0 },
  }));
  const useful = await rtl.screen.findByRole("button", { name: /Mark this record as useful/ });
  await rtl.waitFor(() => assert.equal(useful.disabled, false, "the widget enables once the session probe settles"));
  await rtl.userEvent.setup().click(useful);
}

test("community actions: a CSRF 403 shows the expired-token copy, not the self-action one", async () => {
  const { screen } = rtl;
  await toggleCommunityAction(403, csrfBody());

  assert.ok(await screen.findByText(expected.csrf), "the expired-token copy is rendered");
  assert.equal(screen.queryByText(expected.selfAction), null, "the domain copy stays out of this case");
});

test("community actions: a self-action 403 keeps the self-action copy", async () => {
  const { screen } = rtl;
  await toggleCommunityAction(403, { error: "self" });

  assert.ok(await screen.findByText(expected.selfAction), "the domain copy is unchanged");
  assert.equal(screen.queryByText(expected.csrf), null, "no refresh advice for a domain refusal");
});

// ---------------------------------------------------------------------------
// 4. VerificationWidget (PUT /api/cameras/[id]/confirmation)
// ---------------------------------------------------------------------------

async function toggleVerification(status, body) {
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/cameras/9/confirmation" && method === "GET") return jsonResponse({ confirmed: false });
    if (input === "/api/cameras/9/confirmation") return jsonResponse(body, { status });
    if (input === "/api/auth/me") return jsonResponse({ level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 } });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(VerificationWidget, { recordId: 9, aggregateCount: 0 }));
  const button = await rtl.screen.findByRole("button", { name: "Confirm this record exists" });
  await rtl.waitFor(() => assert.equal(button.disabled, false, "the toggle enables for an L1 contributor"));
  await rtl.userEvent.setup().click(button);
}

test("verification widget: a CSRF 403 shows the expired-token copy, not the self-verify one", async () => {
  const { screen } = rtl;
  await toggleVerification(403, csrfBody());

  assert.ok(await screen.findByText(expected.csrf), "the expired-token copy is rendered");
  assert.equal(screen.queryByText(expected.selfVerify), null, "the domain copy stays out of this case");
});

test("verification widget: a self-verify 403 keeps the self-verify copy", async () => {
  const { screen } = rtl;
  await toggleVerification(403, { error: "self" });

  assert.ok(await screen.findByText(expected.selfVerify), "the domain copy is unchanged");
  assert.equal(screen.queryByText(expected.csrf), null, "no refresh advice for a domain refusal");
});

// ---------------------------------------------------------------------------
// 5. /records/[id]/edit (PATCH /api/cameras/[id])
// ---------------------------------------------------------------------------

const ownerRecordFixture = {
  id: 41,
  title: "Fixture Camera Report",
  kind: "Fixed dome",
  manufacturer: "FixtureCorp",
  observedOn: "2026-02-01",
  address: "Illustrative street, Rome",
  notes: "Fixture observation notes.",
  description: "Fixture description.",
  status: "pending",
  updated: "2026-02-10T08:00:00.000Z",
  latitude: 41.90282,
  longitude: 12.49642,
  direction: null,
};

async function submitEdit(status, body) {
  await setNavState({ params: { id: "41" } });
  installFetchMock((input, init) => {
    if (input === "/api/cameras/41/edit") return jsonResponse({ record: ownerRecordFixture, editRequest: null });
    if (input === "/api/cameras/41" && init?.method === "PATCH") return jsonResponse(body, { status });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(RecordEditPage));
  await rtl.waitFor(() => assert.ok(rtl.screen.queryByDisplayValue("Fixture Camera Report"), "the owner view must load"));
  await rtl.userEvent.setup().click(rtl.screen.getByRole("button", { name: "Save changes" }));
}

test("edit page: a CSRF 403 shows the expired-token copy, not the not-owner one", async () => {
  const { screen } = rtl;
  await submitEdit(403, csrfBody());

  assert.ok(await screen.findByText(expected.csrf), "the expired-token copy is rendered");
  assert.equal(screen.queryByText(expected.editNotOwner), null, "the domain copy stays out of this case");
});

test("edit page: a not-owner 403 keeps the not-owner copy", async () => {
  const { screen } = rtl;
  await submitEdit(403, { error: "You can only edit your own reports." });

  assert.ok(await screen.findByText(expected.editNotOwner), "the domain copy is unchanged");
  assert.equal(screen.queryByText(expected.csrf), null, "no refresh advice for a domain refusal");
});
