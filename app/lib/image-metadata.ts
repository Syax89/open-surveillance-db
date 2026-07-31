/**
 * Pure-JS image metadata helpers for the photo intake pipeline.
 *
 * Everything here is dependency-free and runs in both the Cloudflare
 * Workers runtime (workerd) and plain Node (the test suite), so the exact
 * same validation and EXIF-stripping logic is exercised in CI.
 *
 * Scope (docs/workstreams/DATA_TRUST.md, STATUS gap #3):
 *  - `sniffImageType`   — identify the container from magic bytes only,
 *                         never trusting the caller-supplied Content-Type;
 *  - `readImageDimensions` — parse width/height from container headers
 *                         (JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X);
 *  - `stripImageMetadata` — remove privacy-bearing metadata segments
 *                         (EXIF, XMP, IPTC/Photoshop, PNG text chunks,
 *                         WebP EXIF/XMP chunks) before storage. EXIF
 *                         stripping is mandatory at intake; if the
 *                         structure cannot be walked safely the upload is
 *                         rejected (fail closed, never store unstripped).
 */

export type ImageType = "jpeg" | "png" | "webp";

export const ALLOWED_PHOTO_TYPES: readonly ImageType[] = ["jpeg", "png", "webp"] as const;

export const PHOTO_MIME_TYPES: Record<ImageType, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Default upload caps; each can be overridden via env (see photoLimits). */
export const DEFAULT_MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MiB
export const DEFAULT_MAX_PHOTO_DIMENSION = 8_000; // px per side

type EnvLike = { [key: string]: unknown };

/**
 * Environment-tunable upload limits. `unknown` parameter on purpose: the
 * Cloudflare `Env` interface has no string index signature, and this module
 * must stay runnable in plain Node (the harness imports its source).
 */
export function photoLimits(env: unknown): {
  maxBytes: number;
  maxDimension: number;
} {
  const config = env as EnvLike;
  const maxBytes = Number(config.PHOTO_MAX_BYTES);
  const maxDimension = Number(config.PHOTO_MAX_DIMENSION);
  return {
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_PHOTO_BYTES,
    maxDimension:
      Number.isFinite(maxDimension) && maxDimension > 0
        ? maxDimension
        : DEFAULT_MAX_PHOTO_DIMENSION,
  };
}

/** Identify the image container from its magic bytes; `null` for anything else. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: "RIFF" + size + "WEBP"
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  return null;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/**
 * Parse width/height from the container header without decoding pixels.
 * Returns `null` when the structure is unreadable (never throws).
 */
export function readImageDimensions(
  bytes: Uint8Array,
  type: ImageType,
): { width: number; height: number } | null {
  try {
    if (type === "jpeg") return readJpegDimensions(bytes);
    if (type === "png") return readPngDimensions(bytes);
    return readWebpDimensions(bytes);
  } catch {
    return null;
  }
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // Walk segments after SOI (FF D8). SOFn markers carry dimensions; skip
  // the entropy-coded data at SOS and stop at EOI.
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd9) return null; // EOI before any SOF
    if (marker === 0xda) return null; // SOS reached without SOF
    const length = readUint16BE(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    // SOF0-15 excluding DHT (C4), JPG (C8), DAC (CC)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && length >= 7) {
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      if (width < 1 || height < 1) return null;
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // Signature (8) + IHDR: length(4) + "IHDR" + width(4) + height(4)
  if (bytes.length < 24) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // RIFF(12) then chunks: fourcc(4) + size(4 LE) + payload (+pad byte if odd)
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = readUint32LE(bytes, offset + 4);
    if (offset + 8 + size > bytes.length) return null;
    const data = offset + 8;
    if (fourcc === "VP8X" && size >= 10) {
      // canvas width-1 / height-1, 24-bit little-endian at data[4..9]
      const width = readUint24LE(bytes, data + 4) + 1;
      const height = readUint24LE(bytes, data + 7) + 1;
      if (width < 1 || height < 1) return null;
      return { width, height };
    }
    if (fourcc === "VP8 " && size >= 10) {
      // frame tag (3) + start code (3) + 14-bit width/height LE
      const width = (bytes[data + 6] | ((bytes[data + 7] & 0x3f) << 8)) & 0x3fff;
      const height = (bytes[data + 8] | ((bytes[data + 9] & 0x3f) << 8)) & 0x3fff;
      if (width < 1 || height < 1) return null;
      return { width, height };
    }
    if (fourcc === "VP8L" && size >= 5) {
      // signature 0x2f then 14-bit width-1 / height-1 packed in 4 bytes LE
      if (bytes[data] !== 0x2f) return null;
      const packed = readUint32LE(bytes, data + 1);
      const width = (packed & 0x3fff) + 1;
      const height = ((packed >> 14) & 0x3fff) + 1;
      if (width < 1 || height < 1) return null;
      return { width, height };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/**
 * Strip privacy-bearing metadata from an image container.
 *
 * Returns a new Uint8Array with the metadata segments removed, or `null`
 * when the container structure cannot be walked safely. The intake route
 * treats `null` as a hard failure (413/400, never store unverifiable data).
 *
 * - JPEG: drops APP1 (EXIF + XMP), APP13 (IPTC/Photoshop) and COM
 *   (comment) segments, preserving everything else byte-for-byte.
 * - PNG: drops eXIf, tEXt, iTXt, zTXt chunks (EXIF + text metadata).
 * - WebP: drops EXIF and XMP chunks.
 */
export function stripImageMetadata(bytes: Uint8Array, type: ImageType): Uint8Array | null {
  try {
    if (type === "jpeg") return stripJpegMetadata(bytes);
    if (type === "png") return stripPngMetadata(bytes);
    return stripWebpMetadata(bytes);
  } catch {
    return null;
  }
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const output: number[] = [0xff, 0xd8];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // SOS: entropy-coded data follows; copy everything to the end verbatim.
    if (marker === 0xda) {
      output.push(...bytes.slice(offset));
      return Uint8Array.from(output);
    }
    if (marker === 0xd9) {
      output.push(0xff, 0xd9);
      return Uint8Array.from(output);
    }
    const length = readUint16BE(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    // Standalone markers (RST0-7, TEM) carry no length field.
    const standalone = (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01;
    if (standalone) {
      output.push(0xff, marker);
      offset += 2;
      continue;
    }
    // Drop privacy-bearing segments: APP1 (EXIF/XMP), APP13 (IPTC/PS), COM.
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) {
      output.push(0xff, marker);
      output.push(...bytes.slice(offset + 2, offset + 2 + length));
    }
    offset += 2 + length;
  }
  // Truncated container (no EOI): refuse rather than guess.
  return null;
}

function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  const signature = bytes.slice(0, 8);
  if (signature.length !== 8 || sniffImageType(signature) !== "png") return null;
  const output: number[] = [...signature];
  let offset = 8;
  const dropped = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const total = 12 + length;
    if (offset + total > bytes.length) return null;
    if (!dropped.has(type)) {
      output.push(...bytes.slice(offset, offset + total));
    }
    offset += total;
  }
  if (offset !== bytes.length) return null;
  return Uint8Array.from(output);
}

function stripWebpMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || sniffImageType(bytes) !== "webp") return null;
  const output: number[] = [...bytes.slice(0, 8)]; // RIFF + placeholder size
  let offset = 12;
  const dropped = new Set(["EXIF", "XMP "]);
  while (offset + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = readUint32LE(bytes, offset + 4);
    const total = 8 + size + (size % 2);
    if (offset + total > bytes.length) return null;
    if (!dropped.has(fourcc)) {
      output.push(...bytes.slice(offset, offset + total));
    }
    offset += total;
  }
  if (offset !== bytes.length) return null;
  // Rewrite the RIFF chunk size (bytes 4..8, little-endian, excludes RIFF+size).
  const riffSize = output.length - 8;
  output[4] = riffSize & 0xff;
  output[5] = (riffSize >> 8) & 0xff;
  output[6] = (riffSize >> 16) & 0xff;
  output[7] = (riffSize >> 24) & 0xff;
  return Uint8Array.from(output);
}
