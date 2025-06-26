import { generateRandomOTP } from "./utils.js";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { emailVerificationRequestsTable } from "../db/schema.js";
import { encodeBase32 } from "@oslojs/encoding";
import { Resend } from "resend";
import { VerificationEmail } from "../emails/verification-email.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function getEmailVerificationRequest(
  id: string,
): Promise<EmailVerificationRequest | null> {
  const [emailVerificationRequest] = await db
    .select()
    .from(emailVerificationRequestsTable)
    .where(eq(emailVerificationRequestsTable.id, id));
  return emailVerificationRequest;
}

export async function createEmailVerificationRequest(
  userId: number,
  email: string,
): Promise<EmailVerificationRequest> {
  deleteUserEmailVerificationRequest(userId);
  const idBytes = new Uint8Array(20);
  crypto.getRandomValues(idBytes);
  const id = encodeBase32(idBytes).toLowerCase();

  const code = generateRandomOTP();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10);
  await db.insert(emailVerificationRequestsTable).values({
    id,
    userId,
    code,
    email,
    expiresAt,
  });

  const request: EmailVerificationRequest = {
    id,
    userId,
    code,
    email,
    expiresAt,
  };
  return request;
}

export async function deleteUserEmailVerificationRequest(
  userId: number,
): Promise<void> {
  await db
    .delete(emailVerificationRequestsTable)
    .where(eq(emailVerificationRequestsTable.userId, userId));
}

export async function sendVerificationEmail(email: string, code: string) {
  const { error } = await resend.emails.send({
    from: "no-reply@transactions.trelae.com",
    to: [email],
    subject: "Email verification code",
    react: <VerificationEmail code={code} email={email} />,
  });
  if (error) {
    console.log(error);
    throw Error("Failed to send email");
  }
}

export interface EmailVerificationRequest {
  id: string;
  userId: number;
  code: string;
  email: string;
  expiresAt: Date;
}
