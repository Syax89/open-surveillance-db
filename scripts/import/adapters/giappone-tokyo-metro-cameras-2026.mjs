/**
 * Adapter Giappone — Tokyo Metropolitan Gov cameras (cron ricerca
 * 2026-08-09). Tre CSV ufficiali TMG:
 *   - river-monitoring-cameras.csv (UTF-8, 106 con lat/lon)
 *   - 130001_sea-camera.csv (Shift-JIS, 21)
 *   - position...Izu-Ogasawara...csv (Shift-JIS, 17, lat/lon combinato)
 * Licence: CC BY 4.0 (catalogo TMG).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "giappone-tokyo-metro-cameras-2026";

const SETS = [
  { key: "river", url: "https://www.opendata.metro.tokyo.lg.jp/kensetsu/R4/130001_river-monitoring-cameras.csv", enc: "utf8" },
  { key: "sea", url: "https://www.opendata.metro.tokyo.lg.jp/kouwan/130001_sea-camera.csv", enc: "sjis" },
  { key: "izu", url: "https://www.opendata.metro.tokyo.lg.jp/kouwan/position_information_of_port_live_cameras_at_Izu-Ogasawara_Islands.csv", enc: "sjis" },
];

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/giappone-tokyo-metro-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  for (const s of SETS) {
    const res = await fetchWithRetry(s.url);
    const buf = Buffer.from(await res.arrayBuffer());
    let text;
    if (s.enc === "sjis") {
      text = new TextDecoder("shift_jis").decode(buf);
    } else {
      text = buf.toString("utf8");
    }
    all.push({ __set: s.key, text });
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse the three TMG CSVs into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  const parseCsv = (text) => {
    // CSV semplice (no virgolette complesse): split per riga e virgola,
    // gestendo i quoted field con virgola interna (Izu usa "lat,lon").
    const rows = [];
    let cur = [];
    let field = "";
    let inQ = false;
    for (const ch of text.replace(/\r\n/g, "\n")) {
      if (inQ) {
        if (ch === '"') inQ = false;
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else field += ch;
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  };

  for (const src of data) {
    const rows = parseCsv(src.text);
    if (rows.length < 2) { recordSkip(`${src.__set}: no rows`); continue; }
    const header = rows[0].map((h) => h.trim());
    const idx = {};
    header.forEach((h, i) => { idx[h] = i; });

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = (names) => { for (const n of names) { const j = idx[n]; if (j !== undefined && r[j]?.trim()) return r[j].trim(); } return ""; };

      let lat = NaN, lon = NaN;
      if (src.__set === "izu") {
        const ll = get(["緯度経度", "緯度,経度"]);
        const parts = ll.split(",");
        if (parts.length === 2) { lat = Number.parseFloat(parts[0]); lon = Number.parseFloat(parts[1]); }
      } else {
        lat = Number.parseFloat(get(["緯度", "Latitude", "latitude"]));
        lon = Number.parseFloat(get(["経度", "Longitude", "longitude"]));
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
        recordSkip("non-finite/out-of-range/zero coordinates");
        continue;
      }

      const num = get(["番号", "項番", "No"]);
      const name = cleanText(get(["観測所名（映像監視局）", "名称", "設置場所", "河川名"]), 120);
      const place = cleanText(get(["設置場所", "観測所名（映像監視局）"]), 120);
      const river = cleanText(get(["河川名"]), 60);

      const bits = [];
      if (river) bits.push(river);
      if (place) bits.push(place);
      const notes = bits.length ? bits.slice(0, 2).join(" · ").slice(0, 200) : null;

      staged.push({
        title: name || `TMG ${src.__set} cam ${num || i}`.trim(),
        kind: "Other / unknown",
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
        direction: null,
        address: place || null,
        notes,
        description: null,
        external_id: `tmg-cam:${src.__set}:${num || i}`,
      });
    }
  }

  return { staged, skipped, checksum: null };
}
