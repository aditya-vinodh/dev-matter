import { randomBytes, createHmac } from "crypto";
import "dotenv/config";

const SECRET = process.env.SECRET as string;
if (!SECRET) {
  throw Error("SECRET not set");
}

export function generateSecretKey() {
  return "tr_" + randomBytes(32).toString("base64");
}

export function hashSecretKey(key: string) {
  return createHmac("sha256", SECRET).update(key).digest("base64");
}
