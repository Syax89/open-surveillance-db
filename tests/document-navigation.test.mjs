// Site-wide page transitions (owner 2026-11): every internal link click is
// a normal document navigation — the router's onClick never runs, so the
// browser loads the next page and the global @view-transition crossfades it.
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { setupDom, loadDomModule, renderWithLocale, React } from "./helpers/dom-harness.mjs";

let rtl;
let DocumentNavigation;

before(async () => {
  rtl = await setupDom();
  DocumentNavigation = (await loadDomModule("app/components/DocumentNavigation.mjs")).DocumentNavigation;
});
afterEach(() => rtl?.cleanup());

async function renderLinks() {
  const routerClicks = [];
  const link = (href, extra = {}) => React.createElement("a", {
    href,
    ...extra,
    onClick: (event) => { routerClicks.push(href); event.preventDefault(); },
  }, href);
  await renderWithLocale(React.createElement(React.Fragment, null,
    React.createElement(DocumentNavigation),
    link("/faq"),
    link("https://example.org/elsewhere"),
    link("/api/cameras?format=csv"),
    link("#section"),
    link("/guide", { target: "_blank" }),
    link("/regole", { "data-client-nav": "" }),
  ));
  return routerClicks;
}

function click(href, init = {}) {
  const anchor = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === href);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  anchor.dispatchEvent(event);
  return event;
}

test("an internal link click skips the client router and lets the browser navigate", async () => {
  const routerClicks = await renderLinks();
  const event = click("/faq");
  assert.deepEqual(routerClicks, [], "the router onClick (next/link) never runs");
  assert.equal(event.defaultPrevented, false, "the default document navigation proceeds");
});

test("external, /api/ downloads, same-page anchors, new tabs and modified clicks keep their own handling", async () => {
  const routerClicks = await renderLinks();
  click("https://example.org/elsewhere");
  click("/api/cameras?format=csv");
  click("#section");
  click("/guide");
  click("/faq", { metaKey: true });
  assert.deepEqual(routerClicks, ["https://example.org/elsewhere", "/api/cameras?format=csv", "#section", "/guide", "/faq"]);
});

test("links marked data-client-nav are left to the framework router (opt-out)", async () => {
  const routerClicks = await renderLinks();
  const event = click("/regole");
  assert.deepEqual(routerClicks, ["/regole"], "the link's own onClick (router) runs");
  assert.equal(event.defaultPrevented, true, "the router handled the navigation itself");
});
