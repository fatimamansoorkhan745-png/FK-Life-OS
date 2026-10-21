// Sync endpoint: the one copy of the planner data that every device shares.
//
// GET  /api/data?have=N  returns {version, data}, or {version, unchanged: true}
//                        when the device already has version N, so the regular
//                        check every few seconds costs almost nothing.
// PUT  /api/data         body is the full planner data as JSON; the header
//                        X-Base-Version says which version the device started
//                        from. If another device saved in the meantime, nothing
//                        is written and 409 comes back with the newer copy, so
//                        the device can merge both sets of changes and try again.
//
// The data is stored split into pieces (see _shared/db.js), and every read and
// write of those pieces happens in one transaction, so a device can never get
// half of an old copy and half of a new one.

import { ensureSchema, json, missingDatabase } from "../_shared/db.js";

const CHUNK_CHARS = 400000;
const MAX_CHARS = 40 * 1000 * 1000;

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return missingDatabase();
  await ensureSchema(db);
  const have = new URL(request.url).searchParams.get("have");
  if (have !== null) {
    const meta = await db.prepare("SELECT version FROM petal_meta WHERE id = 1").first();
    if (meta && String(meta.version) === have) return json({ version: meta.version, unchanged: true });
  }
  return currentCopy(db, 200);
}

export async function onRequestPut({ request, env }) {
  const db = env.DB;
  if (!db) return missingDatabase();
  await ensureSchema(db);

  const baseVersion = Number(request.headers.get("X-Base-Version"));
  if (!Number.isInteger(baseVersion) || baseVersion < 0) return json({ error: "Missing X-Base-Version" }, 400);
  const body = await request.text();
  if (body.length > MAX_CHARS) return json({ error: "The planner data is too large to save." }, 413);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Not planner data" }, 400);

  const chunks = [];
  for (let i = 0; i < body.length; i += CHUNK_CHARS) chunks.push(body.slice(i, i + CHUNK_CHARS));

  // Every statement only takes effect while the stored version is still the
  // one this device started from; the last one moves the version on. As one
  // transaction, either all of it happens or none of it does.
  const statements = chunks.map((chunk, i) =>
    db.prepare("INSERT OR REPLACE INTO petal_chunks (idx, body) SELECT ?1, ?2 WHERE (SELECT version FROM petal_meta WHERE id = 1) = ?3")
      .bind(i, chunk, baseVersion)
  );
  statements.push(
    db.prepare("DELETE FROM petal_chunks WHERE idx >= ?1 AND (SELECT version FROM petal_meta WHERE id = 1) = ?2")
      .bind(chunks.length, baseVersion)
  );
  statements.push(db.prepare("UPDATE petal_meta SET version = version + 1, updated_at = ?1 WHERE id = 1 AND version = ?2").bind(Date.now(), baseVersion));
  const results = await db.batch(statements);
  const updated = results[results.length - 1].meta.changes === 1;

  if (!updated) return currentCopy(db, 409);
  return json({ version: baseVersion + 1 });
}

async function currentCopy(db, status) {
  const [metaResult, chunkResult] = await db.batch([
    db.prepare("SELECT version FROM petal_meta WHERE id = 1"),
    db.prepare("SELECT body FROM petal_chunks ORDER BY idx"),
  ]);
  const version = metaResult.results[0] ? metaResult.results[0].version : 0;
  const data = version > 0 ? chunkResult.results.map((r) => r.body).join("") : "null";
  // the stored text is already JSON, so it goes into the reply as it is rather than
  // being parsed and turned back into text
  return new Response(`{"version":${version},"data":${data}}`, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
