import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export const firebaseApp = initializeApp({
  credential: applicationDefault(),
});
