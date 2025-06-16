import { Hono } from "hono";
import type { User } from "../lib/user.js";
import type { Session } from "../lib/session.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/index.js";
import { appsTable, secretKeysTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateSecretKey, hashSecretKey } from "../lib/secret-key.js";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

app.post(
  "/apps/:appId/secret-keys",
  zValidator("json", z.object({ name: z.string().min(1) })),
  async (c) => {
    const user = c.get("user");
    const appId = parseInt(c.req.param("appId"));
    const { name } = c.req.valid("json");

    const [app] = await db
      .select()
      .from(appsTable)
      .where(eq(appsTable.id, appId));
    if (!app) {
      c.status(404);
      return c.json({
        error: "not-found",
        message: "App not found",
      });
    }

    if (app.userId !== user.id) {
      c.status(403);
      return c.json({
        error: "forbidden",
        message: "You are not allowed to access this app",
      });
    }

    const key = generateSecretKey();
    const hash = hashSecretKey(key);

    const [newKey] = await db
      .insert(secretKeysTable)
      .values({
        appId,
        name,
        hash,
      })
      .returning();

    return c.json({
      key,
      id: newKey.id,
    });
  },
);

app.delete("/secret-keys/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const user = c.get("user");

  const [secretKey] = await db
    .select()
    .from(secretKeysTable)
    .where(eq(secretKeysTable.id, id))
    .innerJoin(appsTable, eq(appsTable.id, secretKeysTable.appId));

  if (!secretKey) {
    c.status(404);
    return c.json({
      error: "not-found",
      message: "Secret key not found",
    });
  }

  if (secretKey.apps.userId !== user.id) {
    c.status(403);
    return c.json({
      error: "forbidden",
      message: "You are not allowed to access this app",
    });
  }

  await db.delete(secretKeysTable).where(eq(secretKeysTable.id, id));

  return c.json({
    message: "Successfully revoked the secret key",
  });
});

export default app;
