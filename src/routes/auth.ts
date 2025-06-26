import { Hono } from "hono";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { zValidator } from "@hono/zod-validator";
import { verifyPasswordHash, verifyPasswordStrength } from "../lib/password.js";
import { z } from "zod";
import { checkEmailAvailability } from "../lib/email.js";
import {
  createUser,
  getUserById,
  getUserFromEmail,
  getUserPasswordHash,
  updateUserPassword,
  type User,
} from "../lib/user.js";
import {
  createEmailVerificationRequest,
  deleteUserEmailVerificationRequest,
  getEmailVerificationRequest,
  sendVerificationEmail,
} from "../lib/email-verification.js";
import {
  createSession,
  generateSessionToken,
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

app.post(
  "/forgot-password",
  zValidator("json", z.object({ email: z.string().email() })),
  async (c) => {
    const { email } = c.req.valid("json");

    const user = await getUserFromEmail(email);
    if (!user) {
      c.status(404);
      return c.json({
        error: "user-not-found",
        message: "The email was not found",
      });
    }

    const emailVerificationRequest = await createEmailVerificationRequest(
      user.id,
      email,
    );
    await sendVerificationEmail(email, emailVerificationRequest.code);

    return c.json({
      emailVerificationRequestId: emailVerificationRequest.id,
    });
  },
);

app.post("/forgot-password/resend/:id", async (c) => {
  const id = c.req.param("id");

  const emailVerificationRequest = await getEmailVerificationRequest(id);
  if (!emailVerificationRequest) {
    c.status(404);
    return c.json({
      error: "email-verification-request-not-found",
      message: "The email verification request was not found",
    });
  }

  await deleteUserEmailVerificationRequest(emailVerificationRequest.userId);

  const newEmailVerificationRequest = await createEmailVerificationRequest(
    emailVerificationRequest.userId,
    emailVerificationRequest.email,
  );
  await sendVerificationEmail(
    emailVerificationRequest.email,
    newEmailVerificationRequest.code,
  );

  return c.json({
    emailVerificationRequestId: newEmailVerificationRequest.id,
  });
});

app.post(
  "/forgot-password/verify/:id",
  zValidator("json", z.object({ code: z.string() })),
  async (c) => {
    const { code } = c.req.valid("json");
    const id = c.req.param("id");

    const emailVerificationRequest = await getEmailVerificationRequest(id);
    if (!emailVerificationRequest) {
      c.status(404);
      return c.json({
        error: "email-verification-request-not-found",
        message: "The email verification request was not found",
      });
    }

    if (emailVerificationRequest.code !== code) {
      c.status(400);
      return c.json({
        error: "invalid-email-verification-code",
        message: "The email verification code is invalid",
      });
    }

    if (emailVerificationRequest.expiresAt.getTime() < Date.now()) {
      c.status(400);
      return c.json({
        error: "email-verification-request-expired",
        message: "The email verification request has expired",
      });
    }

    await deleteUserEmailVerificationRequest(emailVerificationRequest.userId);

    const secret = new TextEncoder().encode(process.env.SECRET ?? "");
    const alg = "HS256";

    const jwt = await new SignJWT({ userId: emailVerificationRequest.userId })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secret);

    return c.json({
      token: jwt,
    });
  },
);

app.post(
  "/reset-password",
  zValidator(
    "json",
    z.object({
      newPassword: z
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
      token: z.string(),
    }),
  ),
  async (c) => {
    const { newPassword, token } = c.req.valid("json");

    const secret = new TextEncoder().encode(process.env.SECRET ?? "");

    const { payload } = await jwtVerify(token, secret);

    const user = await getUserById(payload.userId as number);

    if (!user) {
      c.status(404);
      return c.json({
        error: "user-not-found",
        message: "The user was not found",
      });
    }

    await updateUserPassword(user.id, newPassword);

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
