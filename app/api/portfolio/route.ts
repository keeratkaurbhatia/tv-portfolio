import { env } from "cloudflare:workers";
import { hasMasterControlSession } from "@/app/station-auth";

type RuntimeEnv = { DB?: D1Database };

function database() {
  const db = (env as RuntimeEnv).DB;
  if (!db) throw new Error("Portfolio database is not configured.");
  return db;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS portfolio_settings (
    id INTEGER PRIMARY KEY,
    document TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`).run();
}

async function requireOwner(request: Request) {
  return await hasMasterControlSession(request) ? "master-control" : null;
}

export async function GET() {
  try {
    const db = database();
    await ensureSchema(db);
    const row = await db.prepare("SELECT document, updated_at FROM portfolio_settings WHERE id = 1").first<{ document: string; updated_at: string }>();
    return Response.json(row ? { portfolio: JSON.parse(row.document), updatedAt: row.updated_at } : { portfolio: null });
  } catch (error) {
    console.error("Portfolio read failed", error);
    return Response.json({ portfolio: null, unavailable: true });
  }
}

export async function PUT(request: Request) {
  const owner = await requireOwner(request);
  if (!owner) return Response.json({ error: "Owner sign-in required." }, { status: 403 });

  let portfolio: unknown;
  try {
    portfolio = await request.json();
  } catch {
    return Response.json({ error: "Invalid portfolio document." }, { status: 400 });
  }

  if (!portfolio || typeof portfolio !== "object" || !Array.isArray((portfolio as { projects?: unknown }).projects)) {
    return Response.json({ error: "Portfolio projects are required." }, { status: 400 });
  }

  const document = JSON.stringify(portfolio);
  if (document.length > 120_000) return Response.json({ error: "Portfolio document is too large." }, { status: 413 });

  const db = database();
  await ensureSchema(db);
  const updatedAt = new Date().toISOString();
  await db.prepare(`INSERT INTO portfolio_settings (id, document, updated_at, updated_by)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET document = excluded.document, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(document, updatedAt, owner)
    .run();

  return Response.json({ ok: true, updatedAt });
}
