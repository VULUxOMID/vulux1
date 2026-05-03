// R2 blob storage configuration for the Railway backend.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID ?? "").trim();
const R2_ACCESS_KEY_ID = (process.env.R2_ACCESS_KEY_ID ?? "").trim();
const R2_SECRET_ACCESS_KEY = (process.env.R2_SECRET_ACCESS_KEY ?? "").trim();
const R2_BUCKET_NAME = (process.env.R2_BUCKET_NAME ?? "").trim();
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");

let s3Client = null;

if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME) {
  console.log("R2 Account ID:", R2_ACCOUNT_ID);
  console.log("R2 Access Key ID format:", R2_ACCESS_KEY_ID.length, "characters");
  console.log("R2 Secret Key format:", R2_SECRET_ACCESS_KEY.length, "characters");
  console.log("R2 Bucket Name:", R2_BUCKET_NAME);
  
  s3Client = new S3Client({
    region: "us-east-1", // Try fixed region instead of "auto"
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    // Minimal configuration for testing
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
} else {
  console.warn("R2 credentials not fully configured. Uploads will fail.");
  console.warn("R2_ACCOUNT_ID:", !!R2_ACCOUNT_ID);
  console.warn("R2_ACCESS_KEY_ID:", !!R2_ACCESS_KEY_ID);
  console.warn("R2_SECRET_ACCESS_KEY:", !!R2_SECRET_ACCESS_KEY);
  console.warn("R2_BUCKET_NAME:", !!R2_BUCKET_NAME);
}

export const isR2Configured = Boolean(s3Client && R2_BUCKET_NAME);
export const isR2PublicUrlConfigured = Boolean(R2_PUBLIC_BASE_URL);
export const DEFAULT_PRESIGNED_URL_TTL_SECONDS = 900;

export function getPublicUrlForObjectKey(objectKey) {
  if (!R2_PUBLIC_BASE_URL) return null;
  if (!objectKey) return null;
  const normalizedKey = String(objectKey).replace(/^\/+/, "");
  if (!normalizedKey) return null;
  return `${R2_PUBLIC_BASE_URL}/${normalizedKey}`;
}

export async function generatePresignedUrl({
  objectKey,
  contentType,
  expiresInSeconds = DEFAULT_PRESIGNED_URL_TTL_SECONDS,
}) {
  if (!isR2Configured) {
    throw new Error("Storage not configured");
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ...(contentType ? { ContentType: contentType } : {}),
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: expiresInSeconds,
    unsignedPayload: true,
  });
  return url;
}
