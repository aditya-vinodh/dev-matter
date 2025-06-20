import { Hono } from "hono";
import type { User } from "../lib/user.js";
import type { Session } from "../lib/session.js";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { db } from "../db/index.js";
import {
  appsTable,
  formResponsesTable,
  formsTable,
  formVersionsTable,
} from "../db/schema.js";
import { eq, inArray, desc, and } from "drizzle-orm";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

app.post(
  "/forms",
  zValidator("json", z.object({ appId: z.number().int() })),
  async (c) => {
    const { appId } = c.req.valid("json");
    const user = c.get("user");

    const [app] = await db
      .select()
      .from(appsTable)
      .where(eq(appsTable.id, appId));

    if (!app) {
      c.status(404);
      return c.json({ error: "not-found", message: "App not found" });
    }

    if (app.userId !== user.id) {
      c.status(403);
      return c.json({
        error: "forbidden",
        message: "You are not allowed to access this app",
      });
    }

    const [form] = await db
      .insert(formsTable)
      .values({
        name: "Untitled form",
        appId,
        public: false,
      })
      .returning();

    const [formVersion] = await db
      .insert(formVersionsTable)
      .values({
        formId: form.id,
        versionNumber: 1,
        fields: [
          {
            type: "string",
            label: "Full name",
            id: "full-name",
            required: true,
          },
        ],
      })
      .returning();

    return c.json({ ...form, versions: [formVersion] });
  },
);

app.get("/forms/:formId", async (c) => {
  const formId = parseInt(c.req.param("formId"));
  const user = c.get("user");

  const page = parseInt(c.req.query("page") as string) || 1;
  const limit = parseInt(c.req.query("limit") as string) || 50;
  const archived = c.req.query("archived") == "true";

  const [form] = await db
    .select({
      id: formsTable.id,
      name: formsTable.name,
      public: formsTable.public,
      appId: formsTable.appId,
      responseCount: formsTable.responseCount,
      app: {
        id: appsTable.id,
        name: appsTable.name,
        userId: appsTable.userId,
        url: appsTable.url,
      },
    })
    .from(formsTable)
    .where(eq(formsTable.id, formId))
    .innerJoin(appsTable, eq(appsTable.id, formsTable.appId));
  if (!form) {
    c.status(404);
    return c.json({ error: "not-found", message: "Form not found" });
  }

  if (form.app.userId !== user.id) {
    c.status(403);
    return c.json({
      error: "forbidden",
      message: "You are not allowed to access this form",
    });
  }

  const formVersions = await db
    .select()
    .from(formVersionsTable)
    .where(eq(formVersionsTable.formId, formId));

  const formResponses = await db
    .select()
    .from(formResponsesTable)
    .where(
      and(
        inArray(
          formResponsesTable.formVersionId,
          formVersions.map((version) => version.id),
        ),
        eq(formResponsesTable.archived, archived),
      ),
    )
    .orderBy(desc(formResponsesTable.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return c.json({ ...form, versions: formVersions, responses: formResponses });
});

app.patch(
  "/forms/:formId",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).optional(),
      public: z.boolean().optional(),
      fields: z
        .array(
          z.object({
            id: z.string().min(1),
            type: z.enum(["string", "number"]),
            label: z.string().min(1),
            required: z.union([z.string(), z.boolean()]).optional(),
          }),
        )
        .min(1)
        .optional(),
    }),
  ),
  async (c) => {
    const formId = parseInt(c.req.param("formId"));
    const user = c.get("user");

    const [form] = await db
      .select({
        id: formsTable.id,
        name: formsTable.name,
        public: formsTable.public,
        appId: formsTable.appId,
        app: {
          id: appsTable.id,
          name: appsTable.name,
          userId: appsTable.userId,
          url: appsTable.url,
        },
      })
      .from(formsTable)
      .where(eq(formsTable.id, formId))
      .innerJoin(appsTable, eq(appsTable.id, formsTable.appId));
    if (!form) {
      c.status(404);
      return c.json({ error: "not-found", message: "Form not found" });
    }

    if (form.app.userId !== user.id) {
      c.status(403);
      return c.json({
        error: "forbidden",
        message: "You are not allowed to access this form",
      });
    }

    const { name, fields } = c.req.valid("json");
    const isPublic = c.req.valid("json").public;

    if (fields) {
      // Check for duplicate field IDs
      const fieldIds = fields.map((field) => field.id);
      const uniqueFieldIds = new Set(fieldIds);
      if (fieldIds.length !== uniqueFieldIds.size) {
        c.status(400);
        return c.json({
          error: "duplicate-field-ids",
          message: "Each field must have a unique ID",
        });
      }

      const [latestVersion] = await db
        .select()
        .from(formVersionsTable)
        .where(eq(formVersionsTable.formId, formId))
        .orderBy(desc(formVersionsTable.createdAt))
        .limit(1);
      const [latestResponse] = await db
        .select()
        .from(formResponsesTable)
        .where(eq(formResponsesTable.formVersionId, latestVersion.id))
        .limit(1);

      if (latestResponse) {
        await db.insert(formVersionsTable).values({
          versionNumber: latestVersion.versionNumber + 1,
          formId,
          fields: fields.map((field) => {
            if (!field.hasOwnProperty("required")) {
              return {
                ...field,
                required: false,
              };
            } else {
              return {
                ...field,
                required: true,
              };
            }
          }),
        });
      } else {
        await db
          .update(formVersionsTable)
          .set({
            fields: fields.map((field) => {
              if (!field.hasOwnProperty("required")) {
                return {
                  ...field,
                  required: false,
                };
              } else {
                return {
                  ...field,
                  required:
                    field.required === "false" || field.required === false
                      ? false
                      : true,
                };
              }
            }),
          })
          .where(eq(formVersionsTable.id, latestVersion.id));
      }
    }

    if (name !== undefined || isPublic !== undefined) {
      await db
        .update(formsTable)
        .set({
          name,
          public: isPublic,
        })
        .where(eq(formsTable.id, formId));
    }

    return c.json({
      message: "Form updated succesfully",
    });
  },
);

app.patch(
  "/responses/:responseId",
  zValidator("json", z.object({ archived: z.boolean().optional() })),
  async (c) => {
    const responseId = parseInt(c.req.param("responseId"));
    const { archived } = c.req.valid("json");

    const user = c.get("user");

    const [response] = await db
      .select({
        form: formsTable,
        version: formVersionsTable,
        response: formResponsesTable,
        app: appsTable,
      })
      .from(formResponsesTable)
      .where(eq(formResponsesTable.id, responseId))
      .innerJoin(
        formVersionsTable,
        eq(formVersionsTable.id, formResponsesTable.formVersionId),
      )
      .innerJoin(formsTable, eq(formsTable.id, formVersionsTable.formId))
      .innerJoin(appsTable, eq(appsTable.id, formsTable.appId))
      .limit(1);

    if (!response) {
      c.status(404);
      return c.json({
        error: "not-found",
        message: "Response not found",
      });
    }

    if (response.app.userId !== user.id) {
      c.status(403);
      return c.json({
        error: "forbidden",
        message: "You are not authorized to access this resource",
      });
    }

    if (archived !== undefined) {
      await db
        .update(formResponsesTable)
        .set({
          archived,
        })
        .where(eq(formResponsesTable.id, responseId));
    }

    return c.json({
      message: "Response updated succesfully",
    });
  },
);

app.delete("/responses/:responseId", async (c) => {
  const responseId = parseInt(c.req.param("responseId"));
  const user = c.get("user");

  const [response] = await db
    .select({
      form: formsTable,
      version: formVersionsTable,
      response: formResponsesTable,
      app: appsTable,
    })
    .from(formResponsesTable)
    .where(eq(formResponsesTable.id, responseId))
    .innerJoin(
      formVersionsTable,
      eq(formVersionsTable.id, formResponsesTable.formVersionId),
    )
    .innerJoin(formsTable, eq(formsTable.id, formVersionsTable.formId))
    .innerJoin(appsTable, eq(appsTable.id, formsTable.appId))
    .limit(1);

  if (!response) {
    c.status(404);
    return c.json({
      error: "not-found",
      message: "Response not found",
    });
  }

  if (response.app.userId !== user.id) {
    c.status(403);
    return c.json({
      error: "forbidden",
      message: "You are not authorized to access this resource",
    });
  }

  await db
    .delete(formResponsesTable)
    .where(eq(formResponsesTable.id, responseId));

  return c.json({
    message: "Response deleted succesfully",
  });
});

export default app;
