/**
 * auth-nav — the auth labels the shared public header renders on EVERY
 * route (AuthNavLinks: log in / create account / your account).
 *
 * A fragment of the `auth` domain, not a separate namespace: auth.ts
 * spreads these keys into its own `en`/`it`, so `messages[locale].auth`
 * keeps exactly the same keys and strings. Split out only for JS size —
 * the header imports this file (a few hundred bytes) instead of the whole
 * auth domain (~26 KB of login/register/account/API-key copy).
 *
 * English is the pilot language: `en` defines the canonical key set, `it`
 * is type-checked against it via `Translation<typeof en>` (ADR 0007).
 */
import type { Locale, Translation } from "./types";

export const en = {
  accountAria: "Your account",
  accountTitle: "Your account",
  login: "Log in",
  register: "Create account",
} as const;

export const it: Translation<typeof en> = {
  accountAria: "Il tuo account",
  accountTitle: "Il tuo account",
  login: "Accedi",
  register: "Crea account",
};

/** Both locales of this fragment — what AuthNavLinks imports. */
export const authNavByLocale: Record<Locale, Translation<typeof en>> = { en, it };
