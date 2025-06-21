import {
  boolean,
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: varchar({ length: 255 }),
  emailVerified: boolean().notNull().default(false),
});

export const sessionsTable = pgTable("sessions", {
  id: varchar({ length: 255 }).primaryKey(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  expiresAt: timestamp().notNull(),
});

export const emailVerificationRequestsTable = pgTable(
  "email_verification_requests",
  {
    id: varchar({ length: 255 }).primaryKey(),
    userId: integer()
      .notNull()
      .references(() => usersTable.id),
    email: varchar({ length: 255 }).notNull(),
    code: varchar({ length: 255 }).notNull(),
    expiresAt: timestamp().notNull(),
  },
);

export const appsTable = pgTable("apps", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  name: varchar({ length: 255 }).notNull(),
  url: varchar({ length: 255 }).notNull(),
});

export const secretKeysTable = pgTable("secret_keys", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  appId: integer()
    .notNull()
    .references(() => appsTable.id, { onDelete: "cascade" }),
  name: varchar({ length: 255 }).notNull(),
  hash: varchar({ length: 255 }).notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const formsTable = pgTable("forms", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  appId: integer()
    .notNull()
    .references(() => appsTable.id, { onDelete: "cascade" }),
  public: boolean().notNull().default(false),
  responseCount: integer().notNull().default(0),
});

export const formVersionsTable = pgTable("form_versions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  versionNumber: integer().notNull(),
  formId: integer()
    .notNull()
    .references(() => formsTable.id, { onDelete: "cascade" }),
  fields: jsonb().notNull().default([]),
  createdAt: timestamp().defaultNow(),
});

export const formResponsesTable = pgTable("form_responses", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  formVersionId: integer()
    .notNull()
    .references(() => formVersionsTable.id, { onDelete: "cascade" }),
  respondentId: varchar({ length: 255 }),
  archived: boolean().notNull().default(false),
  response: jsonb().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const respondentsTable = pgTable("respondents", {
  id: varchar({ length: 255 }).primaryKey(),
  firstName: varchar({ length: 255 }),
  lastName: varchar({ length: 255 }),
  email: varchar({ length: 255 }),
});

export const devicesTable = pgTable("devices", {
  id: varchar({ length: 255 }).primaryKey(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  fcmToken: varchar({ length: 255 }).notNull(),
  platform: varchar({ length: 255 }).notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
