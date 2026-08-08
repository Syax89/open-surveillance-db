/**
 * Interactive-accessibility QA suite (kanban t_444f7598).
 *
 * Extends the static a11y coverage from navigation-pages.test.mjs (single
 * <h1>, heading ladder, skip link, focus-visible, contrast) and
 * rendered-html.test.mjs (map region + directory equivalent) with the
 * interactive contracts the audit (t_0de37378) found untested:
 *
 *   1. Map keyboard path: every map action has a keyboard/text equivalent —
 *      the map region is a labelled landmark that is programmatically
 *      focusable (tabindex="-1") but NOT in the tab order, its sr-only
 *      description links to the accessible directory, and every directory
 *      record carries a real "Show on map" <button> that moves focus back
 *      to the region (honouring prefers-reduced-motion). No positive
 *      tabindex anywhere, so the tab order stays the document order.
 *   2. ModerationDashboard: native focusable controls only (no tabIndex →
 *      no involuntary focus trap), labelled action groups, label-for pairs
 *      on every decision control, aria-describedby on the note field,
 *      status/alert live regions, alt text on queue previews. The queue
 *      itself is client-fetched, so the rendered contracts are asserted on
 *      the SSR shell AND on the component source (same pattern as the
 *      shared-layout source tests in rendered-html.test.mjs).
 *   3. Auth/account forms: every control has an accessible name (wrapping
 *      <label> or for/id pair), server-side errors are announced through a
 *      live region (role="alert"). aria-invalid is wired to the per-field
 *      client validation since F-QA t_7b716c97 (finding QA-2026-08-01-2
 *      CLOSED): the interaction test below pins the new behaviour.
 *   4. Locale toggle: the SSR root carries lang="en" and the toggle exposes
 *      aria-label + aria-pressed; the provider updates
 *      document.documentElement.lang on switch so screen readers re-read
 *      the page in the new language.
 *   5. Footer/nav: labelled landmarks, every footer link has visible text
 *      (no unlabeled links), every <img> carries alt. aria-current for the
 *      active page IS implemented since F-QA t_7b716c97 (finding
 *      QA-2026-08-01-3 CLOSED): the footer marks its own link, the header
 *      brand marks the home, and the ToolLayout per-page nav marks the
 *      current tool route — pinned below.
 *   6. Fixture hygiene: all fixtures here are fictional (demo records,
 *      local-only moderator credentials); nothing personal may appear in
 *      the rendered public HTML.
 *
 * Requires `npm run build` first (npm test already builds before running).
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import {
  React,
  installFetchMock,
  jsonResponse,
  loadDomModule,
  renderWithLocale,
  setNavState,
  setupDom,
  wrapWithLocale,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");

/**
 * Aggregate source of the moderation UI: the dashboard orchestrator plus
 * every component under components/moderation/ (the split from the
 * ModerationDashboard monolith, kanban t_c7460073). Used by source-level
 * a11y contracts that used to read the single dashboard file.
 */
async function readModerationSource() {
  const dashboard = await readFile(path.join(root, "app", "components", "ModerationDashboard.tsx"), "utf8");
  const modDir = path.join(root, "app", "components", "moderation");
  const entries = await readdir(modDir, { withFileTypes: true });
  const parts = [dashboard];
  for (const entry of entries) {
    if (entry.isFile() && /\.[jt]sx?$/.test(entry.name)) {
      parts.push(await readFile(path.join(modDir, entry.name), "utf8"));
    }
  }
  return parts.join("\n");
}

/** Collect every JS module of the built worker, with index.js as the entry. */
async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".js")) {
        found.push({ type: "ESModule", path: full });
      }
    }
  };
  await walk(serverDir);
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((m) => m !== entry)];
}

/** Render a route exactly like the deployed worker would. */
async function renderRoute(route, { env = {}, headers = {} } = {}) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    bindings: env,
  });
  try {
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      headers: { accept: "text/html", ...headers },
    });
    return { response, html: await response.text() };
  } finally {
    await mf.dispose();
  }
}

const MODERATION_CREDENTIALS = {
  env: { MODERATION_USER: "moderator", MODERATION_PASSWORD: "s3cret" },
  headers: { authorization: `Basic ${Buffer.from("moderator:s3cret").toString("base64")}` },
};

// ---------------------------------------------------------------------------
// 1. Map keyboard path
// ---------------------------------------------------------------------------

test("the map region is a labelled, programmatically-focusable landmark (not in the tab order)", async () => {
  // F2 home hub: the interactive map moved to /mappa (the hub renders only
  // the static MapTeaser). The map-task keyboard contract is verified on the
  // route that actually owns the map.
  const { html } = await renderRoute("/mappa");
  assert.match(
    html,
    /<div class="map-region" id="map-region" role="region" aria-label="[^"]+" aria-describedby="map-accessibility-description" tabindex="-1">/,
    "map region must be a labelled region whose description is linked via aria-describedby",
  );
  // tabindex="-1" keeps the region out of the tab order while allowing the
  // directory's "Show on map" button to move focus onto it — no trap, no
  // tab-order disruption.
  assert.match(html, /id="map-accessibility-description"/, "the sr-only description must exist");
});

test("the map's sr-only description links to the accessible directory (text equivalent)", async () => {
  const { html } = await renderRoute("/mappa");
  const description = html.match(/<p class="sr-only" id="map-accessibility-description">[\s\S]*?<\/p>/);
  assert.ok(description, "sr-only map description must be rendered");
  assert.match(description[0], /<a href="\/directory">/, "the description must link to the directory route");
  assert.match(description[0], /Go to the accessible directory/, "the directory link must be labelled");
});

test("every directory record has a real 'Show on map' button (keyboard path for map selection)", async () => {
  // Records are client-fetched only (no synthetic seed, no server D1
  // binding in this Miniflare render): the SSR shell is always the honest
  // "no record loaded yet" state here, never a fake record. The structural
  // contract this test guards — every record card carries a real "Show on
  // map" button — is exercised with real (mocked) records post-hydration in
  // tests/client-tools.test.mjs ("MappaTool"/"DirectoryTool" suites); here we
  // only pin that the contract holds vacuously (0 cards ⇒ 0 buttons) and
  // that the directory section itself renders.
  const { html } = await renderRoute("/directory");
  const recordsSection = html.slice(html.indexOf('id="records"'));
  assert.ok(recordsSection.length > 0, "the directory tool must render");
  const recordCards = (recordsSection.match(/class="record-list-card"/g) ?? []).length;
  const showOnMapButtons = (recordsSection.match(/<button[^>]*type="button"[^>]*>Show on map[\s\S]*?<\/button>/g) ?? []).length;
  assert.equal(
    showOnMapButtons,
    recordCards,
    `every record card must have a 'Show on map' button (cards=${recordCards}, buttons=${showOnMapButtons})`,
  );
});

test("every directory record card carries a status dot + text label (status is never colour-only)", async () => {
  // t_d089a17e: the record rows are colour-accented by status (left rail +
  // tint). WCAG 1.4.1 requires the dot AND its text label to stay — one
  // status-dot per card, with a PUBLIC whitelisted status class only.
  const { html } = await renderRoute("/directory");
  const recordsSection = html.slice(html.indexOf('id="records"'));
  const recordCards = (recordsSection.match(/class="record-list-card"/g) ?? []).length;
  const dots = recordsSection.match(/class="status-dot ([a-z-]+)"/g) ?? [];
  assert.equal(dots.length, recordCards, `one status dot per card (cards=${recordCards}, dots=${dots.length})`);
  for (const dot of dots) {
    assert.match(dot, /status-dot (verified|demo)/, "only whitelisted public statuses may render on the directory");
  }
});

test("the status accent is a visible card container + token rail (static guard on globals.css)", async () => {
  // t_d089a17e (CEO feedback 2026-08-03): the /directory rows must read as
  // cards (bg + border + radius) with a 3px status rail built from the
  // --status-* tokens + a precomputed tenue tint; the /mappa sidebar rows
  // follow the same logic. Colour is paired with the dot+label (asserted
  // above), so the CSS never relies on colour alone. No global token
  // changes (the rail references the existing --status-* tokens).
  // t_d52fde50 (CEO feedback 2): the 9%-over-#fffef9 tints were ~1:1 vs
  // --paper (#f5f3ec), so cards still read as transparent — surfaces are
  // now white (--white) with a scoped darker border (--card-border =
  // #b9c7bf) + soft shadow, and the tints are 14% over white (see contrast
  // table in the PR). t_be89b99c: hex literals tokenized (same sRGB values).
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(
    css,
    /\.directory-tool \.record-list \.record-list-card \{[^}]*border:1px solid var\(--card-border\)[^}]*border-left-width:3px[^}]*border-radius:var\(--radius-lg\)[^}]*background:var\(--white\)/,
    "the /directory row is a visible card container (white bg, darker border, radius, 3px left rail)",
  );
  assert.match(
    css,
    /\.records-section \.record-list \.record-list-card:has\(\.status-dot\.verified\) \{[^}]*border-left-color:var\(--status-verified\)[^}]*background:var\(--status-verified-card-bg\)/,
    "the verified rail uses the existing token + a 14% precomputed tint over white (--status-verified-card-bg)",
  );
  assert.match(
    css,
    /\.map-record \{[^}]*border:1px solid var\(--line\)[^}]*border-left-width:3px[^}]*border-radius:var\(--radius-md\)[^}]*background:var\(--white\)/,
    "the /mappa sidebar rows get the same visible-container treatment",
  );
  assert.match(
    css,
    /\.map-record:has\(\.status-dot\.verified\) \{[^}]*border-left-color:var\(--status-verified\)[^}]*background:var\(--status-verified-bg\)/,
    "the map row rail uses the same token logic (8% tint over white)",
  );
  // t_be89b99c: the global status tokens keep their exact values, now as
  // rgb() literals (--status-verified:#42a979 == rgb(66 169 121)).
  assert.match(css, /--status-verified:rgb\(66 169 121\)/, "the global status tokens are untouched (no ADR needed)");
});

test("the 'Show on map' action navigates to /mappa with the record preselected (URL focus path)", async () => {
  // F2 home hub: showRecordOnMap moved to /directory (DirectoryTool). The
  // keyboard path for the map-selection task is a router push to /mappa
  // carrying the ACTIVE filters plus ?focus=ID (F4, useCameraFilters:
  // mapHrefWithFocus) — the URL carries the selection AND the filter context
  // (shareable, deep-link; the F4 URL contract asserts the exact href). No
  // client-side scroll/focus choreography on the directory anymore; the
  // focus contract belongs to the URL (D3).
  const source = await readFile(path.join(root, "app", "components", "tools", "DirectoryTool.tsx"), "utf8");
  assert.match(source, /router\.push\(mapHrefWithFocus\(filters, id\)\)/, "the keyboard path must push /mappa with the active filters and ?focus=ID");
});

test("no positive tabindex anywhere on the homepage (standard tab order preserved)", async () => {
  const { html } = await renderRoute("/");
  const tabindexes = [...html.matchAll(/tabindex="([^"]+)"/g)].map((m) => m[1]);
  // The home hub has no interactive map and no focus-choreography element:
  // NO tabindex at all is allowed (the map-region tabindex="-1" lives on
  // /mappa now, asserted in the map test above).
  assert.deepEqual(tabindexes, [], `the home hub must not carry any tabindex, found ${tabindexes.join(", ")}`);
});

test("the skip link is the first focusable element on the page (before the nav shell)", async () => {
  const { html } = await renderRoute("/");
  const skipPos = html.indexOf("skip-link");
  const navPos = html.indexOf("nav-shell");
  assert.ok(skipPos >= 0 && navPos >= 0, "skip link and nav must render");
  assert.ok(skipPos < navPos, "the skip link must precede the navigation in the tab order");
  assert.match(html, /<a class="skip-link" href="#main-content">/);
});

test("manual coordinates (keyboard path for map location picking) have labelled, described inputs", async () => {
  // F2 home hub: the report form moved to /segnala (the keyboard path for
  // map location picking lives with the form). P1-2 (Vera design): the form
  // is gated by WriteGateWall (verified contributor required by the write
  // gate), so the labelled inputs are asserted client-side with a verified
  // session — the anonymous SSR shell renders the login wall instead.
  const rtl = await setupDom();
  const SegnalaTool = (await loadDomModule("app/components/tools/SegnalaTool.mjs")).SegnalaTool;
  installFetchMock((input) => {
    if (String(input) === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1,
          email: "contributor@example.test",
          displayName: "Fixture Contributor",
          emailVerifiedAt: "2026-01-15T10:00:00.000Z",
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
      });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  const { container } = await renderWithLocale(React.createElement(SegnalaTool));
  await rtl.waitFor(() => {
    const latitude = container.querySelector("#manual-latitude");
    const longitude = container.querySelector("#manual-longitude");
    const help = container.querySelector("#manual-coordinates-help");
    assert.ok(latitude && longitude && help, "the manual coordinate fields must render for a verified contributor");
    assert.match(latitude?.getAttribute("aria-describedby") ?? "", /manual-coordinates-help/);
    assert.match(longitude?.getAttribute("aria-describedby") ?? "", /manual-coordinates-help/);
  });
});

test("directory exposes one labelled search form for records and places", async () => {
  const { html } = await renderRoute("/directory");
  assert.match(html, /<form(?=[^>]*class="record-search")(?=[^>]*role="search")/);
  assert.match(html, /<label for="record-search">[\s\S]*?<\/label>/);
  assert.match(html, /<input id="record-search"[^>]*type="search"/);
  assert.doesNotMatch(html, /id="place-search"/);
});

// ---------------------------------------------------------------------------
// 2. ModerationDashboard
// ---------------------------------------------------------------------------

test("the moderation shell (credentials) renders the labelled nav, h1 and a polite loading region", async () => {
  const { response, html } = await renderRoute("/moderation", MODERATION_CREDENTIALS);
  assert.equal(response.status, 200);
  assert.match(html, /<nav class="nav-shell" aria-label="Moderation navigation">/);
  assert.match(html, /<h1 id="moderation-title">Moderation queue<\/h1>/);
  assert.match(html, /<p class="loading-note" aria-live="polite">/, "queue loading must be announced");
});

test("the moderation dashboard uses no tabIndex at all (no involuntary focus trap)", async () => {
  // The monolith was split into components/moderation/* (kanban t_c7460073);
  // the no-tabIndex contract holds across the dashboard and every extracted
  // component, so aggregate the sources before asserting.
  const source = await readModerationSource();
  assert.doesNotMatch(source, /tabIndex/, "no element may be added to or removed from the tab order");
  // Rendered shell: same guarantee.
  const { html } = await renderRoute("/moderation", MODERATION_CREDENTIALS);
  assert.doesNotMatch(html, /tabindex=/);
});

test("moderation decision controls are labelled and described (label-for, aria-describedby)", async () => {
  const component = await readFile(path.join(root, "app", "components", "moderation", "DecisionForm.tsx"), "utf8");
  // Reason select + moderator note textarea: label-for pairs with stable ids.
  // (The select carries onChange arrow functions, so its props contain `>` —
  // match the id first, then the `required` flag on the same line.)
  assert.match(component, /<label htmlFor=\{reasonId\}>/, "reason select must have a label-for");
  assert.match(component, /<select id=\{reasonId\}/, "reason select must carry its stable id");
  assert.match(component, /<select id=\{reasonId\}[\s\S]*?required/, "reason select must be required");
  assert.match(component, /<label htmlFor=\{noteId\}>/, "note textarea must have a label-for");
  assert.match(component, /<textarea id=\{noteId\}[\s\S]*?aria-describedby=\{`\$\{noteId\}-help`\}/, "note must be described by its help text");
  // Actor selector (rendered in the SSR shell already).
  const { html } = await renderRoute("/moderation", MODERATION_CREDENTIALS);
  assert.match(html, /<label for="actor-select">[\s\S]*?<select id="actor-select"[\s\S]*?required/);
});

test("moderation action groups are labelled and queues are labelled lists", async () => {
  const form = await readFile(path.join(root, "app", "components", "moderation", "DecisionForm.tsx"), "utf8");
  assert.match(
    form,
    /record-list-actions" aria-label=\{`\$\{t\.decisionFor\} \$\{entity\} \$\{id}`\}/,
    "every action group must carry an aria-label",
  );
  // The six labelled list shells live in the generic QueueSection (listLabel
  // prop) and the dashboard passes each section's label explicitly.
  const section = await readFile(path.join(root, "app", "components", "moderation", "QueueSection.tsx"), "utf8");
  assert.match(
    section,
    /<ul className="moderation-list" aria-label=\{listLabel\}>/,
    "queue list shell must be labelled via listLabel",
  );
  const dashboard = await readFile(path.join(root, "app", "components", "ModerationDashboard.tsx"), "utf8");
  for (const listLabel of ["t.pendingReports", "t.publishedRecords", "t.recordsNeedReview", "t.privateCorrections", "t.editRequests"]) {
    assert.ok(
      dashboard.includes(`listLabel={${listLabel}}`),
      `queue section must pass its label: ${listLabel}`,
    );
  }
  const history = await readFile(path.join(root, "app", "components", "moderation", "HistorySection.tsx"), "utf8");
  assert.match(history, /aria-label=\{t\.recentDecisions\}/, "history list must be labelled");
});

test("moderation status/error feedback uses live regions", async () => {
  const dashboard = await readFile(path.join(root, "app", "components", "ModerationDashboard.tsx"), "utf8");
  assert.match(dashboard, /role="status"/, "success notices must be announced (polite)");
  assert.match(dashboard, /role="alert"/, "errors must be announced (assertive)");
});

// ---------------------------------------------------------------------------
// 3. Auth/account forms
// ---------------------------------------------------------------------------

/** Every control in a rendered form must have an accessible name: either a
 *  label-for/id pair, or a wrapping <label> with text content. */
function assertControlsLabeled(html, where) {
  const controls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)];
  assert.ok(controls.length >= 1, `${where} must contain form controls`);
  for (const match of controls) {
    const tag = match[0];
    const forAttr = /for="([^"]+)"/.exec(tag);
    if (forAttr) {
      // Explicit label-for: the matching id must exist and its label must
      // have visible text.
      assert.ok(html.includes(`id="${forAttr[1]}"`) || html.includes(`id=${forAttr[1]}`), `${where}: ${tag} has no element with id ${forAttr[1]}`);
      const labelMatch = html.match(new RegExp(`<label[^>]*for="${forAttr[1]}"[^>]*>([\\s\\S]*?)</label>`));
      assert.ok(labelMatch, `${where}: no label[for="${forAttr[1]}"]`);
      assert.match(labelMatch[1], /[A-Za-z]/, `${where}: label[for="${forAttr[1]}"] must have text`);
    } else {
      // Implicit association: the control must be wrapped by a <label> that
      // opened after the previous </label> and has text content.
      const before = html.slice(0, match.index);
      const lastOpen = before.lastIndexOf("<label");
      const lastClose = before.lastIndexOf("</label>");
      assert.ok(lastOpen > lastClose, `${where}: control ${tag.slice(0, 60)}… must be wrapped by a <label>`);
      const closeAt = html.indexOf("</label>", lastOpen);
      const content = html.slice(lastOpen, closeAt);
      assert.match(content, /[A-Za-z]/, `${where}: the wrapping label must have text content`);
    }
  }
}

test("every login form control has an accessible name (wrapping label)", async () => {
  const { html } = await renderRoute("/login");
  const form = html.match(/<form class="auth-form"[\s\S]*?<\/form>/);
  assert.ok(form, "login form must render");
  assertControlsLabeled(form[0], "login");
});

test("every register form control has an accessible name (wrapping label)", async () => {
  const { html } = await renderRoute("/register");
  const form = html.match(/<form class="auth-form"[\s\S]*?<\/form>/);
  assert.ok(form, "register form must render");
  assertControlsLabeled(form[0], "register");
});

test("register page: OIDC buttons are fail-closed in SSR (server-gated on configured providers)", async () => {
  const { html } = await renderRoute("/register");
  // Design review 2026-08-08 (F1): the social buttons render ONLY after
  // the client fetches GET /api/auth/oidc/providers and receives a
  // non-empty list (credentials configured on this deployment). Server
  // HTML must NOT contain the buttons — an unconfigured provider 503s
  // mid-flow, so the SSR output never promises a sign-in method the
  // deployment cannot honour. The interactive panel behaviour is covered
  // in client-auth-methods.test.mjs (loginFormWithSocial).
  assert.doesNotMatch(html, /class="oidc-panel"/, "SSR must not render the oidc-panel before provider discovery");
  assert.doesNotMatch(html, /Continue with GitHub/, "SSR must not render the GitHub button");
  assert.doesNotMatch(html, /Continue with Google/, "SSR must not render the Google button");
});

test("auth errors are announced through a live region (role=alert)", async () => {
  const [login, register, account] = await Promise.all([
    readFile(path.join(root, "app", "login", "LoginPageBody.tsx"), "utf8"),
    readFile(path.join(root, "app", "register", "RegisterPageBody.tsx"), "utf8"),
    readFile(path.join(root, "app", "account", "AccountPageBody.tsx"), "utf8"),
  ]);
  // role="alert" is an implicit assertive live region: the message is read
  // out as soon as it renders after a failed submit.
  assert.match(login, /role="alert"/, "login must announce errors");
  assert.match(register, /role="alert"/, "register must announce errors");
  assert.match(account, /role="alert"/, "account must announce errors");
});

test("account actions are native buttons; tabIndex only as programmatic focus targets, never on buttons", async () => {
  const [account, confirmDialog] = await Promise.all([
    readFile(path.join(root, "app", "account", "AccountPageBody.tsx"), "utf8"),
    readFile(path.join(root, "app", "components", "ConfirmDialog.tsx"), "utf8"),
  ]);
  assert.match(account, /type="button"/, "logout/delete must be native buttons");
  // No tabIndex on buttons (no keyboard-trap manipulation); the only
  // allowed tabIndex is -1 on messages that receive programmatic focus for
  // announcement (C6 focus management — role=alert/status error focus).
  assert.doesNotMatch(account, /<button[^>]*tabIndex/, "buttons must never carry tabIndex");
  assert.doesNotMatch(account, /tabIndex=\{[1-9]/, "only -1 programmatic focus targets are allowed");
  assert.match(account, /role="alert"/, "account errors are announced");
  // The destructive erasure confirm lives in the shared ConfirmDialog
  // component (replaces window.confirm — C6 deliverable 4): the page must
  // render it and the component must expose an accessible alertdialog.
  assert.match(account, /<ConfirmDialog/, "account must render the accessible confirm dialog");
  assert.match(confirmDialog, /role="alertdialog"/, "destructive erasure confirm is an accessible alertdialog");
  assert.match(confirmDialog, /aria-modal/, "the alertdialog must be modal");
  assert.match(confirmDialog, /aria-labelledby/, "the alertdialog must be labelled");
});

test("the verification toggle is a native button with aria-pressed, a live region and no tabIndex (C5/C9)", async () => {
  const toggle = await readFile(path.join(root, "app", "components", "StarConfirmButton.tsx"), "utf8");
  // Native button, no focus-order manipulation.
  assert.match(toggle, /<button\s+type="button"/, "the toggle must be a native button");
  assert.doesNotMatch(toggle, /tabIndex/);
  // aria-pressed mirrors the personal state.
  assert.match(toggle, /aria-pressed=\{confirmed\}/, "aria-pressed must mirror the confirmed state");
  // Polite live region on the counter.
  assert.match(toggle, /aria-live="polite"/, "the count must be a polite live region");
  // Busy flag while a toggle is in flight (double-submit guard).
  assert.match(toggle, /aria-busy=\{busy\}/, "the toggle must expose aria-busy while pending");
  // Disabled is driven by the gate state, never by a click handler hack.
  assert.match(toggle, /disabled=\{disabled \|\| busy\}/, "the toggle must disable on gate/busy");
  // The star is decorative.
  assert.match(toggle, /aria-hidden="true"/, "the SVG star must be decorative");
  // Accessible name is localized (flips between the two frozen strings).
  assert.match(toggle, /const label = confirmed \? t\.removeVerification : t\.confirmExists/, "the accessible name must flip with the state");
});

test("the verification toggle target is at least 44x44px (WCAG 2.5.8) and interaction is quiet (C9)", async () => {
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(css, /\.confirm-button\s*\{[^}]*min-width:44px/, "the toggle must have a 44px min width");
  assert.match(css, /\.confirm-button\s*\{[^}]*min-height:44px/, "the toggle must have a 44px min height");
  // No count-up / toast / burst / sound animations in the widget CSS.
  assert.doesNotMatch(css, /\.confirm-button\s*\{[^}]*animation/i, "the toggle must not animate (C9: no count-up/burst)");
});

test("the trust-level badge is never colour-only: label + dot, progress is a text line (C1)", async () => {
  const badge = await readFile(path.join(root, "app", "components", "LevelBadge.tsx"), "utf8");
  // Badge text (the frozen label) is always rendered — never colour alone.
  assert.match(badge, /badgeLabels\[badgeKey\]/, "the badge must render the localized label text");
  // The dot is decorative (aria-hidden), the label is the accessible name.
  assert.match(badge, /aria-hidden="true"/, "the status dot must be decorative");
  // Progress is a TEXT line, never a bar.
  assert.match(badge, /progressToNextLevel/, "the progress line must be textual");
  assert.doesNotMatch(badge, /<div[^>]*role="progressbar"/, "no progress bar may be rendered");
  // Mapping comes from the frozen trust-levels module, not a local guess.
  assert.match(badge, /badgeKeyForLevel/, "the badge key must come from trust-levels.ts");
});

test("profile contributions: local filters use aria-pressed, the counter is role=status, pagination carries aria-current (C5)", async () => {
  const account = await readFile(path.join(root, "app", "account", "AccountPageBody.tsx"), "utf8");
  // Local status filters (never in the URL — private page).
  assert.match(account, /aria-pressed=\{filter === key\}/, "filter chips must expose aria-pressed");
  assert.match(account, /role="group"\s+aria-label=\{community\.contributionStatusFilter\}/, "the filter group must be labelled");
  // Polite total counter.
  assert.match(account, /role="status"/, "the contribution total must be announced politely");
  // Pagination marks the current page.
  assert.match(account, /aria-current="page"/, "the current page indicator must carry aria-current");
  // Owner-only edit links: the href points at the dedicated edit route.
  assert.match(account, /href=\{`\/records\/\$\{contribution\.id\}\/edit`\}/, "the edit link must target /records/[id]/edit");
  assert.match(account, /isEditable\(contribution\)/, "the edit link must be gated by editability");
});

test("aria-invalid marks the failing auth field on submit and clears as the user types (QA-2026-08-01-2 closed)", async () => {
  // The audit finding is CLOSED (F-QA t_7b716c97): login/register now wire
  // aria-invalid to the per-field client validation, so assistive
  // technology knows exactly which field failed. This test pins the new
  // behaviour at interaction level (SSR never renders the attribute — it
  // only appears after a failed submit).
  const rtl = await setupDom();
  const user = rtl.userEvent.setup();
  let loginFetchCalled = false;
  installFetchMock((input) => {
    // The header (PublicNav -> AuthNavLinks, t_96f0d374) legitimately calls
    // GET /api/auth/me on mount — only the form's own POST must never fire
    // on client-side validation errors.
    if (String(input) === "/api/auth/login") loginFetchCalled = true;
    return jsonResponse({ error: "invalid credentials" }, { status: 401 });
  });

  // QA#6 F2/F5 (t_9467ee7f): /login is a thin server shell; the interactive
  // body is the named-export client component LoginPageBody.
  const LoginPage = (await loadDomModule("app/login/LoginPageBody.mjs")).LoginPageBody;
  rtl.render(await wrapWithLocale(React.createElement(LoginPage)));
  const emailInput = rtl.screen.getByLabelText("Email");
  const passwordInput = rtl.screen.getByLabelText(/^Password/);
  assert.equal(emailInput.getAttribute("aria-invalid"), null, "SSR/initial render must not mark fields invalid");
  assert.equal(passwordInput.getAttribute("aria-invalid"), null);

  // Empty submit: both fields are marked, no request is fired.
  await user.click(rtl.screen.getByRole("button", { name: /log in/i }));
  assert.equal(emailInput.getAttribute("aria-invalid"), "true", "empty email must be invalid");
  assert.equal(passwordInput.getAttribute("aria-invalid"), "true", "short password must be invalid");
  assert.equal(loginFetchCalled, false, "client-side field errors must not fire the network request");

  // Fixing the email clears only its own flag; the password stays invalid.
  await user.type(emailInput, "contributor@example.test");
  assert.equal(emailInput.getAttribute("aria-invalid"), null, "fixing the email must clear its flag");
  assert.equal(passwordInput.getAttribute("aria-invalid"), "true", "the still-short password keeps its flag");

  rtl.cleanup();

  // Register mirrors the contract, including the optional displayName
  // (only marked when present but below the 2-char minimum).
  // QA#6 F2/F5 (t_9467ee7f): /register is a thin server shell; the
  // interactive body is the named-export client component RegisterPageBody.
  const RegisterPage = (await loadDomModule("app/register/RegisterPageBody.mjs")).RegisterPageBody;
  rtl.render(await wrapWithLocale(React.createElement(RegisterPage)));
  const regEmail = rtl.screen.getByLabelText("Email");
  const regName = rtl.screen.getByLabelText(/display name|nickname/i);
  const regPassword = rtl.screen.getByLabelText(/^Password/);
  await user.type(regName, "x");
  await user.click(rtl.screen.getByRole("button", { name: /create|register/i }));
  assert.equal(regEmail.getAttribute("aria-invalid"), "true");
  assert.equal(regName.getAttribute("aria-invalid"), "true", "a 1-char display name must be invalid");
  assert.equal(regPassword.getAttribute("aria-invalid"), "true");
  rtl.cleanup();
});

// ---------------------------------------------------------------------------
// 4. Locale toggle
// ---------------------------------------------------------------------------

test("the SSR root declares lang and the toggle exposes aria-label + aria-pressed", async () => {
  for (const route of ["/", "/login", "/register"]) {
    const { html } = await renderRoute(route);
    assert.match(html, /<html[^>]*lang="en"/, `${route} must declare a lang attribute`);
    assert.match(
      html,
      /<div class="locale-toggle" aria-label="Language selection"><button[^>]*aria-pressed="true">EN<\/button><button[^>]*aria-pressed="false">IT<\/button><\/div>/,
      `${route} must render the toggle with aria-pressed states`,
    );
  }
});

test("switching locale updates document.documentElement.lang (screen-reader readable)", async () => {
  const provider = await readFile(path.join(root, "app", "components", "LocaleProvider.tsx"), "utf8");
  assert.match(
    provider,
    /document\.documentElement\.lang = locale/,
    "the provider must keep the root lang in sync with the selected locale",
  );
  assert.match(provider, /useEffect\(\(\) => \{\s*document\.documentElement\.lang = locale;\s*\}, \[locale\]\)/, "the sync must run on every locale change");
  // The toggle buttons are GENERATED from the locale registry (kanban
  // t_6424f961): one button per SUPPORTED_LOCALES entry, each reflecting
  // its pressed state via `locale === code`. The SSR regex above pins the
  // rendered EN/IT output; this pins the data-driven source.
  assert.match(provider, /aria-pressed=\{locale === code\}/, "each generated toggle button must reflect its pressed state");
  assert.match(provider, /locales\.map\(/, "the toggle buttons must be generated from the locale registry (not a hardcoded EN/IT pair)");
  assert.match(provider, /SUPPORTED_LOCALES/, "the toggle must default to the registered locales");
});

// ---------------------------------------------------------------------------
// 5. Footer / nav
// ---------------------------------------------------------------------------

test("every footer link has visible text and the landmarks are labelled", async () => {
  for (const route of ["/", "/guide", "/login"]) {
    const { html } = await renderRoute(route);
    assert.match(html, /<footer class="site-footer" aria-label="Site footer">/, `${route} must have the contentinfo landmark`);
    assert.match(html, /<nav class="footer-links" aria-label="Site navigation">/, `${route} must have the labelled footer nav`);
    const footer = html.slice(html.indexOf("site-footer"));
    const links = [...footer.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.ok(links.length >= 8, `${route} footer must expose every institutional link`);
    for (const [, href, text] of links) {
      assert.match(text, /[A-Za-z]/, `${route}: footer link ${href} must have visible text`);
    }
  }
});

test("every <img> in the public HTML carries alt text", async () => {
  for (const route of ["/", "/login", "/register", "/guide"]) {
    const { html } = await renderRoute(route);
    const images = [...html.matchAll(/<img\b[^>]*>/g)];
    for (const image of images) {
      assert.match(image[0], /\salt=/, `${route}: ${image[0].slice(0, 80)}… must have alt text`);
    }
  }
});

test("the footer legal disclosure has a visible keyboard focus and touch-sized target", async () => {
  const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
  assert.match(
    css,
    /\.site-footer \.footer-policy-group summary \{[^}]*min-height:44px/,
    "the legal disclosure summary needs a 44px minimum touch target",
  );
  assert.match(
    css,
    /\.site-footer \.footer-policy-group summary:focus-visible \{[^}]*outline:3px solid var\(--focus\)/,
    "the legal disclosure summary needs a visible keyboard focus ring",
  );
});

test("aria-current marks the active page in the footer and the header brand (QA-2026-08-01-3 closed)", async () => {
  // The audit finding is CLOSED (F-QA t_7b716c97): the footer marks its own
  // link with aria-current="page" on every route in its link set (13 links,
  // exactly one current per route) and the header brand marks the home. The
  // ToolLayout per-page nav NEVER self-links (hand-off pattern,
  // FRONTEND_DESIGN §2.5), so the current page is exposed by the footer and
  // by each page's h1 — pinned by the client test below.
  const FOOTER_LINKS = ["/mappa", "/directory", "/segnala", "/correggi", "/manifesto", "/regole", "/guide", "/privacy", "/termini", "/licenze", "/accessibility", "/faq", "/contatti"];
  for (const route of FOOTER_LINKS) {
    const { html } = await renderRoute(route);
    const footer = html.slice(html.indexOf("footer-links"));
    const linkTag = footer.match(new RegExp(`<a[^>]*href="${route}"[^>]*>`));
    assert.ok(linkTag, `${route}: the footer must link to itself`);
    assert.match(linkTag[0], /aria-current="page"/, `${route}: the footer's own link must be marked current`);
    const current = (footer.match(/aria-current="page"/g) ?? []).length;
    assert.equal(current, 1, `${route}: exactly one footer link must be current (found ${current})`);
  }
  // Pages outside the footer link set (auth, record, private moderation) mark
  // NO footer link as current — none of them is in the footer navigation.
  for (const route of ["/login", "/register", "/account", "/records/1", "/moderation"]) {
    const { html } = await renderRoute(route);
    const footer = html.slice(html.indexOf("footer-links"));
    assert.equal((footer.match(/aria-current="page"/g) ?? []).length, 0, `${route}: no footer link may be current`);
  }
  // The home marks the header brand (in-page anchor to #top) and the footer
  // brand as current; other pages (including the tool routes, whose header
  // brand is a next/link to /) leave the brand unmarked. Lookaheads keep the
  // assertions order-independent (React/Next may emit href before class).
  const home = await renderRoute("/");
  assert.match(home.html, /<a(?=[^>]*class="brand")(?=[^>]*href="#top")(?=[^>]*aria-current="page")[^>]*>/, "home header brand must be current");
  assert.match(home.html, /<footer class="site-footer"[\s\S]*?<a(?=[^>]*class="brand")(?=[^>]*href="\/")(?=[^>]*aria-current="page")[^>]*>/, "home footer brand must be current");
  for (const route of ["/guide", "/login", "/mappa"]) {
    const { html } = await renderRoute(route);
    assert.doesNotMatch(html, /<a[^>]*class="brand"[^>]*aria-current="page"/, `${route}: brand must not be marked current`);
  }
});

test("tool nav: the shared public nav marks the current page with aria-current (t_a72a3106)", async () => {
  // The shared public nav (PublicNavLinks, t_a72a3106) replaced the old
  // per-page sets (F3 t_2ca69725, FRONTEND_DESIGN §2.5 hand-off pattern).
  // Every tool page now renders the same three primary links and marks the
  // current route with aria-current="page" (active state, CEO check
  // 2026-08-02) — in addition to the footer marking (asserted in the test
  // above). This test pins the new contract so a future change cannot drop
  // the header active state or reintroduce the inconsistent 4-link sets.
  const rtl = await setupDom();
  await setNavState({ pathname: "/mappa" });
  const mod = await loadDomModule("app/components/ToolLayout.mjs");
  const ToolLayout = mod.ToolLayout;
  const { container, rerender } = await renderWithLocale(React.createElement(ToolLayout, null, React.createElement("div", null, "body")));

  const links = () => [...container.querySelectorAll(".nav-links a")];
  const currentHrefs = () => links().filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.getAttribute("href"));
  assert.equal(links().length, 3, "the shared public nav must render the three primary links");
  assert.deepEqual(currentHrefs(), ["/mappa"], "the current page /mappa must be marked aria-current in the header nav");

  // Same contract on /directory: the header marks the current page.
  // NOTE: testing-library's rerender() replaces the tree with the BARE
  // element — it would drop the LocaleProvider wrapper and crash with
  // "useLocale must be used within LocaleProvider". Re-wrap explicitly.
  await setNavState({ pathname: "/directory" });
  rerender(await wrapWithLocale(React.createElement(ToolLayout, null, React.createElement("div", null, "body"))));
  assert.deepEqual(
    currentHrefs(),
    ["/directory"],
    "the current page /directory must be marked aria-current in the header nav",
  );
  rtl.cleanup();
});

// ---------------------------------------------------------------------------
// 6. Fixture hygiene (no personal data)
// ---------------------------------------------------------------------------

test("the QA fixtures never leak into public HTML (fictional data only)", async () => {
  // The moderation credentials and the demo identities are fictional
  // fixtures; none of them may appear on any public page.
  const forbidden = [
    "s3cret",                 // local-only moderator password
    "Basic ",                 // authorization header must never be rendered
    "record@osdb.test",       // test moderator identity
    "Demo Record Reviewer",   // internal reviewer display name
  ];
  for (const route of ["/", "/login", "/register", "/guide", "/records/1"]) {
    const { html } = await renderRoute(route);
    for (const marker of forbidden) {
      assert.doesNotMatch(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${route} must not contain ${marker}`);
    }
    assert.doesNotMatch(html, /<dd>[^<]*@[^<]*<\/dd>/, `${route} must not render an email address cell`);
  }
  // The moderation page itself must not echo the Basic auth header or the
  // plaintext password into its own HTML.
  const { html } = await renderRoute("/moderation", MODERATION_CREDENTIALS);
  assert.doesNotMatch(html, /s3cret/);
  assert.doesNotMatch(html, /Basic /);
});
