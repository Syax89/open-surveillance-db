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
  setupDom, loadDomModule, installFetchMock, jsonResponse, React,
} from "./helpers/dom-harness.mjs";

let popupActions;
let rtl;

before(async () => {
  rtl = await setupDom();
  popupActions = await loadDomModule("app/lib/popup-actions.mjs");
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(async () => {
  // unmountPopupActions defers the real unmount to a microtask
  // (t_0b9f5a3c): flush it INSIDE act() so the teardown does not emit
  // React's "update to Root not wrapped in act" warning after the test.
  await rtl.act(async () => {
    popupActions.unmountPopupActions();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

// ---------------------------------------------------------------------------
// BUG t_0b9f5a3c (post-deploy finding, run 1910): on /mappa MOBILE the
// console showed TWO reproducible React warnings when a marker popup opened:
//   1. "flushSync was called from inside a lifecycle method. React cannot
//      flush when React is already rendering."
//   2. "Attempted to synchronously unmount a root while React was already
//      rendering."
//
// Root cause: mountPopupActions used flushSync() and unmountPopupActions
// used root.unmount() SYNCHRONOUSLY inside Leaflet's popupopen/popupclose
// handlers. Leaflet fires those events synchronously, so when the popup is
// opened from inside a React effect (the selection effect calls
// marker.openPopup(); the rebuild restore/focus effects do too) the handler
// runs WHILE React is still rendering — flushSync/unmount are illegal there.
// A direct marker click is a DOM event OUTSIDE React's render (legal), which
// is why desktop verification passed and mobile (list-click → selection
// effect) reproduced it.
//
// Contract: mounting or unmounting the popup widget from inside a React
// effect must NOT emit either warning. React's own advice for this error is
// "Consider moving this call to a scheduler task or micro task" — the
// implementation defers the actual render/unmount to a microtask so the
// Leaflet event handler never calls flushSync/unmount while React renders.
// ---------------------------------------------------------------------------

/** Collect console.error during fn; return the messages (strings). */
async function captureConsoleErrors(fn) {
  const original = console.error;
  const messages = [];
  console.error = (...args) => messages.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return messages;
}

const REACT_LIFECYCLE_WARNINGS = [
  /flushSync was called from inside a lifecycle method/,
  /Attempted to synchronously unmount a root/,
];

test("mounting the widget from INSIDE a React effect emits ZERO React lifecycle warnings (t_0b9f5a3c)", async () => {
  const node = mountNode();
  const messages = await captureConsoleErrors(async () => {
    // Simulate the real mobile path: the selection effect (or the rebuild
    // restore/focus effect) calls marker.openPopup() → Leaflet fires
    // popupopen synchronously → mountPopupActions runs while React is
    // rendering. A useEffect that mounts the widget is the faithful harness.
    function EffectMountHarness() {
      React.useEffect(() => {
        popupActions.mountPopupActions(node, 42, { like: 3, confirm: 1 });
      }, []);
      return null;
    }
    await rtl.act(async () => {
      rtl.render(React.createElement(EffectMountHarness));
    });
    // The deferred microtask render must still land (flushSync in a
    // microtask, outside React's render) — the widget appears.
    await rtl.waitFor(() => assert.ok(node.querySelector(".community-action"), "the widget renders even when mounted from inside an effect"));
  });

  const lifecycle = messages.filter((m) => REACT_LIFECYCLE_WARNINGS.some((re) => re.test(m)));
  assert.deepEqual(lifecycle, [], "no flushSync/synchronous-unmount React warning when mounting from inside an effect");

  node.remove();
});

test("unmounting the widget from INSIDE a React effect emits ZERO React lifecycle warnings (t_0b9f5a3c)", async () => {
  const node = mountNode();
  // First mount the widget for real (popup open).
  await rtl.act(async () => {
    popupActions.mountPopupActions(node, 42, { like: 3, confirm: 1 });
  });
  assert.ok(node.querySelector(".community-action"), "sanity: the widget is mounted");

  const messages = await captureConsoleErrors(async () => {
    // Simulate the rebuild path: a marker rebuild (clearLayers/removeLayer)
    // inside an effect closes the open popup → Leaflet fires popupclose
    // synchronously → unmountPopupActions runs while React is rendering.
    function EffectUnmountHarness() {
      React.useEffect(() => {
        popupActions.unmountPopupActions();
      }, []);
      return null;
    }
    await rtl.act(async () => {
      rtl.render(React.createElement(EffectUnmountHarness));
    });
    await rtl.waitFor(() => assert.equal(node.innerHTML, "", "the deferred unmount still tears the root down"));
  });

  const lifecycle = messages.filter((m) => REACT_LIFECYCLE_WARNINGS.some((re) => re.test(m)));
  assert.deepEqual(lifecycle, [], "no flushSync/synchronous-unmount React warning when unmounting from inside an effect");

  node.remove();
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

// ---------------------------------------------------------------------------
// BUG t_5bc23d61 (CEO 2026-08-08): the "useful" vote on /mappa does not
// persist — the count reverts to the previous number.
//
// Root cause: the map's record payload (camera.usefulCount etc.) is a
// snapshot taken BEFORE the vote, and the popup widget is re-seeded from it
// on EVERY remount — the map rebuild path (setPopupContent on a kept
// marker) swaps the popup DOM for a FRESH .osm-popup-community node and
// calls mountPopupActions again with the STALE payload counts, and a
// popup close/reopen does the same. The widget's own (server-confirmed)
// state is destroyed with the old root.
//
// Contract: after a successful vote the server response is the ONLY
// authority. A later remount of the SAME record — with a stale payload —
// must NOT revert the visible count. The mount helper keeps the
// server-confirmed counts per record and seeds remounts from them.
// ---------------------------------------------------------------------------
test("a remount from a STALE payload after a successful vote must NOT revert the count (t_5bc23d61)", async () => {
  const nodeA = mountNode();
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Ada" });
    if (input === "/api/cameras/42/actions") {
      if (method === "GET") return jsonResponse({ action: null });
      if (method === "PUT") {
        return jsonResponse({ action: "like", counts: { like: 4, confirm: 1, gone: 0, problem: 0, privacy: 0 } });
      }
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  // The popup opens with the payload counts (like: 3).
  await rtl.act(async () => {
    popupActions.mountPopupActions(nodeA, 42, { like: 3, confirm: 1 });
  });
  const useful = nodeA.querySelector(".community-action");
  assert.ok(useful, "the Useful button renders in the compact toolbar");
  assert.match(nodeA.textContent, /3/, "the payload count is shown before the vote");

  // Signed-in vote: PUT succeeds, the widget mirrors the server counts (4).
  await rtl.act(async () => {
    useful.click();
  });
  await rtl.waitFor(() => assert.match(nodeA.textContent, /4/, "the vote updates the visible count to the server value"));

  // Map rebuild: setPopupContent swaps the popup DOM — a FRESH mount node,
  // same record, STALE payload counts (like: 3). The count must STAY 4.
  const nodeB = mountNode();
  await rtl.act(async () => {
    popupActions.mountPopupActions(nodeB, 42, { like: 3, confirm: 1 });
  });
  assert.match(nodeB.textContent, /4/, "the remount must seed from the server-confirmed count, not the stale payload");
  assert.doesNotMatch(nodeB.textContent, /3/, "the stale payload count must never come back");

  nodeA.remove();
  nodeB.remove();
});
