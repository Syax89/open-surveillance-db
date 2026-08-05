// Import rollback (FONTI PUBBLICHE FASE A, kanban t_6030d390;
// docs/data-sources/normalizzazione-pipeline.md §8.5).
//
// Removes a WHOLE batch: every camera row the batch inserted (by
// `import_batch_id`), their cascaded lifecycle events and community actions
// (the camera never legitimately existed — actions cast on it die with it,
// consistent with erasure semantics ADR 0021 §13), an internal
// `moderation_events` audit row, then `import_batches.status =
// 'rolled_back'`.
//
// Hard rules:
//   - abort unless the batch is 'committed' (a running/failed batch has
//     nothing to roll back; a rolled_back one must not re-roll);
//   - rollback never touches community reports (their `import_batch_id` is
//     NULL and their rows were never modified in v1 — merge is disabled);
//   - every rollback is audited internally (moderation_events
//     action='import-rollback', actor='import-runner') while the public
//     projection stays clean (the `imported` lifecycle events are deleted
//     WITH their cameras).
//
// Rollback is reversible-undo, not data loss: batch rows stay in
// `import_batches` (status 'rolled_back') for attribution history; only the
// cameras rows are deleted.

export const IMPORT_ROLLBACK_ACTION = "import-rollback";

/**
 * Roll back one import batch.
 * @param db D1-compatible database
 * @param {string} slug batch slug
 * @returns {object} { slug, batchId, removedCameras, eventsRemoved, actionsRemoved }
 */
export async function rollbackImport(db, slug) {
  const batch = await db.prepare("SELECT id, slug, status FROM import_batches WHERE slug = ?").bind(slug).first();
  if (!batch) throw new Error(`batch '${slug}' not found — nothing to roll back`);
  if (batch.status !== "committed") {
    throw new Error(
      `batch '${slug}' has status '${batch.status}', expected 'committed' — ` +
        "only a committed batch can be rolled back",
    );
  }
  const batchId = batch.id;
  const nowIso = new Date().toISOString();

  // Camera rows the batch inserted (never community reports — their
  // import_batch_id is NULL).
  const cameras = await db
    .prepare("SELECT id FROM cameras WHERE import_batch_id = ?")
    .bind(batchId)
    .all();
  const cameraIds = cameras.results.map((row) => row.id);
  const removedCameras = cameraIds.length;

  // Cascaded child rows: community actions and lifecycle events die with
  // the camera (the D1 FK ON DELETE CASCADE would do this in production,
  // but the test harness and some local DBs do not enforce foreign keys —
  // the explicit deletes keep the rollback correct on every surface).
  let eventsRemoved = 0;
  let actionsRemoved = 0;
  for (let offset = 0; offset < cameraIds.length; offset += 50) {
    const chunk = cameraIds.slice(offset, offset + 50);
    const placeholders = chunk.map(() => "?").join(", ");
    const eventResult = await db
      .prepare(`DELETE FROM camera_lifecycle_events WHERE camera_id IN (${placeholders})`)
      .bind(...chunk)
      .run();
    eventsRemoved += Number(eventResult.meta?.changes ?? 0);
    const actionResult = await db
      .prepare(`DELETE FROM camera_community_actions WHERE camera_id IN (${placeholders})`)
      .bind(...chunk)
      .run();
    actionsRemoved += Number(actionResult.meta?.changes ?? 0);
  }

  // The cameras themselves.
  for (const id of cameraIds) {
    await db.prepare("DELETE FROM cameras WHERE id = ? AND import_batch_id = ?").bind(id, batchId).run();
  }

  // Internal audit row (append-only moderation_events; INSERT is allowed,
  // the triggers only block UPDATE/DELETE — design §7.6/§8.5).
  await db
    .prepare(
      `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, created_at)
       VALUES ('import_batch', ?, 'committed', 'rolled_back', ?, 'import-rollback', ?, 'import-runner', ?)`,
    )
    .bind(batchId, IMPORT_ROLLBACK_ACTION, `rollback of batch ${slug}`, nowIso)
    .run();

  // Batch row status.
  await db
    .prepare("UPDATE import_batches SET status = 'rolled_back', notes = ?, updated_at = ? WHERE id = ?")
    .bind(`Rolled back at ${nowIso}`, nowIso, batchId)
    .run();

  return { slug, batchId, removedCameras, eventsRemoved, actionsRemoved };
}
