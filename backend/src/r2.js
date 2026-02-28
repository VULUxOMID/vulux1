// R2 configuration for Cloudflare R2 storage
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

export function getPublicUrlForObjectKey(objectKey) {
  if (!R2_PUBLIC_BASE_URL) return null;
  if (!objectKey) return null;
  const normalizedKey = String(objectKey).replace(/^\/+/, "");
  if (!normalizedKey) return null;
  return `${R2_PUBLIC_BASE_URL}/${normalizedKey}`;
}

export async function generatePresignedUrl(objectKey) {
  console.log("Generating presigned URL for:", objectKey);
  console.log("R2 configured:", isR2Configured);
  console.log("R2_BUCKET_NAME:", R2_BUCKET_NAME);
  
  if (!isR2Configured) {
    throw new Error("Storage not configured");
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
  });

  // URL expires in 1 hour
  const url = await getSignedUrl(s3Client, command, { 
    expiresIn: 3600,
    // Explicitly set unsigned headers to prevent signature mismatches
    unsignedPayload: true,
  });
  
  console.log("Generated URL length:", url.length);
  console.log("URL contains checksum header:", url.includes('x-amz-content-sha256'));
  console.log("URL contains unsigned payload:", url.includes('X-Amz-Content-Sha256=UNSIGNED-PAYLOAD'));
  return url;
}
