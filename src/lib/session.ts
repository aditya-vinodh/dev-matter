import {
  encodeBase32LowerCaseNoPadding,
  encodeHexLowerCase,
} from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { db } from "../db/index.js";
import { sessionsTable, usersTable } from "../db/schema.js";
import type { User } from "./user.js";
import { eq } from "drizzle-orm";

export function generateSessionToken(): string {
  const tokenBytes = new Uint8Array(20);
  crypto.getRandomValues(tokenBytes);
  const token = encodeBase32LowerCaseNoPadding(tokenBytes).toLowerCase();
  return token;
}

export async function createSession(
  token: string,
  userId: number,
): Promise<Session> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const session: Session = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  };
  await db.insert(sessionsTable).values(session);
  return session;
}

export async function validateSessionToken(
  sessionToken: string,
): Promise<SessionValidationResult> {
  const sessionId = encodeHexLowerCase(
    sha256(new TextEncoder().encode(sessionToken)),
  );
  const [fetchedSession] = await db
    .select({
      sessionId: sessionsTable.id,
      userId: usersTable.id,
      expiresAt: sessionsTable.expiresAt,
      email: usersTable.email,
      name: usersTable.name,
      emailVerified: usersTable.emailVerified,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id));

  if (!fetchedSession) {
    return { user: null, session: null };
  }

  const session: Session = {
    id: fetchedSession.sessionId,
    userId: fetchedSession.userId,
    expiresAt: fetchedSession.expiresAt,
  };

  const user: User = {
    id: fetchedSession.userId,
    email: fetchedSession.email,
    name: fetchedSession.name,
    emailVerified: fetchedSession.emailVerified,
  };

  if (Date.now() >= session.expiresAt.getTime()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    return { session: null, user: null };
  }

  if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await db
      .update(sessionsTable)
      .set({
        expiresAt: session.expiresAt,
      })
      .where(eq(sessionsTable.id, session.id));
  }

  return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
}

export interface Session {
  id: string;
  expiresAt: Date;
  userId: number;
}

type SessionValidationResult =
  | { session: Session; user: User }
  | { session: null; user: null };
