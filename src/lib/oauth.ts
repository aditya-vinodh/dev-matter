import { Google } from "arctic";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;

export const google = new Google(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  process.env.NODE_ENV === "production"
    ? "https://devmatter.app/login/google/callback"
    : "http://localhost:5173/login/google/callback",
);
