import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type RuntimeEnv = { DB?: D1Database };

export const STATION_COOKIE = "ktv_master_control";
export const SESSION_SECONDS = 60 * 60 * 12;
export const PASSWORD_ITERATIONS = 210_000;

export function stationDatabase() {
  const db = (env as RuntimeEnv).DB;
  if (!db) throw new Error("Station database is not configured.");
  return db;
}

export async function ensureStationAuthSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS owner_credentials (
      id INTEGER PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      iterations INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS owner_sessions (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS owner_login_attempts (
      fingerprint TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      window_started_at TEXT NOT NULL,
      blocked_until TEXT
    )`),
  ]);
}

export function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return process.env.NODE_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1");
}

export async function isConfiguredOwnerIdentity(request: Request) {
  if (isLocalRequest(request)) return true;
  const user = await getChatGPTUser();
  if (!user) return false;
  const ownerEmail = process.env.PORTFOLIO_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(ownerEmail && user.email.toLowerCase() === ownerEmail);
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function randomHex(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function derivePassword(password: string, saltHex: string, iterations: number) {
  const salt = Uint8Array.from(saltHex.match(/.{1,2}/g) || [], byte => Number.parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function hasMasterControlSession(request: Request, providedDb?: D1Database) {
  const token = cookieValue(request, STATION_COOKIE);
  if (!token || token.length < 32) return false;
  const db = providedDb || stationDatabase();
  await ensureStationAuthSchema(db);
  const tokenHash = await sha256(token);
  const row = await db.prepare("SELECT expires_at FROM owner_sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ expires_at: string }>();
  if (!row) return false;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare("DELETE FROM owner_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return false;
  }
  return true;
}

export function sessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${STATION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${STATION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export async function currentSessionHash(request: Request) {
  const token = cookieValue(request, STATION_COOKIE);
  return token ? sha256(token) : null;
}
