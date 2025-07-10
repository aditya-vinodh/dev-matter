import { Hono } from "hono";
import type { User } from "../lib/user.js";
import type { Session } from "../lib/session.js";
import { Checkout } from "@polar-sh/hono";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

console.log(process.env.POLAR_ACCESS_TOKEN);

app.get(
  "/checkout",
  Checkout({
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    successUrl: process.env.POLAR_SUCCESS_URL,
    server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  }),
);

export default app;
