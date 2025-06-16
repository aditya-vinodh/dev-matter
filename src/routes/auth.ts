import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { verifyPasswordHash, verifyPasswordStrength } from "../lib/password.js";
import { z } from "zod";
import { checkEmailAvailability } from "../lib/email.js";
import {
  createUser,
  getUserFromEmail,
  getUserPasswordHash,
  type User,
} from "../lib/user.js";
import {
  createEmailVerificationRequest,
  sendVerificationEmail,
} from "../lib/email-verification.js";
import {
  createSession,
  generateSessionToken,
  invalidateSession,
  type Session,
} from "../lib/session.js";

const app = new Hono<{ Variables: { user: User; session: Session } }>();

// Sign up
app.post(
  "/users",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      password: z
        .string()
        .min(1)
        .refine(async (val) => {
          return (
            await verifyPasswordStrength(val),
            {
              error: "Too weak",
            }
          );
        }),
      name: z.string().min(1),
    }),
  ),
  async (c) => {
    const { email, password, name } = c.req.valid("json");
    const emailAvailable = await checkEmailAvailability(email);
    if (!emailAvailable) {
      c.status(400);
      return c.json({
        error: "email-already-used",
        message: "Email is already in use",
      });
    }

    const user = await createUser(email, password, name);
    const emailVerificationRequest = await createEmailVerificationRequest(
      user.id,
      email,
    );
    await sendVerificationEmail(email, emailVerificationRequest.code);
    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, user.id);

    return c.json({
      user,
      sessionToken,
      expiresAt: session.expiresAt,
    });
  },
);

// Log in
app.post(
  "/login",
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  ),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await getUserFromEmail(email);
    if (!user) {
      c.status(400);
      return c.json({
        error: "invalid-credentials",
        message: "The email or password was incorrect",
      });
    }

    const passwordHash = await getUserPasswordHash(user.id);
    if (!passwordHash) {
      c.status(400);
      return c.json({
        error: "password-not-set",
        message:
          "You have not set your password. Please contact support if this is a mistake",
      });
    }

    const validPassword = await verifyPasswordHash(passwordHash, password);
    if (!validPassword) {
      c.status(400);
      return c.json({
        error: "invalid-credentials",
        message: "The email or password was incorrect",
      });
    }

    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, user.id);
    return c.json({
      user,
      sessionToken,
      expiresAt: session.expiresAt,
    });
  },
);

export default app;
