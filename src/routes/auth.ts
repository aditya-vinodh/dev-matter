import { Hono } from "hono";
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { zValidator } from "@hono/zod-validator";
import { verifyPasswordHash, verifyPasswordStrength } from "../lib/password.js";
import { z } from "zod";
import { checkEmailAvailability } from "../lib/email.js";
import {
  addUserGithubId,
  addUserGoogleId,
  createUser,
  getUserByGithubId,
  getUserByGoogleId,
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
import {
  decodeIdToken,
  generateCodeVerifier,
  generateState,
  OAuth2Tokens,
} from "arctic";
import { github, google } from "../lib/oauth.js";

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

app.get("/login/google", async (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url =
    google.createAuthorizationURL(state, codeVerifier, [
      "openid",
      "profile",
      "email",
    ]) + "&prompt=select_account";

  return c.json({
    url,
    state,
    codeVerifier,
  });
});

app.get("/login/github", async (c) => {
  const state = generateState();
  const url = github.createAuthorizationURL(state, ["user:email"]);

  return c.json({
    url,
    state,
  });
});

app.post(
  "/login/google",
  zValidator("json", z.object({ code: z.string(), codeVerifier: z.string() })),
  async (c) => {
    const { code, codeVerifier } = c.req.valid("json");

    let tokens: OAuth2Tokens;
    try {
      tokens = await google.validateAuthorizationCode(code, codeVerifier);
    } catch (e) {
      c.status(400);
      return c.json({
        error: "invalid-credentials",
        message: "Code is invalid",
      });
    }

    const claims = decodeIdToken(tokens.idToken()) as {
      sub: string;
      name: string;
      email: string;
      email_verified: boolean;
    };
    const googleUserId = claims.sub;
    const username = claims.name;
    const email = claims.email;
    const emailVerified = claims.email_verified;

    console.log(claims);
    const user = await getUserByGoogleId(googleUserId);

    if (!user) {
      // TODO
      const user = await getUserFromEmail(email);
      if (!user) {
        // TODO
        const user = await createUser(
          email,
          null,
          username,
          googleUserId,
          emailVerified,
        );
        if (!emailVerified) {
          const emailVerificationRequest = await createEmailVerificationRequest(
            user.id,
            email,
          );
          await sendVerificationEmail(email, emailVerificationRequest.code);
        }

        const sessionToken = generateSessionToken();
        const session = await createSession(sessionToken, user.id);

        return c.json({
          user,
          sessionToken,
          expiresAt: session.expiresAt,
        });
      }

      await addUserGoogleId(user.id, googleUserId);

      const sessionToken = generateSessionToken();
      const session = await createSession(sessionToken, user.id);
      return c.json({
        user,
        sessionToken,
        expiresAt: session.expiresAt,
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
  "/login/github",
  zValidator("json", z.object({ code: z.string() })),
  async (c) => {
    const { code } = c.req.valid("json");

    let tokens: OAuth2Tokens;
    try {
      tokens = await github.validateAuthorizationCode(code);
    } catch (e) {
      c.status(400);
      return c.json({
        error: "invalid-credentials",
        message: "Code is invalid",
      });
    }

    const githubUserResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokens.accessToken()}`,
      },
    });

    const githubEmailsResponse = await fetch(
      "https://api.github.com/user/emails",
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken()}`,
        },
      },
    );

    const githubUser = await githubUserResponse.json();
    const githubUserId = githubUser.id;
    const githubUsername = githubUser.login;

    const githubEmails = (await githubEmailsResponse.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const githubEmail = githubEmails.find((email) => email.primary);

    if (!githubEmail) {
      c.status(400);
      return c.json({
        error: "invalid-credentials",
        message: "Email not found",
      });
    }

    const email = githubEmail.email;
    const emailVerified = githubEmail.verified;

    console.log(githubUser);
    console.log(githubEmails);

    // const claims = decodeIdToken(tokens.idToken()) as {
    //   sub: string;
    //   name: string;
    //   email: string;
    //   email_verified: boolean;
    // };
    // const googleUserId = claims.sub;
    // const username = claims.name;
    // const email = claims.email;
    // const emailVerified = claims.email_verified;

    const user = await getUserByGithubId(githubUserId);

    if (!user) {
      // TODO
      const user = await getUserFromEmail(email);
      if (!user) {
        // TODO
        const user = await createUser(
          email,
          null,
          githubUsername,
          githubUserId,
          emailVerified,
        );
        if (!emailVerified) {
          const emailVerificationRequest = await createEmailVerificationRequest(
            user.id,
            email,
          );
          await sendVerificationEmail(email, emailVerificationRequest.code);
        }

        const sessionToken = generateSessionToken();
        const session = await createSession(sessionToken, user.id);

        return c.json({
          user,
          sessionToken,
          expiresAt: session.expiresAt,
        });
      }

      await addUserGithubId(user.id, githubUserId);

      const sessionToken = generateSessionToken();
      const session = await createSession(sessionToken, user.id);
      return c.json({
        user,
        sessionToken,
        expiresAt: session.expiresAt,
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

// Forgot password
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

// Resend forgot password verification email
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

// Verify forgot password email verification code
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

// Reset password
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
