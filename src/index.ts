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
  devicesTable,
  formResponsesTable,
  formsTable,
  formVersionsTable,
  secretKeysTable,
} from "./db/schema.js";
import { and, desc, eq } from "drizzle-orm";
import auth from "./routes/auth.js";
import apps from "./routes/apps.js";
import forms from "./routes/forms.js";
import secretKeys from "./routes/secret-keys.js";
import { hashSecretKey } from "./lib/secret-key.js";
import z from "zod";
import { zValidator } from "@hono/zod-validator";
import { getMessaging } from "firebase-admin/messaging";
import { firebaseApp } from "./lib/firebase.js";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("/", auth);

// Submit form
app.post("forms/:formId", async (c) => {
  const contentType = c.req.header("Content-Type");

  const formId = parseInt(c.req.param("formId"));

  const [form] = await db
    .select({
      id: formsTable.id,
      public: formsTable.public,
      name: formsTable.name,
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

  if (!form.public) {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      c.status(401);
      return c.json({
        error: "unauthorized",
        message:
          "This is a private form. You need to pass the secret key in the Authorization header using Bearer scheme",
      });
    }

    const authHeaderParts = authHeader.split(" ");
    if (authHeaderParts.length !== 2) {
      c.status(401);
      return c.json({
        error: "unauthorized",
        message:
          "Authorization header must contain secret key with Bearer scheme",
      });
    }

    const key = authHeaderParts[1];
    const hashedKey = hashSecretKey(key);
    const [secretKey] = await db
      .select()
      .from(secretKeysTable)
      .where(eq(secretKeysTable.hash, hashedKey));
    if (!secretKey) {
      c.status(403);
      return c.json({
        error: "forbidden",
        message: "Invalid secret key",
      });
    }

    if (secretKey.appId !== form.app.id) {
      c.status(403);
      return c.json({
        error: "forbidden",
        message: "Invalid secret key",
      });
    }
  }

  const [formVersion] = await db
    .select()
    .from(formVersionsTable)
    .where(eq(formVersionsTable.formId, formId))
    .orderBy(desc(formVersionsTable.createdAt))
    .limit(1);

  const fieldsSchema = z.array(
    z.object({
      type: z.string(),
      id: z.string(),
      required: z.boolean(),
      label: z.string(),
    }),
  );

  let fields;
  try {
    fields = fieldsSchema.parse(formVersion.fields);
  } catch {
    c.status(500);
    return c.json({
      error: "internal-server-error",
      message:
        "Schema data is corrupted. We could not process this form. Please contact support.",
    });
  }

  let response;
  if (contentType === "application/json") {
    const body = await c.req.json();
    response = body;

    for (const [key, _] of Object.entries(body)) {
      if (!fields.find((field) => field.id === key)) {
        c.status(400);
        return c.json({
          error: "invalid-submission",
          message: "Does not match schema",
        });
      }
    }
    for (const field of fields.filter((field) => field.required === true)) {
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

  const ownerDevices = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.userId, form.app.userId));
  const fcmTokens = ownerDevices.map((device) => device.fcmToken);
  const message = {
    notification: {
      title: "New Form Submission",
      body: `A new form submission has been received for ${form.name}.`,
    },
    tokens: fcmTokens,
  };

  await getMessaging(firebaseApp).sendEachForMulticast(message);

  return c.json({
    message: "success",
  });
});

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

app.post(
  "/fcm-registration",
  zValidator(
    "json",
    z.object({ token: z.string(), deviceId: z.string(), platform: z.string() }),
  ),
  async (c) => {
    const user = c.get("user");
    const { token, deviceId, platform } = c.req.valid("json");

    const [existingDevice] = await db
      .select()
      .from(devicesTable)
      .where(
        and(eq(devicesTable.id, deviceId), eq(devicesTable.userId, user.id)),
      );
    if (!existingDevice) {
      await db.insert(devicesTable).values({
        id: deviceId,
        userId: user.id,
        fcmToken: token,
        platform: platform,
      });
    } else {
      await db
        .update(devicesTable)
        .set({ fcmToken: token })
        .where(
          and(eq(devicesTable.id, deviceId), eq(devicesTable.userId, user.id)),
        );
    }

    return c.json({
      message: "FCM registration updated",
    });
  },
);

app.route("/", apps);
app.route("/", forms);
app.route("/", secretKeys);

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
