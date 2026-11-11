// The site's hand-written CSS in CASCADE ORDER (perf 2026-11).
//
// app/globals.css is the global stylesheet on every route; Leaflet and the
// map-only rules moved to app/styles/map.css, a separate stylesheet that the
// map routes link AFTER the global one (app/components/MapStyles.tsx). Static
// CSS contracts that assert map rules — or the order between a map rule and a
// global one — read both files concatenated in that order, which is exactly
// the cascade the browser sees on a map route.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const GLOBAL_CSS = path.join("app", "globals.css");
export const MAP_CSS = path.join("app", "styles", "map.css");

export async function readSiteCss(root) {
  const [globals, map] = await Promise.all([
    readFile(path.join(root, GLOBAL_CSS), "utf8"),
    readFile(path.join(root, MAP_CSS), "utf8"),
  ]);
  return `${globals}\n${map}`;
}
