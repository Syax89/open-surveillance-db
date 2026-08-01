import { readPhotoBytes } from "../../../../../db/photos";

/**
 * GET /api/moderation/photos/[id] — moderator preview of a photo's bytes.
 *
 * This path lives under /api/moderation/* and is therefore gated at the
 * worker edge by the same fail-closed Basic auth / bearer gate as the rest
 * of the moderation API (worker/index.ts). Pending and rejected photos are
 * never served through the public route; this is the only way a moderator
 * can inspect the evidence before deciding. Response is never cached.
 *
 * The id is parsed from the URL path (works identically under Next.js App
 * Router and the plain-Node route harness).
 */
export async function GET(request: Request) {
  const idParam = new URL(request.url).pathname.split("/").pop() ?? "";
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  const photo = await readPhotoBytes(id);
  if (!photo) {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  return new Response(
    photo.bytes.buffer.slice(photo.bytes.byteOffset, photo.bytes.byteOffset + photo.bytes.byteLength) as ArrayBuffer,
    {
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    },
  );
}
