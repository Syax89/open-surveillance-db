// F6 qa#5 (t_ab0d4c75): regenerate public/og.png to 1200x630, <300KB.
// Strategy: cover-resize the original 1672x941 brand art to 1200x630, then
// quantize to a palette PNG (the art is flat dark-blue vector-style, so
// 128-256 colours with dithering keeps it crisp well under 300 KB).
import sharp from "sharp";
import { statSync, rmSync } from "node:fs";

const SRC = "public/og.png";
const OUT = "public/og.png";
const TARGET_BYTES = 300 * 1024;

async function attempt(colours) {
  const buf = await sharp(SRC)
    .resize(1200, 630, { fit: "cover", position: "centre" })
    .png({ palette: true, colours, dither: 1.0, quality: 100 })
    .toBuffer();
  return buf;
}

let buf = null;
// Start at 256 colours, step down until under the 300 KB target.
for (let colours = 256; colours >= 32; colours -= 32) {
  buf = await attempt(colours);
  console.log(`colours=${colours} -> ${buf.length} bytes`);
  if (buf.length <= TARGET_BYTES) break;
}
if (!buf || buf.length > TARGET_BYTES) {
  console.error("FAIL: could not reach <300KB with palette PNG");
  process.exit(1);
}

rmSync(SRC, { force: true });
await sharp(buf).toFile(OUT);
const m = await sharp(OUT).metadata();
const s = statSync(OUT);
console.log(`OK ${OUT}: ${m.width}x${m.height}, ${s.size} bytes (${(s.size / 1024).toFixed(1)} KiB)`);
if (s.size > TARGET_BYTES || m.width !== 1200 || m.height !== 630) {
  console.error("FAIL: dimension/size check");
  process.exit(1);
}
