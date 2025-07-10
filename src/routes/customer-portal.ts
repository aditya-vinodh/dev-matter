import { Hono } from "hono";
import { Polar } from "@polar-sh/sdk";
import type { User } from "../lib/user.js";
import type { Session } from "../lib/session.js";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
});

const app = new Hono<{ Variables: { user: User; session: Session } }>();

app.get("/portal", async (c) => {
  const user = c.get("user");

  const customerSession = await polar.customerSessions.create({
    externalCustomerId: String(user.id),
  });

  return c.json({
    customerPortalUrl: customerSession.customerPortalUrl,
  });
});

export default app;
