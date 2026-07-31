import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

async function sourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(relativePath) : relativePath;
  }));
  return files.flat();
}

test("the public camera query explicitly excludes pending records", async () => {
  const cameras = await readSource("db/cameras.ts");
  const functionStart = cameras.indexOf("export async function listPublicCameras");
  const functionEnd = cameras.indexOf("export async function createPendingCamera", functionStart);
  const publicQuery = cameras.slice(functionStart, functionEnd);

  assert.ok(functionStart >= 0, "listPublicCameras must remain the public read boundary");
  assert.match(
    publicQuery,
    /WHERE\s+status\s+IN\s*\(\s*'verified'\s*,\s*'demo'\s*\)/i,
    "the public query must whitelist only verified and demo statuses",
  );
  assert.match(publicQuery, /return\s+result\.results\s*;/, "the public query must return its filtered result set");
  assert.doesNotMatch(publicQuery, /status\s*=\s*'pending'/i, "pending records must not be part of the public query");
});

test("the public directory filters are parameterised and whitelisted at the db boundary", async () => {
  const cameras = await readSource("db/cameras.ts");
  const publicStart = cameras.indexOf("export async function listPublicCameras");
  const publicEnd = cameras.indexOf("export async function createPendingCamera", publicStart);
  const publicQuery = cameras.slice(publicStart, publicEnd);

  assert.match(
    cameras,
    /export\s+const\s+freshnessWindows\s*=\s*\[["']7d["']\s*,\s*["']30d["']\s*,\s*["']90d["']\s*,\s*["']all["']\]/,
    "freshness windows must be an explicit whitelist of 7d/30d/90d/all",
  );
  assert.match(publicQuery, /query\s*\+=\s*["']\s*AND\s+kind\s*=\s*\?["']/, "the category filter must be a bound placeholder, never interpolated");
  assert.match(publicQuery, /query\s*\+=\s*["']\s*AND\s+updated\s*>=\s*\?["']/, "the freshness filter must be a bound placeholder, never interpolated");
  assert.match(
    publicQuery,
    /\.bind\(\.\.\.parameters\)/,
    "all filters must be passed through the same parameterised bind call",
  );
  assert.match(
    publicQuery,
    /updated\s+GLOB\s+'\[0-9\]\[0-9\]\[0-9\]\[0-9\]-\*'/,
    "a freshness window must match only ISO verification timestamps (non-ISO labels are never window-matched)",
  );
  assert.doesNotMatch(
    publicQuery,
    /AND\s+kind\s*=\s*['"]\s*\+\s*(?:options|kind|filters)/,
    "the category filter must not concatenate user input into SQL",
  );
  assert.doesNotMatch(
    publicQuery,
    /AND\s+updated\s*>=\s*['"]\s*\+\s*(?:options|freshness|filters)/,
    "the freshness filter must not concatenate user input into SQL",
  );
});

test("verification transitions store an ISO timestamp so the public freshness filter stays meaningful", async () => {
  const moderation = await readSource("db/moderation.ts");
  const transitions = moderation.slice(
    moderation.indexOf("function getCameraTransition"),
    moderation.indexOf("export async function moderateCorrection"),
  );

  assert.match(
    transitions,
    /action === "approve"[\s\S]*?newStatus: "verified",\s*updated:\s*new Date\(\)\.toISOString\(\)/,
    "approve must record the verification moment as a comparable ISO timestamp",
  );
  assert.match(
    transitions,
    /action === "reverify"[\s\S]*?newStatus: "verified",\s*updated:\s*new Date\(\)\.toISOString\(\)/,
    "reverify must refresh the verification timestamp, not a human-readable label",
  );
  assert.doesNotMatch(
    transitions,
    /newStatus: "verified",\s*updated:\s*"Local moderation:/,
    "verified public records must never carry a prose string in updated (breaks freshness ordering)",
  );
});

test("the one-time freshness backfill migration is present, idempotent, and guarded", async () => {
  const files = await sourceFiles("drizzle");
  // H3 follow-up (#37): the backfill is matched by content, not by a hardcoded
  // 0005_ prefix — it was renumbered to 0007 when registered in the journal.
  let migration;
  for (const name of files) {
    if (!name.endsWith(".sql")) continue;
    if (/UPDATE\s+cameras\s+SET\s+updated\s*=/i.test(await readSource(name))) {
      migration = name;
      break;
    }
  }
  assert.ok(migration, "a backfill migration must rewrite pre-existing prose verification timestamps");
  const sql = await readSource(migration);

  // The migration must be registered in the journal, or wrangler never applies
  // it and legacy prose labels survive forever (the #33 defect fixed by #37).
  const journalPath = files.find((name) => name.endsWith("_journal.json"));
  const journal = JSON.parse(await readSource(journalPath));
  const registered = journal.entries.some(
    (entry) => typeof entry.tag === "string" && migration.includes(entry.tag),
  );
  assert.ok(registered, "the backfill migration must be registered in drizzle/meta/_journal.json");

  assert.match(sql, /UPDATE\s+cameras\s+SET\s+updated\s*=/i, "the migration must rewrite the verification timestamp");
  assert.match(sql, /status\s*=\s*'verified'/i, "only verified public records are backfilled");
  assert.match(
    sql,
    /updated\s+NOT\s+GLOB\s+'\[0-9\]\[0-9\]\[0-9\]\[0-9\]-/,
    "only non-ISO values are rewritten, so the migration is idempotent",
  );
  assert.match(sql, /moderation_events/, "the backfill must reuse the moderation audit trail for the real verification moment");
  assert.match(sql, /sqlite_master/, "the backfill must be guarded when the runtime-created audit table does not exist yet");
});

test("JSON, GeoJSON, and CSV are all derived from the public camera list", async () => {
  const route = await readSource("app/api/cameras/route.ts");
  const getStart = route.indexOf("export async function GET");
  const postStart = route.indexOf("export async function POST", getStart);
  const getHandler = route.slice(getStart, postStart);

  assert.match(route, /import\s*\{[^}]*\blistPublicCameras\b[^}]*\}\s*from\s*["'][^"']*db\/cameras["']/);
  assert.match(getHandler, /const\s+records\s*=\s+await\s+listPublicCameras\(filters\)/);
  assert.match(
    getHandler,
    /features\s*:\s*records\.map\(/,
    "GeoJSON must map the same filtered records returned by listPublicCameras",
  );
  assert.match(getHandler, /return\s+Response\.json\(\{\s*records\s*\}\)/);
  assert.match(route, /function\s+toCsv\s*\(records/, "CSV must have an explicit serializer");
  assert.match(getHandler, /format\s*===\s*["']csv["']/, "the public route must recognise the CSV format");
  assert.match(getHandler, /new\s+Response\(toCsv\(records\)/, "CSV must serialize the same filtered record list");
  assert.match(getHandler, /Content-Type["']?\s*:\s*["']text\/csv; charset=utf-8["']/, "CSV must identify its content type");
  assert.doesNotMatch(getHandler, /\bgetD1\b|\bcreatePendingCamera\b/, "GET must not bypass the public-list boundary");
});

test("nearby search validates its bounded coordinates and stays behind the public-list boundary", async () => {
  const route = await readSource("app/api/cameras/nearby/route.ts");
  const cameras = await readSource("db/cameras.ts");
  const helperStart = cameras.indexOf("export async function findNearbyPublicCameras");
  const helperEnd = cameras.indexOf("export async function createPendingCamera", helperStart);
  const helper = cameras.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0, "nearby search must have an explicit public-data helper");
  assert.match(
    route,
    /import\s*\{[^}]*\bfindNearbyPublicCameras\b[^}]*\}\s*from\s*["'][^"']*db\/cameras["']/,
    "the nearby route must use the dedicated public-data helper",
  );
  assert.match(route, /query\.get\(["']latitude["']\)/, "nearby search must read a latitude");
  assert.match(route, /query\.get\(["']longitude["']\)/, "nearby search must read a longitude");
  assert.match(route, /query\.get\(["']radius["']\)/, "nearby search must read a radius when supplied");
  assert.match(
    route,
    /latitude\s*<\s*-90[\s\S]*latitude\s*>\s*90[\s\S]*longitude\s*<\s*-180[\s\S]*longitude\s*>\s*180[\s\S]*radius\s*<\s*10[\s\S]*radius\s*>\s*500/,
    "nearby search must reject invalid coordinates and radius values outside 10–500 metres",
  );
  assert.match(
    route,
    /findNearbyPublicCameras\(\s*latitude,\s*longitude,\s*radius/,
    "nearby search must pass the bounded coordinates (and optional pre-submit text hints) to the public helper",
  );
  assert.doesNotMatch(route, /\bgetD1\b|\.prepare\(|\bSELECT\b/i, "the nearby route must not query the database directly");
  assert.match(helper, /const\s+records\s*=\s+await\s+listPublicCameras\(\)/, "nearby search must start with the filtered public list");
  assert.match(helper, /\.filter\(\(record\)\s*=>\s*record\.distanceMeters\s*<=\s*radiusMeters\)/, "nearby search must filter that public list by distance");
  assert.doesNotMatch(helper, /\bgetD1\b|\.prepare\(|\bSELECT\b/i, "the nearby helper must not bypass the public-list boundary");
});

test("locality search stays behind the public-list boundary and is rate-limited", async () => {
  const route = await readSource("app/api/cameras/search/route.ts");
  const cameras = await readSource("db/cameras.ts");
  const limiter = await readSource("app/lib/rate-limit.ts");
  const search = await readSource("app/lib/search.ts");
  const helperStart = cameras.indexOf("export async function searchPublicCamerasNear");
  const helperEnd = cameras.indexOf("export async function createPendingCamera", helperStart);
  const helper = cameras.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0, "the search route must have a dedicated public-data area helper");
  assert.match(
    route,
    /import\s*\{[^}]*\bsearchPublicCamerasNear\b[^}]*\}\s*from\s*["'][^"']*db\/cameras["']/,
    "the search route must use the dedicated public-data helper",
  );
  assert.match(
    route,
    /import\s*\{[^}]*\bresolvePlace\b[^}]*\}\s*from\s*["'][^"']*db\/geocode["']/,
    "free-text place queries must go through the geocoder module",
  );
  assert.match(helper, /const\s+records\s*=\s+await\s+listPublicCameras\(\)/, "area search must start with the filtered public list");
  assert.match(helper, /\.filter\(\(record\)\s*=>\s*record\.distanceMeters\s*<=\s*radiusMeters\)/, "area search must filter that public list by distance");
  assert.doesNotMatch(helper, /\bsimilarity\b|\bmatchStrength\b|\bslice\(0,\s*8\)/, "area search must not leak duplicate-detection internals or cap results");
  assert.doesNotMatch(route, /\bgetD1\b|\.prepare\(|\bSELECT\b/i, "the search route must not query the database directly");
  assert.doesNotMatch(route, /createPendingCamera|moderateCamera/, "the search route must never write");
  assert.doesNotMatch(route, /\bnotes\b/, "the search route must not reference the private notes field");
  assert.doesNotMatch(route, /console\.(?:log|info)\b/, "the search route must not log user queries");
  assert.match(route, /Cache-Control["']?\s*:\s*["']no-store["']/, "search responses must not be cached at the edge");

  assert.match(
    route,
    /import\s*\{[^}]*\bcheckRateLimit\b[^}]*\}\s*from\s*["'][^"']*lib\/rate-limit["']/,
    "the search route must use the shared per-caller rate limiter",
  );
  assert.match(route, /callerKey\(request\)/, "the rate limiter must be keyed on the caller identity");
  assert.match(route, /status:\s*429/, "exceeding the limit must return 429");
  assert.match(route, /Retry-After/, "the 429 response must include a retry window");
  assert.match(limiter, /SEARCH_RATE_LIMIT_MAX/, "the search request limit must be configurable through environment");
  assert.match(limiter, /SEARCH_RATE_LIMIT_WINDOW_SECONDS/, "the search window must be configurable through environment");

  assert.match(route, /status:\s*404/, "an unresolvable place must return a truthful not-found response");
  assert.match(route, /status:\s*503/, "a geocoder or database failure must return a truthful unavailable response");
  assert.match(route, /searchPublicCamerasNear\(area\.latitude,\s*area\.longitude,\s*area\.radiusMeters\)/);
  assert.match(search, /export\s+function\s+parseCoordinateQuery/, "raw coordinate queries must be parsed locally");
  assert.match(search, /export\s+function\s+radiusForBoundingBox/, "place searches must scale their radius with the resolved place");
});

test("manual report coordinates are bounded and reuse the public-only selection flow", async () => {
  const page = await readSource("app/page.tsx");
  const handlerStart = page.indexOf("async function selectManualCoordinates");
  const submitStart = page.indexOf("async function submitReport", handlerStart);
  const handler = page.slice(handlerStart, submitStart);

  assert.ok(handlerStart >= 0, "the report form must offer a manual-coordinate fallback");
  assert.match(page, /id=["']manual-latitude["']/, "the fallback must provide a labelled latitude input");
  assert.match(page, /id=["']manual-longitude["']/, "the fallback must provide a labelled longitude input");
  assert.match(page, /inputMode=["']decimal["']/, "coordinate inputs should use a decimal-friendly keyboard");
  assert.match(
    handler,
    /Number\.isFinite\(latitude\)[\s\S]*Number\.isFinite\(longitude\)[\s\S]*latitude\s*<\s*-90[\s\S]*latitude\s*>\s*90[\s\S]*longitude\s*<\s*-180[\s\S]*longitude\s*>\s*180/,
    "manual coordinates must reject non-numeric and out-of-range values",
  );
  assert.match(
    handler,
    /await\s+selectCoordinates\(latitude,\s*longitude\)/,
    "a valid manual location must reuse the map selection and nearby-check flow",
  );
});

test("optional report metadata is normalised, date-validated, and kept pending", async () => {
  const route = await readSource("app/api/cameras/route.ts");
  const cameras = await readSource("db/cameras.ts");
  const postStart = route.indexOf("export async function POST");
  const post = route.slice(postStart);
  const createStart = cameras.indexOf("export async function createPendingCamera");
  const create = cameras.slice(createStart);
  const dateHelperStart = route.indexOf("function cleanObservedOn");
  const dateHelperEnd = route.indexOf("function csvCell", dateHelperStart);
  const dateHelper = route.slice(dateHelperStart, dateHelperEnd);

  assert.ok(postStart >= 0, "camera reports must have an explicit POST handler");
  assert.ok(createStart >= 0, "camera reports must use the pending-record writer");
  assert.match(
    post,
    /const\s+manufacturer\s*=\s*cleanText\(payload\.manufacturer,\s*80\)/,
    "the optional manufacturer must be normalised and length-bounded",
  );
  assert.match(
    post,
    /const\s+observedOn\s*=\s*cleanObservedOn\(payload\.observedOn\)/,
    "the optional observation date must be normalised before validation",
  );
  assert.ok(dateHelperStart >= 0, "the observation-date normalisation must be explicit");
  assert.match(
    dateHelper,
    /cleanText\(value,\s*10\)[\s\S]*\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//,
    "the observation-date normaliser must accept only an exact YYYY-MM-DD value",
  );
  assert.match(
    post,
    /payload\.observedOn\s*!==\s*undefined[\s\S]*!observedOn/,
    "a supplied but invalid observation date must reject the report",
  );
  assert.match(
    post,
    /createPendingCamera\(\{[\s\S]*\bmanufacturer\b[\s\S]*\bobservedOn\b[\s\S]*\}\)/,
    "validated optional metadata must be passed only to the pending-record writer",
  );
  assert.match(
    create,
    /INSERT\s+INTO\s+cameras[\s\S]*['"]pending['"]/i,
    "reports with optional metadata must still be inserted as pending",
  );
});

test("optional metadata requires independent publication choices", async () => {
  const cameras = await readSource("db/cameras.ts");
  const route = await readSource("app/api/moderation/route.ts");
  const publicStart = cameras.indexOf("export async function listPublicCameras");
  const publicEnd = cameras.indexOf("export async function createPendingCamera", publicStart);
  const publicQuery = cameras.slice(publicStart, publicEnd);
  const parserStart = route.indexOf("function parseModerationRequest");
  const getStart = route.indexOf("export async function GET", parserStart);
  const parser = route.slice(parserStart, getStart);

  assert.ok(publicStart >= 0, "public metadata must be selected at the public-list boundary");
  assert.match(
    publicQuery,
    /CASE\s+WHEN\s+publish_manufacturer\s*=\s*1\s+THEN\s+manufacturer\s+ELSE\s+NULL\s+END\s+AS\s+manufacturer/i,
    "manufacturer must be suppressed unless its own publication flag is enabled",
  );
  assert.match(
    publicQuery,
    /CASE\s+WHEN\s+publish_observed_on\s*=\s*1\s+THEN\s+observed_on\s+ELSE\s+NULL\s+END\s+AS\s+observedOn/i,
    "observation date must be suppressed unless its own publication flag is enabled",
  );
  assert.doesNotMatch(
    publicQuery,
    /\bSELECT\b[^;]*,\s*manufacturer\s*,/i,
    "the public query must not select the raw manufacturer column directly",
  );
  assert.doesNotMatch(
    publicQuery,
    /\bSELECT\b[^;]*,\s*observed_on\s+AS\s+observedOn\s*,/i,
    "the public query must not select the raw observation-date column directly",
  );

  assert.ok(parserStart >= 0, "metadata publication choices must be parsed before moderation writes");
  assert.match(parser, /const\s+publishManufacturer\s*=\s*value\.publishManufacturer\s*;/);
  assert.match(parser, /const\s+publishObservedOn\s*=\s*value\.publishObservedOn\s*;/);
  assert.match(
    parser,
    /publishManufacturer\s*!==\s*undefined\s*&&\s*typeof\s+publishManufacturer\s*!==\s*["']boolean["']/,
    "a supplied manufacturer choice must be boolean",
  );
  assert.match(
    parser,
    /publishObservedOn\s*!==\s*undefined\s*&&\s*typeof\s+publishObservedOn\s*!==\s*["']boolean["']/,
    "a supplied observation-date choice must be boolean",
  );
  assert.match(
    parser,
    /publishManufacturer\s*:\s*publishManufacturer\s*\?\?\s*false[\s\S]*publishObservedOn\s*:\s*publishObservedOn\s*\?\?\s*false/,
    "omitted choices must default independently to private",
  );
});

test("correction requests are write-only at the public API boundary", async () => {
  const route = await readSource("app/api/corrections/route.ts");

  assert.match(route, /export\s+async\s+function\s+POST\s*\(/);
  assert.doesNotMatch(route, /export\s+(?:async\s+)?function\s+GET\s*\(/);
  assert.doesNotMatch(route, /export\s+(?:async\s+)?function\s+(?:PUT|PATCH|DELETE)\s*\(/);
  assert.match(route, /createCorrectionRequest\(/, "POST must store a private correction request");
});

test("moderation decisions require a reason code from an explicit allowlist", async () => {
  const route = await readSource("app/api/moderation/route.ts");
  const moderation = await readSource("db/moderation.ts");
  const parserStart = route.indexOf("function parseModerationRequest");
  const getStart = route.indexOf("export async function GET", parserStart);
  const parser = route.slice(parserStart, getStart);

  assert.ok(parserStart >= 0, "moderation requests must be parsed before they reach the database");
  assert.match(parser, /\breasonCode\b/, "every moderation decision must include a reasonCode");
  assert.match(
    moderation,
    /export\s+const\s+moderationReasonCodes\s*=\s*\[/,
    "the moderation module must declare an explicit reason-code allowlist",
  );
  assert.match(
    parser,
    /typeof\s+reasonCode\s*!==\s*["']string["']\s*\|\|\s*!\s*moderationReasonCodes\.includes\(reasonCode\s+as\s+ModerationReasonCode\)/,
    "the parser must reject missing or unrecognised reason codes",
  );
  assert.match(
    parser,
    /return\s*\{[^}]*\breasonCode\b[^}]*\}/s,
    "the validated reason code must be carried into the moderation command",
  );
});

test("moderation writes an auditable event with transition, actor, and note", async () => {
  const moderation = await readSource("db/moderation.ts");
  const migration = await readSource("drizzle/0002_confused_human_torch.sql");

  assert.doesNotMatch(
    moderation,
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+moderation_events/i,
    "the moderation module must not bootstrap tables at runtime; the schema comes from the Drizzle migrations",
  );
  assert.match(
    migration,
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?moderation_events`?\s*\([\s\S]*?\bprevious_status\b[\s\S]*?\bnew_status\b[\s\S]*?\bnote\b[\s\S]*?\bactor\b/i,
    "the moderation_events migration must define status transitions, actor, and note",
  );
  assert.match(
    moderation,
    /INSERT\s+INTO\s+moderation_events\s*\(\s*entity\s*,\s*entity_id\s*,\s*(?:from_status|previous_status)\s*,\s*(?:to_status|new_status)\s*,\s*action\s*,\s*reason_code\s*,\s*note\s*,\s*actor/i,
    "each moderation decision must insert an event with its transition and decision context",
  );
  assert.match(
    moderation,
    /previousStatus\s*:\s*["']pending["'][\s\S]{0,300}newStatus\s*:\s*status/,
    "the event creation must include both the prior and destination status",
  );
  assert.match(
    moderation,
    /event\.note[\s\S]{0,300}localModerator/,
    "the inserted event must bind the prior state, destination state, actor, reason, and note",
  );
});

test("camera lifecycle keeps published and review-only transitions explicit", async () => {
  const moderation = await readSource("db/moderation.ts");

  assert.match(
    moderation,
    /["']mark-stale["'][\s\S]{0,600}["']needs_review["']/,
    "mark-stale must transition a verified camera into needs_review",
  );
  assert.match(
    moderation,
    /["']reverify["'][\s\S]{0,600}["']verified["']/,
    "reverify must transition a needs_review camera back to verified",
  );
  assert.match(
    moderation,
    /["']needs_review["'][\s\S]{0,600}["']removed["']/,
    "a camera under review must have an explicit removal path",
  );
  assert.match(
    moderation,
    /getCameraTransition\(current\.status,\s*action\)/,
    "camera actions must be evaluated against the record's current status",
  );
  assert.match(
    moderation,
    /UPDATE\s+cameras\s+SET\s+status\s*=\s*\?[\s\S]{0,300}WHERE\s+id\s*=\s*\?\s+AND\s+status\s*=\s*\?/i,
    "the update must be compare-and-set guarded against concurrent status changes",
  );
  assert.match(
    moderation,
    /\.bind\(transition\.newStatus,\s*transition\.updated,\s*id,\s*current\.status\)/,
    "the compare-and-set guard must use the exact status validated by the lifecycle transition",
  );
});

test("the moderation queue separates published records from records requiring review", async () => {
  const moderation = await readSource("db/moderation.ts");
  const queueStart = moderation.indexOf("export async function listPendingModerationItems");
  const queueEnd = moderation.indexOf("export async function moderateCamera", queueStart);
  const queue = moderation.slice(queueStart, queueEnd);

  assert.ok(queueStart >= 0, "the moderation queue must remain an explicit database boundary");
  assert.match(queue, /\bpublishedCameras\b/, "the queue must expose published cameras separately");
  assert.match(queue, /\breviewCameras\b/, "the queue must expose cameras requiring review separately");
  assert.match(
    queue,
    /(?:status\s*=\s*\?|status\s+IN\s*\(\s*\?)[\s\S]{0,200}\.bind\([\s\S]{0,80}["']verified["']/i,
    "the published-camera queue must explicitly select verified records",
  );
  assert.match(
    queue,
    /(?:status\s*=\s*\?|status\s+IN\s*\(\s*\?)[\s\S]{0,200}\.bind\([\s\S]{0,80}["']needs_review["']/i,
    "the review queue must explicitly select needs_review records",
  );
  assert.match(
    queue,
    /return\s*\{[\s\S]{0,500}\bpublishedCameras\b[\s\S]{0,500}\breviewCameras\b[\s\S]{0,500}\}/,
    "GET moderation data must return both lifecycle queues",
  );
});

test("the moderation route accepts only the explicit lifecycle actions", async () => {
  const route = await readSource("app/api/moderation/route.ts");
  const parserStart = route.indexOf("function parseModerationRequest");
  const getStart = route.indexOf("export async function GET", parserStart);
  const parser = route.slice(parserStart, getStart);

  assert.ok(parserStart >= 0, "lifecycle commands must be parsed before database writes");
  assert.match(
    parser,
    /action\s*===\s*["']mark-stale["']/,
    "the route parser must allow mark-stale for verified cameras",
  );
  assert.match(
    parser,
    /action\s*===\s*["']reverify["']/,
    "the route parser must allow reverify for cameras under review",
  );
});

test("the public interface contains no moderation or admin endpoint link", async () => {
  const clientFiles = (await sourceFiles("app"))
    .filter((file) => !file.startsWith(`app${path.sep}api${path.sep}`))
    .filter((file) => !file.startsWith(`app${path.sep}moderation${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}ModerationDashboard.`))
    .filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
  const publicSource = (await Promise.all(clientFiles.map(readSource))).join("\n");

  assert.doesNotMatch(
    publicSource,
    /(?:href|action|fetch)\s*(?:=|\()\s*["'`]\/?(?:api\/)?(?:moderation|admin)[\/?"'`]/i,
    "public pages must not expose a moderation or admin endpoint",
  );
  assert.doesNotMatch(
    publicSource,
    /(?:href|action)\s*=\s*\{["'`]\/?(?:api\/)?(?:moderation|admin)[\/?"'`]\}/i,
    "public pages must not expose a moderation or admin endpoint through JSX expressions",
  );
});


test("the public JSON output never contains the private notes field", async () => {
  const cameras = await readSource("db/cameras.ts");
  const route = await readSource("app/api/cameras/route.ts");
  const publicStart = cameras.indexOf("export async function listPublicCameras");
  const publicEnd = cameras.indexOf("export async function createPendingCamera", publicStart);
  const publicBoundary = cameras.slice(publicStart, publicEnd);
  const getStart = route.indexOf("export async function GET");
  const postStart = route.indexOf("export async function POST", getStart);
  const getHandler = route.slice(getStart, postStart);

  assert.ok(publicStart >= 0, "the public query must remain the public read boundary");
  assert.doesNotMatch(
    publicBoundary,
    /\bnotes\b/,
    "the public read boundary must not select or reference the private notes field",
  );
  assert.doesNotMatch(
    getHandler,
    /\bnotes\b/,
    "the public GET handler must not expose a notes field",
  );
  assert.match(
    cameras,
    /export\s+type\s+PublicCameraRecord\s*=\s*Omit\s*<CameraRecord,\s*["']notes["']>/,
    "the public record type must explicitly omit the private notes field",
  );
});

test("moderation is gated at the worker edge and fails closed", async () => {
  const worker = await readSource("worker/index.ts");

  assert.match(worker, /moderationPath\s*=\s*\(/, "the worker must recognise moderation paths");
  assert.match(worker, /MODERATION_USER/, "the worker must read the moderator username from environment");
  assert.match(worker, /MODERATION_PASSWORD/, "the worker must read the moderator password from environment");
  assert.match(worker, /MODERATION_TOKEN/, "the worker must accept a bearer token when configured");
  assert.match(worker, /status:\s*401/, "unauthenticated moderation requests must be rejected with 401");
  assert.match(worker, /Unauthorized/, "the 401 response must identify itself as Unauthorized");
  assert.match(worker, /status:\s*503/, "the gate must fail closed when no credentials are configured");
});

test("public POST endpoints are rate-limited per caller and can be disabled", async () => {
  const route = await readSource("app/api/cameras/route.ts");
  const limiter = await readSource("app/lib/rate-limit.ts");
  const postStart = route.indexOf("export async function POST");
  const post = route.slice(postStart);

  assert.ok(postStart >= 0, "camera reports must have an explicit POST handler");
  assert.match(
    route,
    /import\s*\{[^}]*\bcheckRateLimit\b[^}]*\}\s*from\s*["'][^"']*lib\/rate-limit["']/,
    "the POST handler must use the shared per-caller rate limiter",
  );
  assert.match(route, /callerKey\(request\)/, "the rate limiter must be keyed on the caller identity");
  assert.match(post, /status:\s*429/, "exceeding the limit must return 429");
  assert.match(post, /Retry-After/, "the 429 response must include a retry window");
  assert.match(post, /submissionsDisabled\(env\)/, "submissions must be disableable through environment");
  assert.match(limiter, /new\s+Map<string,\s*number\[\]>/, "the limiter must keep per-key request timestamps");
  assert.match(limiter, /POST_RATE_LIMIT_MAX/, "the request limit must be configurable through environment");
  assert.match(limiter, /POST_RATE_LIMIT_WINDOW_SECONDS/, "the window must be configurable through environment");
  assert.match(limiter, /POST_SUBMISSIONS_DISABLED/, "the disable flag must be read from environment");
});

test("server errors are logged server-side and return generic client messages", async () => {
  const routes = {
    cameras: await readSource("app/api/cameras/route.ts"),
    nearby: await readSource("app/api/cameras/nearby/route.ts"),
    revisions: await readSource("app/api/cameras/revisions/route.ts"),
    corrections: await readSource("app/api/corrections/route.ts"),
    moderation: await readSource("app/api/moderation/route.ts"),
  };

  for (const [label, source] of Object.entries(routes)) {
    assert.doesNotMatch(
      source,
      /Response\.json\(\{\s*error:\s*error\s+instanceof\s+Error\s*\?\s*error\.message/,
      `${label} must not leak raw error messages to the client`,
    );
    assert.match(source, /console\.error/, `${label} must log error details server-side`);
  }
});

test("every map task has a keyboard/text-list equivalent in the public interface", async () => {
  const page = await readSource("app/page.tsx");
  const map = await readSource("app/components/SurveillanceMap.tsx");

  // Map task: select a record (pin click). Keyboard path: the directory's
  // "Show on map" moves selection AND keyboard focus to the map region,
  // respecting reduced motion.
  assert.match(page, /function\s+showRecordOnMap\s*\(\s*id:\s*number\s*\)/);
  assert.match(page, /setSelectedId\s*\(\s*id\s*\)/, "show-on-map must select the record");
  assert.match(page, /document\.getElementById\(\s*["']map["']\s*\)\?\.scrollIntoView/, "show-on-map must scroll to the map");
  assert.match(page, /document\.getElementById\(\s*["']map-region["']\s*\)\?\.focus/, "show-on-map must move keyboard focus to the map region");
  assert.match(page, /prefers-reduced-motion/, "scrolling must respect reduced-motion preference");

  // Map task: browse pins. Text-list path: one directory card per record with
  // the keyboard select action.
  assert.match(page, /className=["']record-list["']/, "the directory must render the record list");
  assert.match(page, /showRecordOnMap\(\s*camera\.id\s*\)/, "every record card must offer the keyboard select path");

  // Map task: pick a report position (map click). Keyboard path: manual coordinates.
  assert.match(page, /selectManualCoordinates/, "the report form must keep the manual-coordinate fallback");

  // The map region is a labelled, programmatically focusable landmark that
  // describes the text-list alternative.
  assert.match(map, /role="region"/);
  assert.match(map, /aria-label=\{\s*label\s*\}/);
  assert.match(map, /tabIndex=\{\s*-1\s*\}/, "the map region must accept programmatic focus");
  assert.match(map, /id="map-region"/);
  assert.match(map, /href="#records"/, "the map description must link the directory alternative");

  // Map task: map unavailable (blocked script or tile host). The list stays
  // usable and the failure is visible with a direct link to the directory.
  assert.match(map, /setMapUnavailable\(\s*true\s*\)/, "a map startup failure must flip to the fallback state");
  assert.match(map, /map-fallback/, "the fallback state must render a visible text alternative");
  // i18n externalisation moved user-facing wording into the pilot bundle
  // (ADR 0007); the fallback must still state plainly that the map is
  // unavailable, and the component must consume it from the bundle.
  const enBundle = await readSource("app/lib/i18n/en.ts");
  assert.match(enBundle, /The interactive map is unavailable\./, "the EN pilot bundle must state plainly that the map is unavailable");
  assert.match(map, /t\.mapFallbackTitle/, "the fallback title must come from the message bundle");
  assert.match(map, /t\.mapFallbackBody/, "the fallback body must come from the message bundle");
});

test("package metadata identifies the project, license, and repository", async () => {
  const pkg = JSON.parse(await readSource("package.json"));
  assert.equal(pkg.name, "open-surveillance-db");
  assert.equal(pkg.license, "AGPL-3.0-or-later");
  assert.equal(pkg.repository?.url, "git+https://github.com/Syax89/open-surveillance-db.git");
  assert.equal(pkg.homepage, "https://github.com/Syax89/open-surveillance-db");
});

test("the public change summary is served only for currently public records", async () => {
  const route = await readSource("app/api/cameras/revisions/route.ts");
  const cameras = await readSource("db/cameras.ts");
  const getStart = cameras.indexOf("export async function getPublicCameraById");
  const getBoundary = cameras.slice(getStart);

  assert.ok(getStart >= 0, "the revisions route must have a dedicated public-record lookup");
  assert.match(
    getBoundary,
    /WHERE\s+id\s*=\s*\?\s+AND\s+status\s+IN\s*\(\s*'verified'\s*,\s*'demo'\s*\)/i,
    "the lookup must resolve only verified and demo records",
  );
  assert.doesNotMatch(getBoundary, /\bnotes\b/, "the lookup must not select the private notes field");

  assert.match(
    route,
    /import\s*\{[^}]*\bgetPublicCameraById\b[^}]*\}\s*from\s*["'][^"']*db\/cameras["']/,
    "the route must use the dedicated public-record lookup",
  );
  assert.match(
    route,
    /import\s*\{[^}]*\blistPublicCameraRevisions\b[^}]*\}\s*from\s*["'][^"']*db\/moderation["']/,
    "the route must use the dedicated public-history boundary",
  );
  assert.match(route, /searchParams\.get\(['"]cameraId['"]\)/, "the route must read a cameraId");
  assert.match(route, /status:\s*400/, "an invalid cameraId must be rejected");
  assert.match(route, /if\s*\(!record\)/, "a non-public record must be rejected before any history read");
  assert.match(route, /status:\s*404/, "a non-public record must return 404");
  assert.match(route, /status:\s*503/, "database failures must fail closed");
  assert.doesNotMatch(
    route,
    /\bgetD1\b|\.prepare\(|\bSELECT\b|\bmoderateCamera\b|\blistPendingModerationItems\b/i,
    "the public route must not touch the database or the moderation queue directly",
  );
});

test("the public change summary omits contributor identity and internal notes", async () => {
  const moderation = await readSource("db/moderation.ts");
  const summaryStart = moderation.indexOf("export async function listPublicCameraRevisions");
  const summary = moderation.slice(summaryStart);

  assert.ok(summaryStart >= 0, "the public-history boundary must be an explicit database function");
  assert.match(
    summary,
    /FROM\s+moderation_events\s+WHERE\s+entity\s*=\s*['"]camera['"]\s+AND\s+entity_id\s*=\s*\?/i,
    "the summary must select only camera lifecycle events for the requested record",
  );
  assert.match(
    summary,
    /ORDER\s+BY\s+created_at\s+ASC,\s*id\s+ASC/i,
    "the summary must be chronological, oldest first",
  );
  assert.doesNotMatch(
    summary,
    /\bactor\b|\bnote\b|\breason_code\b|\breasonCode\b/,
    "the public summary must never select the private audit columns (actor, note, reason code)",
  );
});
