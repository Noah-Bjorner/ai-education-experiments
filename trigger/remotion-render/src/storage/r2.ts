import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";

const STATIC_DOMAIN = "https://static.noahbjorner.com";

function getCurrentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function createR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials. Set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function uploadToR2(
  body: Uint8Array | string,
  fileName: string,
  contentType: string,
): Promise<string> {
  const bucket = process.env.R2_NOAHBJORNER_BUCKET_NAME;

  if (!bucket) {
    throw new Error("Missing R2_NOAHBJORNER_BUCKET_NAME.");
  }

  const client = createR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return `${STATIC_DOMAIN}/${fileName}`;
}

export async function uploadTsx(
  tsx: string,
  options: { temporary?: boolean; name?: string } = {},
): Promise<string> {
  const date = getCurrentDate();
  const isTemporary = options.temporary === true;
  const basePrefix = isTemporary ? "tmp/docs" : "docs";
  const name = options.name ?? crypto.randomUUID();
  const fileName = `${basePrefix}/${date}/${name}.tsx`;

  return uploadToR2(tsx, fileName, "text/plain; charset=utf-8");
}

export async function uploadVideo(
  filePath: string,
  options: { temporary?: boolean; name?: string } = {},
): Promise<string> {
  const date = getCurrentDate();
  const isTemporary = options.temporary === true;
  const basePrefix = isTemporary ? "tmp/videos" : "videos";
  const name = options.name ?? crypto.randomUUID();
  const fileName = `${basePrefix}/${date}/${name}.mp4`;
  const fileContent = await readFile(filePath);

  return uploadToR2(fileContent, fileName, "video/mp4");
}
