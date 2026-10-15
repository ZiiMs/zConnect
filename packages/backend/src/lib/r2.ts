import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const accountId = process.env.R2_ACCOUNT_ID
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

export const r2Bucket = process.env.R2_BUCKET_NAME

if (!accountId || !accessKeyId || !secretAccessKey || !r2Bucket) {
  throw new Error(
    "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME must be set in packages/backend/.env"
  )
}

/** Cloudflare R2 is S3-compatible; region must be "auto". */
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 60 * 5
) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn }
  )
}

export async function getDownloadUrl(key: string, expiresIn = 60 * 5) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: r2Bucket, Key: key }),
    {
      expiresIn,
    }
  )
}

export async function deleteObject(key: string) {
  return r2.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }))
}
