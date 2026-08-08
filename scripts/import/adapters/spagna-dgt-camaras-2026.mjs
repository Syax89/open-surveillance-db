/**
 * Adapter DGT España — "Cámaras de tráfico red estatal (NAP)" (CEO
 * 2026-08-08, scan ES fonti ufficiali).
 *
 * Source: Dirección General de Tráfico, NAP (National Access Point)
 * DATEX2 v3.7 XML. 1942 telecamere di traffico con coordinate su tutte le
 * strade statali (escluse Paesi Baschi/Catalogna). Live.
 * Licence: CC-BY (Creative Commons Attribution, dichiarata sul portale
 * NAP — attribution-only, classe compatibile con la matrice).
 *
 * - Fetch: XML DATEX2 da nap.dgt.es (3.7MB).
 * - Mapping: <ns2:typeOfDevice>camera</ns2:typeOfDevice> + punto
 *   <loc:pointCoordinates><loc:latitude>/<loc:longitude>; roadName →
 *   title; roadDestination → notes.
 * - external_id = "dgt-camara:<device id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "spagna-dgt-camaras-2026";

const XML_URL = "https://nap.dgt.es/datex2/v3/dgt/DevicePublication/camaras_datex2_v37.xml";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/spagna-dgt-camaras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetch(XML_URL, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`DGT NAP fetch failed: ${res.status}`);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the DATEX2 XML into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  // Each device block: <ns2:device xsi:type="fse:ExtendedDevice" id="...">
  const devices = text.match(/<ns2:device[\s\S]*?<\/ns2:device>/g) ?? [];
  for (const dev of devices) {
    const type = /<ns2:typeOfDevice>([^<]+)<\/ns2:typeOfDevice>/.exec(dev)?.[1];
    if (type !== "camera") {
      recordSkip(`typeOfDevice=${type ?? "unknown"}`);
      continue;
    }

    const id = /<ns2:device[^>]*\bid="([^"]+)"/.exec(dev)?.[1];
    const latRaw = /<loc:latitude>([^<]+)<\/loc:latitude>/.exec(dev)?.[1];
    const lonRaw = /<loc:longitude>([^<]+)<\/loc:longitude>/.exec(dev)?.[1];
    const road = /<loc:roadName>([^<]+)<\/loc:roadName>/.exec(dev)?.[1];
    const dest = /<loc:roadDestination>([^<]+)<\/loc:roadDestination>/.exec(dev)?.[1];
    const url = /<fse:deviceUrl>([^<]+)<\/fse:deviceUrl>/.exec(dev)?.[1];

    const lat = Number.parseFloat(latRaw);
    const lon = Number.parseFloat(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const title = road ? `Cámara ${cleanText(road, 60)}` : "Cámara de tráfico (DGT)";
    let notes = null;
    const bits = [];
    if (dest) bits.push(`Direzione: ${cleanText(dest, 60)}`);
    if (url) bits.push(`Immagine: ${url}`);
    if (bits.length) notes = bits.join(" · ").slice(0, 200);

    staged.push({
      title,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `dgt-camara:${id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
