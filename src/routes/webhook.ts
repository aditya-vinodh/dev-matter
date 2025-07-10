import { Hono } from "hono";
import { Webhooks } from "@polar-sh/hono";
import { db } from "../db/index.js";
import {
  monthsTable,
  subscriptionCyclesTable,
  usersTable,
} from "../db/schema.js";
import { and, desc, eq } from "drizzle-orm";

const app = new Hono();

app.post(
  "/polar/webhooks",
  Webhooks({
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
    onPayload: async (payload) => {
      let userId: number;
      switch (payload.type) {
        case "order.created":
          userId = parseInt(payload.data.customer.externalId || "");
          const interval = payload.data.subscription?.recurringInterval;

          if (!interval) {
            break;
          }

          let plan: string;
          if (
            payload.data.product.name === "Launch (Monthly)" ||
            payload.data.product.name === "Launch (Yearly)"
          ) {
            plan = "launch";
          } else {
            break;
          }

          const start = payload.data.subscription?.currentPeriodStart;
          const end = payload.data.subscription?.currentPeriodEnd;

          if (!start || !end) {
            break;
          }

          await db
            .update(usersTable)
            .set({
              pricingPlan: plan,
            })
            .where(eq(usersTable.id, userId));

          await db.transaction(async (tx) => {
            const [subscriptionCycle] = await tx
              .select()
              .from(subscriptionCyclesTable)
              .where(eq(subscriptionCyclesTable.userId, userId))
              .orderBy(desc(subscriptionCyclesTable.endDate))
              .limit(1);

            if (subscriptionCycle && subscriptionCycle.endDate > new Date()) {
              await tx
                .update(subscriptionCyclesTable)
                .set({
                  endDate: new Date(),
                })
                .where(eq(subscriptionCyclesTable.id, subscriptionCycle.id));
            }

            const [newCycle] = await tx
              .insert(subscriptionCyclesTable)
              .values({
                userId,
                startDate: start,
                endDate: end,
              })
              .returning();

            if (interval === "month") {
              await tx.insert(monthsTable).values({
                subscriptionCycleId: newCycle.id,
                startDate: newCycle.startDate,
                endDate: newCycle.endDate,
              });
            } else {
              // TODO
            }
          });

          break;
        case "subscription.revoked":
          userId = parseInt(payload.data.customer.externalId || "");

          const [subscriptionCycle] = await db
            .select()
            .from(subscriptionCyclesTable)
            .where(eq(subscriptionCyclesTable.userId, userId))
            .orderBy(desc(subscriptionCyclesTable.endDate))
            .limit(1);

          await db
            .update(subscriptionCyclesTable)
            .set({
              endDate: new Date(),
            })
            .where(eq(subscriptionCyclesTable.id, subscriptionCycle.id));

          await db
            .update(usersTable)
            .set({
              pricingPlan: "free",
            })
            .where(eq(usersTable.id, userId));
      }
    },
  }),
);

export default app;
