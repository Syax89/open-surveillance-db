/**
 * Popup action widget mount contract (kanban t_bb310428 — P0 map UX
 * regression: "Useful/Confirm appear late").
 *
 * The map marker popup carries a mount node (.osm-popup-community) and the
 * map's popupopen handler calls mountPopupActions. Leaflet re-fires
 * popupopen in some openPopup paths, and a marker rebuild used to destroy
 * and recreate the popup DOM — both made the widget's local state (counts,
 * disclosure, personal action) reset visibly. The mount is now IDEMPOTENT
 * for the same record + node:
 *
 *   1. mounting the same record into the same node twice does NOT remount
 *      the React root (the widget's state survives — no button reset);
 *   2. mounting a DIFFERENT record (or a different node) replaces the
 *      root once (popup transfer / selection change);
 *   3. unmountPopupActions tears the root down (popupclose — no leaked
 *      React tree inside a destroyed Leaflet popup).
 *
 * Fixtures are fictitious (illustrative records, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
} from "./helpers/dom-harness.mjs";

let popupActions;
let rtl;

before(async () => {
  rtl = await setupDom();
  popupActions = await loadDomModule("app/lib/popup-actions.mjs");
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(() => {
  popupActions.unmountPopupActions();
  rtl?.cleanup();
});

/** A mount node with a real DOM element the widget can render into. */
function mountNode() {
  const node = document.createElement("div");
  node.className = "osm-popup-community";
  document.body.appendChild(node);
  return node;
}

test("mounting the same record into the same node twice does NOT remount the root (no button reset)", async () => {
  const node = mountNode();
  await rtl.act(async () => {
    popupActions.mountPopupActions(node, 42, { like: 3, confirm: 1 });
  });

  // The widget rendered (compact action buttons).
  assert.ok(node.querySelector("[data-testid]") || node.textContent.length > 0, "the widget must render into the mount node");
  const snapshot = node.innerHTML;

  // Second popupopen for the SAME record + node: must be a no-op.
  await rtl.act(async () => {
    popupActions.mountPopupActions(node, 42, { like: 3, confirm: 1 });
  });
  assert.equal(node.innerHTML, snapshot, "the root must NOT be remounted — the DOM (and the widget state) stays untouched");

  node.remove();
});

test("mounting a different record replaces the root once (popup transfer)", async () => {
  const node = mountNode();
  await rtl.act(async () => {
    popupActions.mountPopupActions(node, 42, { like: 1 });
  });
  const first = node.innerHTML;
  assert.ok(first.length > 0);

  await rtl.act(async () => {
    popupActions.mountPopupActions(node, 43, { like: 2 });
  });
  const second = node.innerHTML;
  assert.notEqual(second, first, "a different record must re-render the widget with the new counts");

  node.remove();
});

test("mounting the same record into a DIFFERENT node replaces the root (new popup DOM after a rebuild)", async () => {
  const nodeA = mountNode();
  const nodeB = mountNode();
  await rtl.act(async () => {
    popupActions.mountPopupActions(nodeA, 42, { like: 1 });
  });
  const first = nodeA.innerHTML;
  assert.ok(first.length > 0);

  // A rebuild destroyed the old popup DOM and Leaflet fires popupopen on a
  // FRESH node for the same record: the old root must be unmounted and a
  // new one created (only the SAME node+record pair is idempotent).
  await rtl.act(async () => {
    popupActions.mountPopupActions(nodeB, 42, { like: 1 });
  });
  assert.ok(nodeB.innerHTML.length > 0, "the new node must be rendered");
  assert.equal(nodeA.innerHTML, "", "the old node's root must be unmounted (no leaked tree)");

  nodeA.remove();
  nodeB.remove();
});

test("unmountPopupActions tears down the root (popupclose — no leaked React tree)", async () => {
  const node = mountNode();
  await rtl.act(async () => {
    popupActions.mountPopupActions(node, 42, { like: 1 });
  });
  assert.ok(node.innerHTML.length > 0);

  await rtl.act(async () => {
    popupActions.unmountPopupActions();
  });
  assert.equal(node.innerHTML, "", "the React root must be unmounted from the destroyed popup node");

  node.remove();
});
