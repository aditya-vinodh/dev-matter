import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { type User } from "./lib/user.js";
import {
  invalidateSession,
  validateSessionToken,
  type Session,
} from "./lib/session.js";
import { db } from "./db/index.js";
import {
  appsTable,
  formResponsesTable,
  formsTable,
  formVersionsTable,
} from "./db/schema.js";
import { desc, eq } from "drizzle-orm";
import auth from "./routes/auth.js";
import apps from "./routes/apps.js";
import forms from "./routes/forms.js";
import secretKeys from "./routes/secret-keys.js";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("/", auth);

// Auth middleware
app.use(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    c.status(401);
    return c.json({
      error: "unauthorized",
      message: "Authorization header is required",
    });
  }

  const authHeaderParts = authHeader.split(" ");
  if (authHeaderParts.length < 2) {
    c.status(401);
    return c.json({
      error: "unauthorized",
      message: "Authorization header required with Bearer scheme",
    });
  }

  const token = authHeaderParts[1];
  const { session, user } = await validateSessionToken(token);
  if (!session || !user) {
    c.status(401);
    return c.json({
      error: "unauthorized",
      message: "Session is not valid",
    });
  }

  c.set("user", user);
  c.set("session", session);

  await next();
});

app.route("/", apps);
app.route("/", forms);
app.route("/", secretKeys);

// Submit form
app.post("forms/:formId", async (c) => {
  const contentType = c.req.header("Content-Type");

  const formId = parseInt(c.req.param("formId"));
  const user = c.get("user");

  const [form] = await db
    .select({
      id: formsTable.id,
      public: formsTable.public,
      app: { id: appsTable.id, userId: appsTable.userId },
    })
    .from(formsTable)
    .where(eq(formsTable.id, formId))
    .innerJoin(appsTable, eq(appsTable.id, formsTable.appId));
  if (!form) {
    c.status(404);
    return c.json({
      error: "not-found",
      message: "Form not found",
    });
  }

  if (form.app.userId !== user.id) {
    c.status(403);
    return c.json({
      error: "forbidden",
      message: "You are not allowed to access this form",
    });
  }

  if (!form.public) {
    c.status(401);
    return c.json({
      error: "unauthorized",
      message: "This form is private",
    });
  }

  const [formVersion] = await db
    .select()
    .from(formVersionsTable)
    .where(eq(formVersionsTable.formId, formId))
    .orderBy(desc(formVersionsTable.createdAt))
    .limit(1);

  let response;
  if (contentType === "application/json") {
    const body = await c.req.json();
    response = body;

    for (const [key, value] of Object.entries(body)) {
      if (!formVersion.fields.find((field) => field.id === key)) {
        c.status(400);
        return c.json({
          error: "invalid-submission",
          message: "Does not match schema",
        });
      }
    }
    for (const field of formVersion.fields.filter(
      (field) => field.required === true,
    )) {
      const reqEntries = Object.entries(body);
      const foundEntry = reqEntries.find((entry) => entry[0] === field.id);
      if (!foundEntry || typeof foundEntry[1] !== field.type) {
        c.status(400);
        return c.json({
          error: "invalid-submission",
          message: "Does not match schema",
        });
      }
    }
  } else {
    c.status(400);
    return c.json({
      error: "unsupported-content-type",
      message: "We currently support only application/json.",
    });
  }

  await db.insert(formResponsesTable).values({
    formVersionId: formVersion.id,
    response,
  });

  return c.json({
    message: "success",
  });
});

app.post("/sessions/validate", async (c) => {
  const user = c.get("user");
  const session = c.get("session");
  return c.json({
    user,
    session,
  });
});

app.post("/sessions/invalidate", async (c) => {
  const session = c.get("session");
  await invalidateSession(session.id);
  return c.json({
    message: "Session was invalidated",
  });
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
