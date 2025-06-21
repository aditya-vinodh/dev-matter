import { Hono } from "hono";
import type { User } from "../lib/user.js";
import type { Session } from "../lib/session.js";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { appsTable, formsTable, secretKeysTable } from "../db/schema.js";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

app.post(
  "/apps",
  zValidator(
    "json",
    z.object({ name: z.string().min(1), url: z.string().url() }),
  ),
  async (c) => {
    const user = c.get("user");
    const { name, url } = c.req.valid("json");

    const [app] = await db
      .insert(appsTable)
      .values({
        userId: user.id,
        name,
        url,
      })
      .returning();

    return c.json(app);
  },
);

app.get("/apps", async (c) => {
  const user = c.get("user");
  const apps = await db
    .select()
    .from(appsTable)
    .where(eq(appsTable.userId, user.id));
  return c.json(apps);
});

app.delete("/apps/:id", async (c) => {
  const appId = parseInt(c.req.param("id"));
  const user = c.get("user");

  const [app] = await db
    .select()
    .from(appsTable)
    .where(eq(appsTable.id, appId));
  if (!app) {
    c.status(404);
    return c.json({ error: "not-found", message: "Could not find this app" });
  }

  if (app.userId !== user.id) {
    c.status(403);
    return c.json({
      error: "forbidden",
      message: "You are not allowed to delete this app.",
    });
  }

  await db.delete(appsTable).where(eq(appsTable.id, appId));
  return c.json({
    message: "App was deleted succesfully",
  });
});

app.get("/apps/:id", async (c) => {
  const appId = parseInt(c.req.param("id"));
  const user = c.get("user");

  const [app] = await db
    .select()
    .from(appsTable)
    .where(eq(appsTable.id, appId));
  if (!app) {
    c.status(404);
    return c.json({ error: "not-found", message: "Could not find this app" });
  }

  if (app.userId !== user.id) {
    c.status(403);
    return c.json({
      error: "forbidden",
      message: "You are not allowed to delete this app.",
    });
  }

  const forms = await db
    .select({
      id: formsTable.id,
      name: formsTable.name,
      public: formsTable.public,
    })
    .from(formsTable)
    .where(eq(formsTable.appId, appId));

  const secretKeys = await db
    .select({
      id: secretKeysTable.id,
      name: secretKeysTable.name,
      createdAt: secretKeysTable.createdAt,
    })
    .from(secretKeysTable)
    .where(eq(secretKeysTable.appId, appId));

  return c.json({ ...app, forms, secretKeys });
});

app.put(
  "/apps/:id",
  zValidator(
    "json",
    z.object({ name: z.string().min(1), url: z.string().url() }),
  ),
  async (c) => {
    const appId = parseInt(c.req.param("id"));
    const user = c.get("user");

    const [app] = await db
      .select()
      .from(appsTable)
      .where(eq(appsTable.id, appId));
    if (!app) {
      c.status(404);
      return c.json({ error: "not-found", message: "Could not find this app" });
    }

    if (app.userId !== user.id) {
      c.status(403);
      return c.json({
        error: "forbidden",
        message: "You are not allowed to delete this app.",
      });
    }

    const { name, url } = c.req.valid("json");

    await db
      .update(appsTable)
      .set({ name, url })
      .where(eq(appsTable.id, appId));

    return c.json({ message: "App updated successfully" });
  },
);

export default app;
