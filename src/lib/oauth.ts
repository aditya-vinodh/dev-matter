import { Google, GitHub } from "arctic";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID as string;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET as string;

export const google = new Google(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  process.env.NODE_ENV === "production"
    ? "https://devmatter.app/login/google/callback"
    : "http://localhost:5173/login/google/callback",
);

export const github = new GitHub(
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  process.env.NODE_ENV === "production"
    ? "https://devmatter.app/login/github/callback"
    : "http://localhost:5173/login/github/callback",
);
