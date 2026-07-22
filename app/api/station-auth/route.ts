import {
  PASSWORD_ITERATIONS,
  SESSION_SECONDS,
  clearSessionCookie,
  canInitializeStation,
  currentSessionHash,
  derivePassword,
  ensureStationAuthSchema,
  hasMasterControlSession,
  hasConfiguredSetupCode,
  randomHex,
  safeEqual,
  sessionCookie,
  sha256,
  stationDatabase,
} from "@/app/station-auth";

type Credentials = { password_hash: string; salt: string; iterations: number };
type Attempt = { attempts: number; window_started_at: string; blocked_until: string | null };

async function credentials(db: D1Database) {
  return db.prepare("SELECT password_hash, salt, iterations FROM owner_credentials WHERE id = 1").first<Credentials>();
}

async function fingerprint(request: Request) {
  const address = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const agent = request.headers.get("user-agent") || "unknown";
  return sha256(`${address.trim()}\n${agent.slice(0, 180)}`);
}

function jsonWithCookie(body: unknown, cookie: string, status = 200) {
  return Response.json(body, { status, headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } });
}

async function createSession(db: D1Database, request: Request) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_SECONDS * 1000);
  await db.prepare("INSERT INTO owner_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, createdAt.toISOString(), expiresAt.toISOString())
    .run();
  return sessionCookie(request, token);
}

export async function GET(request: Request) {
  try {
    const db = stationDatabase();
    await ensureStationAuthSchema(db);
    const configured = Boolean(await credentials(db));
    const authenticated = configured && await hasMasterControlSession(request, db);
    const canInitialize = !configured && (isLocalRequest(request) || hasConfiguredSetupCode());
    return Response.json({ configured, authenticated, canInitialize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Master control status failed", error);
    return Response.json({ error: "Master Control cannot reach the station vault." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: { action?: string; password?: string; setupCode?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Unreadable control instruction." }, { status: 400 });
  }

  const password = body.password || "";
  if (password.length < 10 || password.length > 128) {
    return Response.json({ error: "Use a control phrase between 10 and 128 characters." }, { status: 400 });
  }

  const db = stationDatabase();
  await ensureStationAuthSchema(db);
  const existing = await credentials(db);

  if (body.action === "initialize") {
    if (existing) return Response.json({ error: "Master Control has already been sealed." }, { status: 409 });
    if (!await canInitializeStation(request, body.setupCode || "")) {
      return Response.json({ error: "The station rejected the one-time setup code." }, { status: 403 });
    }
    const salt = randomHex(24);
    const passwordHash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO owner_credentials (id, password_hash, salt, iterations, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)")
      .bind(passwordHash, salt, PASSWORD_ITERATIONS, now, now)
      .run();
    const cookie = await createSession(db, request);
    return jsonWithCookie({ ok: true, configured: true, authenticated: true }, cookie);
  }

  if (body.action !== "login") return Response.json({ error: "Unknown control instruction." }, { status: 400 });
  if (!existing) return Response.json({ error: "Master Control has not been sealed yet." }, { status: 409 });

  const id = await fingerprint(request);
  const attempt = await db.prepare("SELECT attempts, window_started_at, blocked_until FROM owner_login_attempts WHERE fingerprint = ?")
    .bind(id)
    .first<Attempt>();
  const now = Date.now();
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > now) {
    return Response.json({ error: "Too many incorrect phrases. The control room has sealed itself for fifteen minutes." }, { status: 429 });
  }

  const candidate = await derivePassword(password, existing.salt, existing.iterations);
  if (!safeEqual(candidate, existing.password_hash)) {
    const windowStart = attempt && now - Date.parse(attempt.window_started_at) < 15 * 60_000 ? attempt.window_started_at : new Date(now).toISOString();
    const attempts = attempt && windowStart === attempt.window_started_at ? attempt.attempts + 1 : 1;
    const blockedUntil = attempts >= 5 ? new Date(now + 15 * 60_000).toISOString() : null;
    await db.prepare(`INSERT INTO owner_login_attempts (fingerprint, attempts, window_started_at, blocked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET attempts = excluded.attempts, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until`)
      .bind(id, attempts, windowStart, blockedUntil)
      .run();
    return Response.json({ error: blockedUntil ? "Incorrect phrase. Master Control is now sealed for fifteen minutes." : "The station rejected that control phrase." }, { status: 403 });
  }

  await db.prepare("DELETE FROM owner_login_attempts WHERE fingerprint = ?").bind(id).run();
  await db.prepare("DELETE FROM owner_sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();
  const cookie = await createSession(db, request);
  return jsonWithCookie({ ok: true, configured: true, authenticated: true }, cookie);
}

export async function DELETE(request: Request) {
  const db = stationDatabase();
  await ensureStationAuthSchema(db);
  const hash = await currentSessionHash(request);
  if (hash) await db.prepare("DELETE FROM owner_sessions WHERE token_hash = ?").bind(hash).run();
  return jsonWithCookie({ ok: true }, clearSessionCookie(request));
}
