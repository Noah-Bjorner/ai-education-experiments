import "@std/dotenv/load";
import { withRetry } from "../helper/retry.ts";
import { urlToDataUri } from "../helper/image.ts";

export type ImageSize = "large" | "medium" | "icon";
export type TimeRange = "day" | "week" | "month" | "year";

const SIZE_MAP: Record<ImageSize, string> = {
  large: "isz:l",
  medium: "isz:m",
  icon: "isz:i",
};

const TIME_RANGE_MAP: Record<TimeRange, string> = {
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

const BLOCKED_URL_PREFIXES = [
  "https://lookaside.instagram.com",
  "https://lookaside.fbsbx.com",
  "https://www.tiktok.com",
  "https://www.instagram.com",
  "https://www.facebook.com",
  "https://i.ytimg.com"
];

const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
];

export interface ImageSearchPayload {
  q: string;
  num?: number;
  size?: ImageSize;
  timeRange?: TimeRange;
  /** Download images and return base64 data URIs. Replaces URL validation — failed downloads are filtered out. */
  download?: boolean;
}

export interface ImageSearchResult {
  url: string;
  thumbnailUrl?: string;
  dataUri?: string;
  width: number;
  height: number;
}

const buildTbs = (size?: ImageSize, timeRange?: TimeRange): string | undefined => {
  const parts: string[] = [];
  if (size) parts.push(SIZE_MAP[size]);
  if (timeRange) parts.push(TIME_RANGE_MAP[timeRange]);
  return parts.length > 0 ? parts.join(",") : undefined;
};

const hasAllowedImageExtension = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext));
  } catch {
    const lowered = url.toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowered.endsWith(ext));
  }
};

export const imageSearch = async (payload: ImageSearchPayload): Promise<ImageSearchResult[]> => {
  const apiKey = Deno.env.get("SERPER_API_KEY");
  if (!apiKey) {
    throw new Error("SERPER_API_KEY is not set");
  }

  const tbs = buildTbs(payload.size, payload.timeRange);
  const requestedNum = payload.num;

  const body: Record<string, unknown> = { q: payload.q };
  // Over-fetch by 5 to account for filtered results
  if (requestedNum) body.num = requestedNum + 5;
  if (tbs) body.tbs = tbs;

  const response = await withRetry(async () => {
    const res = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Serper API error: ${res.status} ${res.statusText}`);
    }
    return res;
  }, 2);

  const result = await response.json();
  
  let images: ImageSearchResult[] = (result.images || [])
    .filter((image: any) => {
      const url = image.imageUrl.toLowerCase();
      if (BLOCKED_URL_PREFIXES.some(prefix => url.startsWith(prefix))) return false;
      if (!hasAllowedImageExtension(image.imageUrl)) return false;
      return true;
    })
    .map((image: any) => ({
      url: image.imageUrl,
      thumbnailUrl: image.thumbnailUrl,
      width: image.imageWidth,
      height: image.imageHeight,
    }));

  if (payload.download) {
    const downloadResults = await Promise.all(
      images.map(async (image): Promise<ImageSearchResult | null> => {
        const dataUri = await urlToDataUri(image.url, 5);
        return dataUri ? { ...image, dataUri } : null;
      })
    );
    images = downloadResults.filter((r): r is ImageSearchResult => r !== null);
  }

  // Trim to originally requested limit
  if (requestedNum) {
    return images.slice(0, requestedNum);
  }

  return images;
};