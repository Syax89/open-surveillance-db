import { readPublicPhotoBytes } from "../../../db/photos";

/**
 * GET /api/photos/[id] — serve one approved photo.
 *
 * Strict public boundary: bytes are returned ONLY when the photo is
 * approved, redaction is confirmed, and the linked camera is publicly
 * current. Everything else fails closed with 404 (no existence leak).
 * `storage_key` never appears: the response body is the image itself.
 *
 * The id is parsed from the URL path (works identically under Next.js App
 * Router and the plain-Node route harness, which invokes handlers with a
 * bare Request).
 */
export async function GET(request: Request) {
  const idParam = new URL(request.url).pathname.split("/").pop() ?? "";
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  const photo = await readPublicPhotoBytes(id);
  if (!photo) {
    // Fail closed, indistinguishable from "does not exist".
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  return new Response(photo.bytes, {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "public, max-age=3600, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
