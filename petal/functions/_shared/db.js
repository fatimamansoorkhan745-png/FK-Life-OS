// Shared database helpers for the Petal Planner functions.
//
// Everything lives in one Cloudflare D1 database, bound to the Pages project as
// "DB". The tables are created here on first use, so setting up the database
// needs no SQL typed by hand.
//
//   petal_meta    one row: the version number of the saved planner data
//   petal_chunks  the planner data itself, as one JSON string split into
//                 pieces (a single D1 value is capped at 2 MB, and photos can
//                 make the data bigger than that)
//   petal_kv      small settings: the Google Calendar connection, and failed
//                 sign-in attempts used to slow down password guessing

let schemaReady = false;

export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS petal_meta (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS petal_chunks (idx INTEGER PRIMARY KEY, body TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS petal_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    db.prepare("INSERT OR IGNORE INTO petal_meta (id, version, updated_at) VALUES (1, 0, 0)"),
  ]);
  schemaReady = true;
}

export async function kvGet(db, key) {
  const row = await db.prepare("SELECT value FROM petal_kv WHERE key = ?1").bind(key).first();
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch (e) {
    return null;
  }
}

export async function kvSet(db, key, value) {
  await db.prepare("INSERT OR REPLACE INTO petal_kv (key, value) VALUES (?1, ?2)").bind(key, JSON.stringify(value)).run();
}

export async function kvDelete(db, key) {
  await db.prepare("DELETE FROM petal_kv WHERE key = ?1").bind(key).run();
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Shown instead of a cryptic error when the database binding has not been
// added to the Pages project yet.
export function missingDatabase() {
  return json({ error: "The database is not connected yet. In Cloudflare, add a D1 binding named DB to this Pages project." }, 503);
}
