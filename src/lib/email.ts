import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { usersTable } from "../db/schema.js";

export async function checkEmailAvailability(email: string): Promise<boolean> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (!user) {
    return true;
  }
  return false;
}
