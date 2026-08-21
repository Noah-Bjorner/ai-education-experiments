export type LibraryMediaKind =
  | "document"
  | "image"
  | "audio"
  | "video"
  | "website"
  | "youtube";

const EXT_KIND: Record<string, LibraryMediaKind> = {
  // documents
  pdf: "document",
  doc: "document",
  docx: "document",
  rtf: "document",
  odt: "document",
  ods: "document",
  odp: "document",
  xls: "document",
  xlsx: "document",
  ppt: "document",
  pptx: "document",
  epub: "document",
  txt: "document",
  md: "document",
  markdown: "document",
  csv: "document",
  // images
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  tif: "image",
  tiff: "image",
  bmp: "image",
  svg: "image",
  heic: "image",
  heif: "image",
  avif: "image",
  // audio
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  ogg: "audio",
  oga: "audio",
  flac: "audio",
  opus: "audio",
  wma: "audio",
  // video
  mp4: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  m4v: "video",
  ogv: "video",
  wmv: "video",
  // websites
  html: "website",
  htm: "website",
  xhtml: "website",
};

function normalizeMimeType(type: string): string {
  return type.toLowerCase().split(";")[0]?.trim() ?? "";
}

function extensionFromFilename(filename: string): string {
  const base = filename.split(/[?#]/)[0] ?? filename;
  const lastSegment = base.split("/").pop() ?? base;
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0 || dot === lastSegment.length - 1) return "";
  return lastSegment.slice(dot + 1).toLowerCase();
}

/** True for youtube.com, youtu.be, youtube-nocookie.com (and common subdomains). */
export function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host === "www.youtube-nocookie.com"
    );
  } catch {
    return false;
  }
}

function kindFromMimeType(mimeType: string): LibraryMediaKind | null {
  if (!mimeType || mimeType === "application/octet-stream") return null;

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";

  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    return "website";
  }

  if (
    mimeType === "application/pdf" ||
    mimeType === "application/msword" ||
    mimeType === "application/rtf" ||
    mimeType === "application/epub+zip" ||
    mimeType.startsWith("text/") ||
    mimeType.startsWith("application/vnd.openxmlformats-officedocument.") ||
    mimeType.startsWith("application/vnd.oasis.opendocument.") ||
    mimeType.startsWith("application/vnd.ms-")
  ) {
    return "document";
  }

  return null;
}

export interface ResolveLibraryMediaKindOptions {
  /** Original source URL. Needed to distinguish YouTube from other HTML pages. */
  sourceUrl?: string;
}

/**
 * Classifies a URL without downloading it.
 * Known file extensions map to their media kind; everything else (including
 * bare paths like /article) is treated as a website so we can scrape once.
 */
export function resolveLibraryMediaKindFromUrl(url: string): LibraryMediaKind {
  if (isYouTubeUrl(url)) return "youtube";

  try {
    const pathname = new URL(url).pathname;
    const fromExt = EXT_KIND[extensionFromFilename(pathname)];
    if (fromExt) return fromExt;
  } catch {
    // Invalid URL — fall through to website.
  }

  return "website";
}

/** Resolves upload category from source URL (YouTube), MIME type, then filename extension. */
export function resolveLibraryMediaKind(
  file?: File,
  options?: ResolveLibraryMediaKindOptions,
): LibraryMediaKind {
  if (options?.sourceUrl && isYouTubeUrl(options.sourceUrl)) {
    return "youtube";
  }

  if (!file) {
    throw new Error("A file is required for non-YouTube uploads");
  }

  const mimeType = normalizeMimeType(file.type);
  const fromMime = kindFromMimeType(mimeType);
  if (fromMime) return fromMime;

  const fromExt = EXT_KIND[extensionFromFilename(file.name)];
  if (fromExt) return fromExt;

  const label = mimeType || "unknown";
  throw new Error(
    `Unsupported file type: ${label} (${file.name || "unnamed"})`,
  );
}
