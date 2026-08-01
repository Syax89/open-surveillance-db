import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Let your control plane inject the real binding values (see wrangler.jsonc `d1_databases`) before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
