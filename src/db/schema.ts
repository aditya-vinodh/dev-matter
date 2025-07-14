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
  googleId: varchar({ length: 255 }),
  githubId: varchar({ length: 255 }),
  pricingPlan: varchar({ length: 255 }).notNull().default("free"),
  passwordHash: varchar({ length: 255 }),
  emailVerified: boolean().notNull().default(false),
  fileStorageSize: integer().notNull().default(0),
});

export const subscriptionCyclesTable = pgTable("subscription_cycles", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  startDate: timestamp().notNull(),
  endDate: timestamp().notNull(),
});

export const monthsTable = pgTable("months", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  subscriptionCycleId: integer()
    .notNull()
    .references(() => subscriptionCyclesTable.id, { onDelete: "cascade" }),
  startDate: timestamp().notNull(),
  endDate: timestamp().notNull(),
});

export const sessionsTable = pgTable("sessions", {
  id: varchar({ length: 255 }).primaryKey(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp().notNull(),
});

export const emailVerificationRequestsTable = pgTable(
  "email_verification_requests",
  {
    id: varchar({ length: 255 }).primaryKey(),
    userId: integer()
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    email: varchar({ length: 255 }).notNull(),
    code: varchar({ length: 255 }).notNull(),
    expiresAt: timestamp().notNull(),
  },
);

export const appsTable = pgTable("apps", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
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
  redirectOnSubmit: boolean().notNull().default(false),
  successUrl: varchar({ length: 255 }).notNull().default(""),
  failureUrl: varchar({ length: 255 }).notNull().default(""),
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

export const formResponsesUsageTable = pgTable("form_responses_usage", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer()
    .notNull()
    .references(() => usersTable.id),
  monthId: integer()
    .notNull()
    .references(() => monthsTable.id, { onDelete: "cascade" }),
  usageCount: integer().notNull().default(0),
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
