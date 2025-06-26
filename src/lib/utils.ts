import { encodeBase32UpperCaseNoPadding } from "@oslojs/encoding";

export function generateRandomOTP(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const code = encodeBase32UpperCaseNoPadding(bytes).slice(0, 6);
  return code;
}
