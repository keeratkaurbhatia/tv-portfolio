import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const portfolioSettings = sqliteTable("portfolio_settings", {
  id: integer("id").primaryKey(),
  document: text("document").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const ownerCredentials = sqliteTable("owner_credentials", {
  id: integer("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  iterations: integer("iterations").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const ownerSessions = sqliteTable("owner_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const ownerLoginAttempts = sqliteTable("owner_login_attempts", {
  fingerprint: text("fingerprint").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
  blockedUntil: text("blocked_until"),
});
