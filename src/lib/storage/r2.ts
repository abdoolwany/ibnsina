import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_ENDPOINT = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return s3Client
}

export async function uploadImage(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const client = getS3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
}

export async function getSignedImageUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const client = getS3Client()
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  })
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}

// التحقق من نوع الملف الفعلي (وليس فقط الامتداد)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function isValidImageMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType)
}

// توليد مفتاح فريد للصورة
export function generateImageKey(
  hospitalId: string,
  recordId: string,
  parentType: 'father' | 'mother'
): string {
  const timestamp = Date.now()
  return `hospitals/${hospitalId}/records/${recordId}/${parentType}_${timestamp}.jpg`
}
