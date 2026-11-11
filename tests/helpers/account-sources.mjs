// Source surface of the /account page body for static source contracts.
//
// AccountPageBody.tsx used to be one ~1060-line file; it is now an
// orchestrator that composes one component per section (plus the
// useContributions/usePasskeys hooks in app/lib). The static contracts
// (a11y, layout polish, status-leak boundaries) still pin the same JSX and
// helper patterns — they just read them from the files they now live in.
// The API-key panel (ApiKeysSection/ApiKeyList/ApiKeyRow) predates the
// split and is deliberately NOT part of this surface.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ACCOUNT_PAGE_SOURCES = [
  "app/account/AccountPageBody.tsx",
  "app/account/VerifyEmailBanner.tsx",
  "app/account/ProfileSection.tsx",
  "app/account/DisplayNameField.tsx",
  "app/account/ContributionsSection.tsx",
  "app/account/ContributionStats.tsx",
  "app/account/ContributionFilters.tsx",
  "app/account/ContributionList.tsx",
  "app/account/ContributionKindIcon.tsx",
  "app/account/PasskeysSection.tsx",
  "app/account/PasskeyDialogs.tsx",
  "app/account/DeleteAccountSection.tsx",
  // Hooks that now hold logic formerly inline in AccountPageBody.tsx.
  "app/lib/useContributions.ts",
  "app/lib/usePasskeys.ts",
];

/** Concatenated source of the account page body and its section components. */
export async function readAccountPageSource() {
  const parts = await Promise.all(
    ACCOUNT_PAGE_SOURCES.map((file) => readFile(path.join(root, file), "utf8")),
  );
  return parts.join("\n");
}
