/**
 * Server-side locale resolution for Server Components.
 *
 * The root layout and the informational pages are Server Components: they
 * cannot call the client hook `useMessages()` (LocaleProvider context).
 * Instead they read the persisted locale preference from the
 * `opensurveillancedb-locale` cookie and pick the bundle directly.
 *
 * Default is English — the pilot language (ADR 0007). This matches the SSR
 * behaviour before the Server-Component conversion: `readStoredLocale()`
 * returns "en" when `window` is undefined, so the server always rendered
 * English and the client then hydrated the stored choice. Reading the same
 * value from the cookie keeps the first paint identical for users without a
 * stored preference and removes the EN->IT flash for users who chose Italian.
 *
 * Privacy by design: the cookie stores only the interface-locale preference,
 * no personal data (see LOCALE_COOKIE in app/lib/i18n).
 */
import { cookies } from "next/headers";
import { LOCALE_COOKIE, messages } from "./i18n";
import type { Locale, MessageBundle } from "./i18n";

export async function getServerLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    const value = store.get(LOCALE_COOKIE)?.value;
    return value === "it" ? "it" : "en";
  } catch {
    // cookies() unavailable (e.g. some prerender/edge paths): pilot language.
    return "en";
  }
}

export async function getServerMessages(): Promise<MessageBundle> {
  return messages[await getServerLocale()];
}
