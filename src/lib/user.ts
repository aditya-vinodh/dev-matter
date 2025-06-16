import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { usersTable } from "../db/schema.js";
import { hashPassword } from "./password.js";

export async function createUser(
  email: string,
  password: string,
  name: string,
): Promise<User> {
  const passwordHash = await hashPassword(password);
  const [newUser] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      name,
      emailVerified: false,
    })
    .returning();

  return {
    id: newUser.id,
    email,
    name,
    emailVerified: false,
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

export async function getUserPasswordHash(id: number): Promise<string | null> {
  const [user] = await db
    .select({
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id));
  return user.passwordHash;
}

export interface User {
  id: number;
  email: string;
  name: string;
  emailVerified: boolean;
}
