import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
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
  emailVerificationRequestsTable,
  formResponsesTable,
  formsTable,
  formVersionsTable,
  secretKeysTable,
  usersTable,
} from "./db/schema.js";
import { and, desc, eq, sql } from "drizzle-orm";
import auth from "./routes/auth.js";
import apps from "./routes/apps.js";
import forms from "./routes/forms.js";
import secretKeys from "./routes/secret-keys.js";
import checkout from "./routes/checkout.js";
import { hashSecretKey } from "./lib/secret-key.js";
import z from "zod";
import { zValidator } from "@hono/zod-validator";
import { getMessaging } from "firebase-admin/messaging";
import { firebaseApp } from "./lib/firebase.js";
import {
  createEmailVerificationRequest,
  sendVerificationEmail,
} from "./lib/email-verification.js";
import { hashPassword } from "./lib/password.js";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

// check if test user exists
let [testUser] = await db
  .select()
  .from(usersTable)
  .where(eq(usersTable.email, "test@devmatter.app"));
if (!testUser) {
  [testUser] = await db
    .insert(usersTable)
    .values({
      email: "test@devmatter.app",
      name: "Test User",
      passwordHash: await hashPassword("testpass123*"),
      pricingPlan: "free",
      emailVerified: true,
    })
    .returning();
}

let [testApp] = await db
  .select()
  .from(appsTable)
  .where(eq(appsTable.userId, testUser.id));
if (!testApp) {
  [testApp] = await db
    .insert(appsTable)
    .values({
      name: "Test App",
      url: "https://test.devmatter.app",
      userId: testUser.id,
    })
    .returning();
}

app.use("/*", cors());

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
      redirectOnSubmit: formsTable.redirectOnSubmit,
      successUrl: formsTable.successUrl,
      failureUrl: formsTable.failureUrl,
      app: {
        id: appsTable.id,
        name: appsTable.name,
        url: appsTable.url,
        userId: appsTable.userId,
      },
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

  const defaultFailureUrl = "https://devmatter.app/forms/failure";

  if (!form.public) {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      if (form.redirectOnSubmit) {
        return c.redirect(
          `${form.failureUrl || defaultFailureUrl}?error=unauthorized`,
          303,
        );
      } else {
        c.status(401);
        return c.json({
          error: "unauthorized",
          message:
            "This is a private form. You need to pass the secret key in the Authorization header using Bearer scheme",
        });
      }
    }

    const authHeaderParts = authHeader.split(" ");
    if (authHeaderParts.length !== 2) {
      if (form.redirectOnSubmit) {
        return c.redirect(
          `${form.failureUrl || defaultFailureUrl}?error=invalid_header`,
          303,
        );
      } else {
        c.status(401);
        return c.json({
          error: "unauthorized",
          message:
            "Authorization header must contain secret key with Bearer scheme",
        });
      }
    }

    const key = authHeaderParts[1];
    const hashedKey = hashSecretKey(key);
    const [secretKey] = await db
      .select()
      .from(secretKeysTable)
      .where(eq(secretKeysTable.hash, hashedKey));
    if (!secretKey) {
      if (form.redirectOnSubmit) {
        return c.redirect(
          `${form.failureUrl || defaultFailureUrl}?error=invalid_key`,
          303,
        );
      } else {
        c.status(403);
        return c.json({
          error: "forbidden",
          message: "Invalid secret key",
        });
      }
    }

    if (secretKey.appId !== form.app.id) {
      if (form.redirectOnSubmit) {
        return c.redirect(
          `${form.failureUrl || defaultFailureUrl}?error=invalid_app`,
          303,
        );
      } else {
        c.status(403);
        return c.json({
          error: "forbidden",
          message: "Invalid secret key",
        });
      }
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
    if (form.redirectOnSubmit) {
      return c.redirect(
        `${form.failureUrl || defaultFailureUrl}?error=invalid_schema`,
        303,
      );
    } else {
      c.status(500);
      return c.json({
        error: "internal-server-error",
        message:
          "Schema data is corrupted. We could not process this form. Please contact support.",
      });
    }
  }

  let response;
  if (
    contentType === "application/json" ||
    contentType === "application/x-www-form-urlencoded" ||
    contentType?.startsWith("multipart/form-data")
  ) {
    if (contentType === "application/json") {
      const body = await c.req.json();
      response = body;
    } else {
      const body = await c.req.parseBody();
      response = body;
    }

    for (const [key, _] of Object.entries(response)) {
      if (!fields.find((field) => field.id === key)) {
        if (form.redirectOnSubmit) {
          return c.redirect(
            `${form.failureUrl || defaultFailureUrl}?error=invalid_field`,
            303,
          );
        } else {
          c.status(400);
          return c.json({
            error: "invalid-submission",
            message: "Does not match schema",
          });
        }
      }
    }
    for (const field of fields.filter((field) => field.required === true)) {
      const reqEntries = Object.entries(response);
      const foundEntry = reqEntries.find((entry) => entry[0] === field.id);
      if (!foundEntry || typeof foundEntry[1] !== field.type) {
        if (form.redirectOnSubmit) {
          return c.redirect(
            `${form.failureUrl || defaultFailureUrl}?error=invalid_type`,
            303,
          );
        } else {
          c.status(400);
          return c.json({
            error: "invalid-submission",
            message: "Does not match schema",
          });
        }
      }
    }
  } else {
    c.status(400);
    if (form.redirectOnSubmit) {
      return c.redirect(
        `${form.failureUrl || defaultFailureUrl}?error=unsupported_content_type`,
        303,
      );
    } else {
      return c.json({
        error: "unsupported-content-type",
        message:
          "We currently support only application/json, multipart/form-data, and application/x-www-form-urlencoded",
      });
    }
  }

  const [newResponse] = await db
    .insert(formResponsesTable)
    .values({
      formVersionId: formVersion.id,
      response: { ...response },
    })
    .returning();

  await db
    .update(formsTable)
    .set({
      responseCount: sql`${formsTable.responseCount} + 1`,
    })
    .where(eq(formsTable.id, form.id));

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
    data: {
      appId: String(form.app.id),
      appName: form.app.name,
      appUrl: form.app.url,
      formId: String(form.id),
      formName: form.name,
      formPublic: form.public ? "true" : "false",
      responseId: String(newResponse.id),
    },
    tokens: fcmTokens,
  };

  if (ownerDevices.length > 0) {
    await getMessaging(firebaseApp).sendEachForMulticast(message);
  }

  if (!form.redirectOnSubmit) {
    return c.json({
      responseId: newResponse.id,
    });
  } else {
    let redirectUrl = form.successUrl || "https://devmatter.app/forms/success";
    
    // Replace @placeholders with actual values from the response
    if (form.successUrl && response) {
      for (const [key, value] of Object.entries(response)) {
        const placeholder = `@${key}`;
        if (redirectUrl.includes(placeholder)) {
          redirectUrl = redirectUrl.replace(new RegExp(placeholder, 'g'), encodeURIComponent(String(value)));
        }
      }
    }
    
    return c.redirect(redirectUrl, 303);
  }
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
app.route("/", checkout);

app.post(
  "/verify-email",
  zValidator("json", z.object({ code: z.string() })),
  async (c) => {
    const user = c.get("user");
    const { code } = c.req.valid("json");

    const [emailVerificationRequest] = await db
      .select()
      .from(emailVerificationRequestsTable)
      .where(eq(emailVerificationRequestsTable.userId, user.id))
      .limit(1);
    if (!emailVerificationRequest) {
      c.status(404);
      return c.json({
        error: "not-found",
        message: "Email verification request not found",
      });
    }

    if (emailVerificationRequest.code !== code) {
      c.status(400);
      return c.json({
        error: "invalid-code",
        message: "Invalid verification code",
      });
    }

    if (emailVerificationRequest.expiresAt.getTime() < Date.now()) {
      c.status(400);
      return c.json({
        error: "expired-code",
        message: "Email verification code has expired",
      });
    }

    await db
      .update(usersTable)
      .set({
        emailVerified: true,
      })
      .where(eq(usersTable.id, user.id));

    await db
      .delete(emailVerificationRequestsTable)
      .where(
        eq(emailVerificationRequestsTable.id, emailVerificationRequest.id),
      );

    c.status(200);
    return c.json({
      message: "Email verified",
    });
  },
);

app.post("/verify-email/resend", async (c) => {
  const user = c.get("user");

  const [emailVerificationRequest] = await db
    .select()
    .from(emailVerificationRequestsTable)
    .where(eq(emailVerificationRequestsTable.userId, user.id));

  if (!emailVerificationRequest) {
    c.status(404);
    return c.json({
      error: "request-not-found",
      message:
        "No email verification request found for this user. Please request a new one.",
    });
  }

  await db
    .delete(emailVerificationRequestsTable)
    .where(eq(emailVerificationRequestsTable.id, emailVerificationRequest.id));

  const newEmailVerificationRequest = await createEmailVerificationRequest(
    user.id,
    emailVerificationRequest.email,
  );
  await sendVerificationEmail(
    emailVerificationRequest.email,
    newEmailVerificationRequest.code,
  );

  return c.json({
    message: "Email verification request resent",
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
