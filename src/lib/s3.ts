import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as _getSignedUrl } from "@aws-sdk/cloudfront-signer";

import type { Readable } from "stream";

const client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export const uploadFile = async (
  body: string | Buffer | Uint8Array | Readable,
  key: string,
  contentType: string,
) => {
  const command = new PutObjectCommand({
    Body: body,
    Bucket:
      process.env.NODE_ENV === "production"
        ? "devmatter-prod"
        : "devmatter-dev",
    Key: key,
    ContentType: contentType,
  });

  const response = await client.send(command);
  return response;
};

export const getSignedUrl = (key: string): string => {
  const signedUrl = _getSignedUrl({
    url: `${process.env.NODE_ENV === "production" ? "https://d2vsv7r60wv2iz.cloudfront.net" : "https://d18hfut33910f4.cloudfront.net"}/${key}`,
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID || "",
    dateLessThan: new Date(Date.now() + 60 * 60 * 1000), // Expires in 1 hour
    privateKey: process.env.CLOUDFRONT_PRIVATE_KEY || "",
  });

  return signedUrl;
};

export const deleteFile = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket:
      process.env.NODE_ENV === "production"
        ? "devmatter-prod"
        : "devmatter-dev",
    Key: key,
  });

  const response = await client.send(command);
  return response;
};

export const deleteFiles = async (keys: string[]) => {
  const command = new DeleteObjectsCommand({
    Bucket:
      process.env.NODE_ENV === "production"
        ? "devmatter-prod"
        : "devmatter-dev",
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
    },
  });

  const response = await client.send(command);
  return response;
};
