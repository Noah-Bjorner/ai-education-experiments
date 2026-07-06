function isRemoteImage(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

/** Returns a local file path, downloading remote image URLs into outDir when needed. */
export async function ensureLocalImagePath(
  source: string,
  outDir: string,
  prefix = "image-ref",
): Promise<string> {
  if (!isRemoteImage(source)) {
    return source;
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(
      `Failed to download image: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
    ? "webp"
    : "jpg";
  await Deno.mkdir(outDir, { recursive: true });
  const path = `${outDir}/${prefix}-${crypto.randomUUID()}.${ext}`;
  await Deno.writeFile(path, new Uint8Array(await response.arrayBuffer()));
  return path;
}

export async function saveBase64ToFile(
  base64: string,
  outDir: string,
  prefix: string,
  format = "jpg",
): Promise<string> {
  await Deno.mkdir(outDir, { recursive: true });
  const filename = `${prefix}-${crypto.randomUUID()}.${format}`;
  const path = `${outDir}/${filename}`;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await Deno.writeFile(path, bytes);
  return path;
}

const SUPPORTED_IMAGE_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const URL_DOWNLOAD_TIMEOUT_MS = 6000;

export async function urlToDataUri(
  url: string,
  maxSizeMB?: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), URL_DOWNLOAD_TIMEOUT_MS);
  const maxBytes = maxSizeMB ? maxSizeMB * 1024 * 1024 : undefined;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/png,image/jpeg,image/gif,image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    // Early exit if Content-Length header exceeds the limit
    if (maxBytes) {
      const contentLength = Number(res.headers.get("content-length"));
      if (contentLength && contentLength > maxBytes) return null;
    }

    const contentType =
      res.headers.get("content-type")?.toLowerCase().split(";")[0].trim() ?? "";
    const mime = SUPPORTED_IMAGE_CONTENT_TYPES[contentType];
    if (!mime) return null;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    if (maxBytes && buffer.byteLength > maxBytes) return null;

    const base64 = btoa(
      new Uint8Array(buffer).reduce(
        (acc, byte) => acc + String.fromCharCode(byte),
        "",
      ),
    );
    return `data:${mime};base64,${base64}`;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export type EncodedImageSource = {
  url?: string;
  dataURL?: string;
  base64?: string;
};

export type ImageDimensions = {
  width: number;
  height: number;
};

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function dataURLToUint8Array(dataURL: string): Uint8Array {
  const [metadata, data] = dataURL.split(",", 2);
  if (!metadata || !data) {
    throw new Error("Invalid image data URL.");
  }
  if (metadata.endsWith(";base64")) {
    return base64ToUint8Array(data);
  }
  return new TextEncoder().encode(decodeURIComponent(data));
}

export async function imageSourceToUint8Array(
  source: EncodedImageSource,
): Promise<Uint8Array> {
  if (source.url) {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  if (source.dataURL) {
    return dataURLToUint8Array(source.dataURL);
  }
  if (source.base64) {
    return base64ToUint8Array(source.base64);
  }
  throw new Error("Image source must include url, dataURL, or base64.");
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function isAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (bytes[offset + i] !== value.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

function getPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24 || !isAscii(bytes, 1, "PNG")) {
    return null;
  }
  return {
    width: readUint32BE(bytes, 16),
    height: readUint32BE(bytes, 20),
  };
}

function getGifDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (
    bytes.length < 10 ||
    (!isAscii(bytes, 0, "GIF87a") && !isAscii(bytes, 0, "GIF89a"))
  ) {
    return null;
  }
  return {
    width: readUint16LE(bytes, 6),
    height: readUint16LE(bytes, 8),
  };
}

function getJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const hasNoLength = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
    if (hasNoLength) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      break;
    }
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      break;
    }

    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7) {
      return {
        height: readUint16BE(bytes, offset + 3),
        width: readUint16BE(bytes, offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function getWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (
    bytes.length < 30 ||
    !isAscii(bytes, 0, "RIFF") ||
    !isAscii(bytes, 8, "WEBP")
  ) {
    return null;
  }

  if (isAscii(bytes, 12, "VP8X")) {
    return {
      width: readUint24LE(bytes, 24) + 1,
      height: readUint24LE(bytes, 27) + 1,
    };
  }

  if (isAscii(bytes, 12, "VP8L") && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }

  if (isAscii(bytes, 12, "VP8 ") && bytes.length >= 30) {
    return {
      width: readUint16LE(bytes, 26) & 0x3fff,
      height: readUint16LE(bytes, 28) & 0x3fff,
    };
  }

  return null;
}

export function getImageDimensions(bytes: Uint8Array): ImageDimensions {
  const dimensions = getPngDimensions(bytes) ??
    getJpegDimensions(bytes) ??
    getWebpDimensions(bytes) ??
    getGifDimensions(bytes);

  if (!dimensions) {
    throw new Error("Unable to determine image dimensions.");
  }

  return dimensions;
}

export function imageExtensionFromMediaType(mediaType: string): string {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/gif") return "gif";
  return "jpg";
}
