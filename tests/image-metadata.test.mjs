// Unit tests for the pure-JS image metadata pipeline (app/lib/image-metadata.ts):
// container sniffing, dimension parsing, EXIF/metadata stripping, and limits.
//
// Fixtures are synthetic byte arrays built in-test (no image files, no native
// decoders): the library walks container structure, so a hand-built JPEG/PNG/
// WebP with an EXIF segment is enough to prove both parsing and stripping.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadLibModule } from "./helpers/api-harness.mjs";

after(async () => cleanupRouteTree());

let lib;
beforeEach(async () => {
  lib = await loadLibModule("image-metadata");
});

// ---------------------------------------------------------------------------
// Fixture builders (synthetic containers)
// ---------------------------------------------------------------------------

function u8(...values) {
  return Uint8Array.from(values);
}

function be16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function be32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function le32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function concat(...arrays) {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

function asciiBytes(text) {
  return Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
}

// Minimal JPEG: SOI + APP0(JFIF) + APP1(EXIF) + APP13(IPTC) + COM + SOF0(64x48)
// + SOS + entropy bytes + EOI. CRC-free, marker-walkable. `scanBytes` grows
// the entropy-coded payload to simulate a real photo (>128 KB forces the old
// `push(...slice)` spread to overflow the call stack).
function jpegFixture({ withExif = true, withIptc = true, withComment = true, scanBytes = 2 } = {}) {
  const app0 = concat(u8(0xff, 0xe0), u8(...be16(16)), asciiBytes("JFIF\0"), u8(1, 1, 0, 0, 1, 0, 1, 0, 0));
  const app1Exif = withExif
    ? concat(u8(0xff, 0xe1), u8(...be16(2 + 18)), asciiBytes("Exif\0\0"), asciiBytes("GEO-GPS-DATA"))
    : u8();
  const app13 = withIptc
    ? concat(u8(0xff, 0xed), u8(...be16(2 + 12)), asciiBytes("Photoshop 3"), u8(0))
    : u8();
  const com = withComment
    ? concat(u8(0xff, 0xfe), u8(...be16(2 + 12)), asciiBytes("user comment"))
    : u8();
  // SOF0: length 8, precision 8, height 48, width 64, 1 component.
  const sof0 = concat(u8(0xff, 0xc0), u8(...be16(8)), u8(8), u8(...be16(48)), u8(...be16(64)), u8(1));
  const sos = concat(u8(0xff, 0xda), u8(...be16(2 + 5)), u8(1), u8(0x01, 0x00), u8(0x3f, 0x00));
  const scan = new Uint8Array(scanBytes);
  scan.fill(0x5a);
  const eoi = u8(0xff, 0xd9);
  return concat(u8(0xff, 0xd8), app0, app1Exif, app13, com, sof0, sos, scan, eoi);
}

// Minimal PNG: signature + IHDR(64x48) + eXIf chunk + tEXt chunk + IEND.
// `idatBytes` adds a large IDAT chunk (the bulk of a real PNG payload).
function pngFixture({ withExif = true, withText = true, idatBytes = 0 } = {}) {
  const signature = u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const ihdr = concat(
    u8(...be32(13)),
    asciiBytes("IHDR"),
    u8(...be32(64)),
    u8(...be32(48)),
    u8(8, 2, 0, 0, 0),
    u8(0, 0, 0, 0), // crc (unchecked by the parser)
  );
  const exif = withExif
    ? concat(u8(...be32(9)), asciiBytes("eXIf"), asciiBytes("EXIF-GPS!"), u8(0, 0, 0, 0))
    : u8();
  const text = withText
    ? concat(u8(...be32(9)), asciiBytes("tEXt"), asciiBytes("Author=Me"), u8(0, 0, 0, 0))
    : u8();
  const idat = idatBytes > 0
    ? concat(u8(...be32(idatBytes)), asciiBytes("IDAT"), new Uint8Array(idatBytes).fill(0x1a), u8(0, 0, 0, 0))
    : u8();
  const iend = concat(u8(...be32(0)), asciiBytes("IEND"), u8(0, 0, 0, 0));
  return concat(signature, ihdr, exif, text, idat, iend);
}

// Minimal WebP: RIFF/WEBP + VP8X(64x48) + EXIF chunk + XMP chunk.
// `vp8Bytes` adds a large VP8 chunk (the bulk of a real WebP payload).
function webpFixture({ withExif = true, withXmp = true, vp8Bytes = 0 } = {}) {
  const vp8x = concat(
    asciiBytes("VP8X"),
    u8(...le32(10)),
    u8(0x00, 0x00, 0x00, 0x00),
    u8(...[63, 0, 0]), // width-1, 24-bit LE
    u8(...[47, 0, 0]), // height-1, 24-bit LE
  );
  const exif = withExif
    ? concat(asciiBytes("EXIF"), u8(...le32(8)), asciiBytes("GEOGPS!"), u8(0x00))
    : u8();
  const xmp = withXmp
    ? concat(asciiBytes("XMP "), u8(...le32(8)), asciiBytes("<xmp>foo"))
    : u8();
  const vp8 = vp8Bytes > 0
    ? concat(asciiBytes("VP8 "), u8(...le32(vp8Bytes)), new Uint8Array(vp8Bytes).fill(0x2f))
    : u8();
  const body = concat(vp8x, exif, xmp, vp8);
  return concat(asciiBytes("RIFF"), u8(...le32(body.length)), asciiBytes("WEBP"), body);
}

function containsAscii(bytes, text) {
  const needle = asciiBytes(text);
  for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    let match = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// sniffsImageType — magic bytes only
// ---------------------------------------------------------------------------

test("sniffs JPEG, PNG and WebP from magic bytes", () => {
  assert.equal(lib.sniffImageType(jpegFixture()), "jpeg");
  assert.equal(lib.sniffImageType(pngFixture()), "png");
  assert.equal(lib.sniffImageType(webpFixture()), "webp");
});

test("rejects non-image and truncated inputs", () => {
  assert.equal(lib.sniffImageType(u8(...Array.from({ length: 20 }, (_, i) => i))), null);
  assert.equal(lib.sniffImageType(u8(0xff, 0xd8)), null); // too short
  assert.equal(lib.sniffImageType(u8()), null);
  // A PNG signature that is not followed by a valid IHDR still sniffs as PNG
  // (sniffing is header-only); structure validation happens downstream.
  assert.equal(lib.sniffImageType(u8(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0)), "png");
});

// ---------------------------------------------------------------------------
// readImageDimensions
// ---------------------------------------------------------------------------

test("reads JPEG dimensions from SOF0", () => {
  assert.deepEqual(lib.readImageDimensions(jpegFixture(), "jpeg"), { width: 64, height: 48 });
});

test("reads PNG dimensions from IHDR", () => {
  assert.deepEqual(lib.readImageDimensions(pngFixture(), "png"), { width: 64, height: 48 });
});

test("reads WebP dimensions from VP8X", () => {
  assert.deepEqual(lib.readImageDimensions(webpFixture(), "webp"), { width: 64, height: 48 });
});

test("returns null for unreadable structures instead of throwing", () => {
  assert.equal(lib.readImageDimensions(u8(0xff, 0xd8, 0xff, 0xd9), "jpeg"), null);
  assert.equal(lib.readImageDimensions(u8(1, 2, 3), "png"), null);
  assert.equal(lib.readImageDimensions(u8(1, 2, 3), "webp"), null);
  assert.equal(lib.readImageDimensions(jpegFixture(), "webp"), null); // wrong container
});

// ---------------------------------------------------------------------------
// stripImageMetadata
// ---------------------------------------------------------------------------

test("strips EXIF, IPTC and comments from JPEG while keeping pixels", () => {
  const original = jpegFixture();
  const stripped = lib.stripImageMetadata(original, "jpeg");
  assert.ok(stripped, "strip must succeed on a well-formed JPEG");
  assert.equal(containsAscii(stripped, "Exif"), false, "EXIF APP1 must be removed");
  assert.equal(containsAscii(stripped, "Photoshop"), false, "IPTC APP13 must be removed");
  assert.equal(containsAscii(stripped, "user comment"), false, "COM must be removed");
  assert.equal(containsAscii(stripped, "JFIF"), true, "APP0 must be preserved");
  // Pixel-bearing structure is intact: SOF0 dimensions still parse.
  assert.deepEqual(lib.readImageDimensions(stripped, "jpeg"), { width: 64, height: 48 });
  assert.ok(stripped.length < original.length, "stripped output must be smaller");
});

test("strips EXIF and text chunks from PNG while keeping IDAT/IEND", () => {
  const stripped = lib.stripImageMetadata(pngFixture(), "png");
  assert.ok(stripped, "strip must succeed on a well-formed PNG");
  assert.equal(containsAscii(stripped, "eXIf"), false, "eXIf chunk must be removed");
  assert.equal(containsAscii(stripped, "Author=Me"), false, "tEXt chunk must be removed");
  assert.equal(containsAscii(stripped, "IHDR"), true, "IHDR must be preserved");
  assert.equal(containsAscii(stripped, "IEND"), true, "IEND must be preserved");
  assert.deepEqual(lib.readImageDimensions(stripped, "png"), { width: 64, height: 48 });
});

test("strips EXIF and XMP chunks from WebP and fixes the RIFF size", () => {
  const stripped = lib.stripImageMetadata(webpFixture(), "webp");
  assert.ok(stripped, "strip must succeed on a well-formed WebP");
  assert.equal(containsAscii(stripped, "EXIF"), false);
  assert.equal(containsAscii(stripped, "<xmp>"), false);
  assert.equal(containsAscii(stripped, "WEBP"), true);
  assert.equal(containsAscii(stripped, "VP8X"), true);
  // RIFF chunk size (bytes 4..8) must equal payload length.
  const riffSize = (stripped[4] | (stripped[5] << 8) | (stripped[6] << 16) | (stripped[7] << 24)) >>> 0;
  assert.equal(riffSize, stripped.length - 8);
  assert.deepEqual(lib.readImageDimensions(stripped, "webp"), { width: 64, height: 48 });
});

test("returns null on truncated containers (fail closed, never store unstripped)", () => {
  const jpeg = jpegFixture();
  assert.equal(lib.stripImageMetadata(jpeg.slice(0, jpeg.length - 2), "jpeg"), null); // no EOI
  const png = pngFixture();
  assert.equal(lib.stripImageMetadata(png.slice(0, png.length - 1), "png"), null);
  const webp = webpFixture();
  assert.equal(lib.stripImageMetadata(webp.slice(0, webp.length - 1), "webp"), null);
});

test("strips metadata from multi-megabyte payloads without overflowing the call stack", () => {
  // Regression (Ada review, PR #64): `output.push(...bytes.slice(...))`
  // threw `RangeError: Maximum call stack size exceeded` on payloads above
  // ~128 KB, so no real phone photo (2-5 MB) could ever be accepted. The
  // strip pipeline must copy chunks with a preallocated Uint8Array + .set().
  const payloadBytes = 2 * 1024 * 1024; // 2 MiB, well past the old failure point

  const jpeg = jpegFixture({ scanBytes: payloadBytes });
  assert.ok(jpeg.length > 1024 * 1024, "JPEG fixture must exceed 1 MB");
  const jpegStripped = lib.stripImageMetadata(jpeg, "jpeg");
  assert.ok(jpegStripped, "large JPEG must strip successfully");
  assert.equal(containsAscii(jpegStripped, "Exif"), false);
  assert.equal(containsAscii(jpegStripped, "Photoshop"), false);
  assert.equal(containsAscii(jpegStripped, "JFIF"), true);
  assert.deepEqual(lib.readImageDimensions(jpegStripped, "jpeg"), { width: 64, height: 48 });
  assert.ok(
    jpegStripped.length > 1024 * 1024,
    "large JPEG must keep its pixel payload (expected >1 MB, got " + jpegStripped.length + ")",
  );

  const png = pngFixture({ idatBytes: payloadBytes });
  assert.ok(png.length > 1024 * 1024, "PNG fixture must exceed 1 MB");
  const pngStripped = lib.stripImageMetadata(png, "png");
  assert.ok(pngStripped, "large PNG must strip successfully");
  assert.equal(containsAscii(pngStripped, "eXIf"), false);
  assert.equal(containsAscii(pngStripped, "Author=Me"), false);
  assert.equal(containsAscii(pngStripped, "IDAT"), true);
  assert.deepEqual(lib.readImageDimensions(pngStripped, "png"), { width: 64, height: 48 });
  assert.ok(pngStripped.length > 1024 * 1024, "large PNG must keep its IDAT payload");

  const webp = webpFixture({ vp8Bytes: payloadBytes });
  assert.ok(webp.length > 1024 * 1024, "WebP fixture must exceed 1 MB");
  const webpStripped = lib.stripImageMetadata(webp, "webp");
  assert.ok(webpStripped, "large WebP must strip successfully");
  assert.equal(containsAscii(webpStripped, "EXIF"), false);
  assert.equal(containsAscii(webpStripped, "<xmp>"), false);
  assert.equal(containsAscii(webpStripped, "VP8 "), true);
  assert.deepEqual(lib.readImageDimensions(webpStripped, "webp"), { width: 64, height: 48 });
  const riffSize = (webpStripped[4] | (webpStripped[5] << 8) | (webpStripped[6] << 16) | (webpStripped[7] << 24)) >>> 0;
  assert.equal(riffSize, webpStripped.length - 8);
  assert.ok(webpStripped.length > 1024 * 1024, "large WebP must keep its VP8 payload");
});

// ---------------------------------------------------------------------------
// photoLimits — env-tunable caps with safe defaults
// ---------------------------------------------------------------------------

test("photoLimits applies defaults when env knobs are missing or invalid", () => {
  assert.deepEqual(lib.photoLimits({}), {
    maxBytes: lib.DEFAULT_MAX_PHOTO_BYTES,
    maxDimension: lib.DEFAULT_MAX_PHOTO_DIMENSION,
  });
  assert.deepEqual(lib.photoLimits({ PHOTO_MAX_BYTES: "nope", PHOTO_MAX_DIMENSION: "-5" }), {
    maxBytes: lib.DEFAULT_MAX_PHOTO_BYTES,
    maxDimension: lib.DEFAULT_MAX_PHOTO_DIMENSION,
  });
});

test("photoLimits honours valid env overrides", () => {
  assert.deepEqual(lib.photoLimits({ PHOTO_MAX_BYTES: "2048", PHOTO_MAX_DIMENSION: "640" }), {
    maxBytes: 2048,
    maxDimension: 640,
  });
});
