import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { usersTable } from "../db/schema.js";
import { hashPassword } from "./password.js";

export async function createUser(
  email: string,
  password: string | null,
  name: string,
  googleId?: string,
  emailVerified: boolean = false,
): Promise<User> {
  let passwordHash = null;
  if (password) {
    passwordHash = await hashPassword(password);
  }
  const [newUser] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      name,
      emailVerified,
      googleId: googleId ?? null,
    })
    .returning();

  return {
    id: newUser.id,
    email,
    name,
    emailVerified,
    googleId: newUser.googleId,
  };
}

export async function getUserFromEmail(
  email: string,
): Promise<User | undefined> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      emailVerified: usersTable.emailVerified,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  return user;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      emailVerified: usersTable.emailVerified,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  return user;
}

export async function getUserByGoogleId(
  googleId: string,
): Promise<User | undefined> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      emailVerified: usersTable.emailVerified,
    })
    .from(usersTable)
    .where(eq(usersTable.googleId, googleId));
  return user;
}

export async function getUserByGithubId(
  githubId: string,
): Promise<User | undefined> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      emailVerified: usersTable.emailVerified,
    })
    .from(usersTable)
    .where(eq(usersTable.githubId, githubId));
  return user;
}

export async function getUserByGithubUsername(
  githubUsername: string,
): Promise<User | undefined> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      emailVerified: usersTable.emailVerified,
    })
    .from(usersTable)
    .where(eq(usersTable.githubUsername, githubUsername));
  return user;
}

export async function getUserPasswordHash(id: number): Promise<string | null> {
  const [user] = await db
    .select({
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  return user.passwordHash;
}

export async function updateUserPassword(
  id: number,
  newPassword: string,
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, id));
}

export async function addUserGoogleId(
  id: number,
  googleId: string,
): Promise<void> {
  await db.update(usersTable).set({ googleId }).where(eq(usersTable.id, id));
}

export async function addUserGithubId(
  id: number,
  githubId: string,
): Promise<void> {
  await db.update(usersTable).set({ githubId }).where(eq(usersTable.id, id));
}

export interface User {
  id: number;
  email: string;
  name: string;
  emailVerified: boolean;
  googleId?: string | null;
  githubId?: string | null;
}
