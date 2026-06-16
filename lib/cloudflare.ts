import "@std/dotenv/load";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getCurrentDate } from "../helper/date.ts";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  },
});

const STATIC_DOMAIN = "https://static.noahbjorner.com";

function getImageContentType(fileExtension: string): string {
  const ext = fileExtension.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  if (ext === "bmp") return "image/bmp";
  if (ext === "svg") return "image/svg+xml";
  return "image/jpeg";
}

function getAudioContentType(fileExtension: string): string {
  const ext = fileExtension.toLowerCase();
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "aac") return "audio/aac";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "flac") return "audio/flac";
  if (ext === "webm") return "audio/webm";
  if (ext === "opus") return "audio/opus";
  return "audio/mpeg";
}

function getDocumentContentType(fileExtension: string): string {
  const ext = fileExtension.toLowerCase();
  if (ext === "md" || ext === "markdown") return "text/markdown; charset=utf-8";
  if (ext === "txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function getFontContentType(fileExtension: string): string {
  const ext = fileExtension.toLowerCase();
  if (ext === "ttf") return "font/ttf";
  if (ext === "otf") return "font/otf";
  if (ext === "woff") return "font/woff";
  if (ext === "woff2") return "font/woff2";
  return "application/octet-stream";
}

function sanitizeObjectName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "document";
}

export type UploadOptions = {
  temporary?: boolean;
  prefix?: string;
  name?: string;
};

export interface UploadFontOptions extends UploadOptions {
  familyName: string;
  fontWeight: number;
  originalFilename?: string;
}

export interface FontPublicUrlOptions extends UploadOptions {
  fileExtension?: string;
  familyName: string;
  fontWeight: number;
}

export const uploadImage = async (
  input: string | Blob,
  optionsOrFilename: UploadOptions | string = {},
  optionsIfFilename?: UploadOptions,
): Promise<string> => {
  try {
    const domain = STATIC_DOMAIN;
    const date = getCurrentDate();

    let options: UploadOptions = {};
    let originalFilename: string | undefined;

    if (typeof input === "string") {
      if (typeof optionsOrFilename === "object") {
        options = optionsOrFilename;
      }
    } else {
      if (typeof optionsOrFilename === "string") {
        originalFilename = optionsOrFilename;
        if (optionsIfFilename) options = optionsIfFilename;
      } else {
        if (typeof optionsOrFilename === "object") options = optionsOrFilename;
      }
    }

    const isTemporary = options.temporary === true;
    const basePrefix = options.prefix ||
      (isTemporary ? "tmp/images" : "images");
    const name = options.name || crypto.randomUUID();

    let fileExtension = "jpg";
    let fileContent: Uint8Array;
    let contentType: string;

    if (typeof input === "string") {
      fileExtension = input.split(".").pop() || "jpg";
      fileContent = await Deno.readFile(input);
      contentType = getImageContentType(fileExtension);
    } else {
      if (originalFilename) {
        fileExtension = originalFilename.split(".").pop() || "jpg";
      } else if (input.type) {
        if (input.type === "image/png") fileExtension = "png";
        else if (input.type === "image/webp") fileExtension = "webp";
        else if (input.type === "image/gif") fileExtension = "gif";
      }
      fileContent = new Uint8Array(await input.arrayBuffer());
      contentType = input.type || getImageContentType(fileExtension);
    }

    const fileName = `${basePrefix}/${date}/${name}.${fileExtension}`;

    const params = {
      Bucket: Deno.env.get("R2_NOAHBJORNER_BUCKET_NAME"),
      Key: fileName,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    } as const;

    const command = new PutObjectCommand(params as unknown as any);
    await client.send(command);

    return `${domain}/${fileName}`;
  } catch (error) {
    console.error("Error uploading file/blob to R2:", error);
    throw error;
  }
};

export const uploadAudio = async (
  input: string | Blob,
  optionsOrFilename: UploadOptions | string = {},
  optionsIfFilename?: UploadOptions,
): Promise<string> => {
  try {
    const domain = STATIC_DOMAIN;
    const date = getCurrentDate();

    let options: UploadOptions = {};
    let originalFilename: string | undefined;

    if (typeof input === "string") {
      if (typeof optionsOrFilename === "object") {
        options = optionsOrFilename;
      }
    } else if (typeof optionsOrFilename === "string") {
      originalFilename = optionsOrFilename;
      options = optionsIfFilename || {};
    } else {
      options = optionsOrFilename;
    }

    let fileExtension = "mp3";
    let fileContent: Uint8Array;
    let contentType: string;

    if (typeof input === "string") {
      fileExtension = input.split(".").pop() || "mp3";
      fileContent = await Deno.readFile(input);
      contentType = getAudioContentType(fileExtension);
    } else {
      if (originalFilename) {
        fileExtension = originalFilename.split(".").pop() || "mp3";
      } else if (input.type === "audio/wav") {
        fileExtension = "wav";
      } else if (input.type === "audio/mp4") {
        fileExtension = "m4a";
      } else if (input.type === "audio/ogg") {
        fileExtension = "ogg";
      } else if (input.type === "audio/flac") {
        fileExtension = "flac";
      } else if (input.type === "audio/webm") {
        fileExtension = "webm";
      } else if (input.type === "audio/opus") {
        fileExtension = "opus";
      }

      fileContent = new Uint8Array(await input.arrayBuffer());
      contentType = input.type || getAudioContentType(fileExtension);
    }

    const isTemporary = options.temporary === true;

    const basePrefix = options.prefix || (isTemporary ? "tmp/audio" : "audio");
    const name = options.name || crypto.randomUUID();
    const fileName = `${basePrefix}/${date}/${name}.${fileExtension}`;

    const params = {
      Bucket: Deno.env.get("R2_NOAHBJORNER_BUCKET_NAME"),
      Key: fileName,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    } as const;

    const command = new PutObjectCommand(params as unknown as any);
    await client.send(command);

    const url = `${domain}/${fileName}`;
    return url;
  } catch (error) {
    console.error("Error uploading audio file to R2:", error);
    throw error;
  }
};

export const uploadDocument = async (
  input: string | Blob,
  originalFilename?: string,
  options: UploadOptions = {},
): Promise<string> => {
  try {
    const domain = STATIC_DOMAIN;
    const date = getCurrentDate();
    const resolvedFilename = originalFilename ||
      (typeof input === "string" ? input.split(/[/\\]/).pop() : undefined) ||
      "document.txt";
    const fileExtension = resolvedFilename.split(".").pop() || "txt";
    const originalBasename = resolvedFilename.replace(/\.[^/.]+$/, "");
    const isTemporary = options.temporary === true;
    const basePrefix = options.prefix || (isTemporary ? "tmp/docs" : "docs");
    const name = sanitizeObjectName(options.name || originalBasename);
    const fileName = `${basePrefix}/${date}/${name}.${fileExtension}`;
    const fileContent = typeof input === "string"
      ? await Deno.readFile(input)
      : new Uint8Array(await input.arrayBuffer());
    const contentType = typeof input === "string"
      ? getDocumentContentType(fileExtension)
      : input.type || getDocumentContentType(fileExtension);

    const params = {
      Bucket: Deno.env.get("R2_NOAHBJORNER_BUCKET_NAME"),
      Key: fileName,
      Body: fileContent,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    } as const;

    const command = new PutObjectCommand(params as unknown as any);
    await client.send(command);

    return `${domain}/${fileName}`;
  } catch (error) {
    console.error("Error uploading document to R2:", error);
    throw error;
  }
};

export interface TransformOptions {
  width?: number;
  height?: number;
  quality?: number; // 1-100
  format?: "auto" | "avif" | "webp" | "jpeg" | "json";
  fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
  gravity?: "auto" | "side" | "left" | "right" | "top" | "bottom";
  metadata?: "keep" | "copyright" | "none";
  background?: string; // Hex color (e.g., "#ffffff")
}

export const transformImage = (
  imageUrl: string,
  options: TransformOptions = {},
): string => {
  try {
    // 1. Parse the input URL
    const url = new URL(imageUrl);

    // 2. Default to format=auto if not specified (highly recommended)
    if (!options.format) {
      options.format = "auto";
    }

    // 3. Convert options object into a comma-separated string
    // e.g., "width=500,quality=80,format=auto"
    const optionsString = Object.entries(options)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");

    // 4. Construct the new path
    // Format: /cdn-cgi/image/<OPTIONS>/<ORIGINAL_PATH>
    const newPath = `/cdn-cgi/image/${optionsString}${url.pathname}`;

    // 5. Return the full URL
    return `${url.origin}${newPath}`;
  } catch (error: any) {
    console.error("Error transforming image:", error);
    throw error;
  }
};
