import os from "node:os";
import path from "node:path";

export const REMOTION_CHROME_MODE = "headless-shell" as const;

/** Match to Trigger machine vCPUs; override via REMOTION_RENDER_CONCURRENCY. */
export const RENDER_CONCURRENCY = Number(
  process.env.REMOTION_RENDER_CONCURRENCY ?? 4,
);

export const X264_PRESET = (
  process.env.REMOTION_X264_PRESET ?? "veryfast"
) as "ultrafast" | "veryfast" | "fast" | "medium";

export const BUNDLE_CACHE_DIR = process.env.REMOTION_BUNDLE_CACHE_DIR ??
  path.join(os.tmpdir(), "remotion-bundle-cache");

export const STABLE_SERVE_URL_FILE = path.join(
  process.cwd(),
  ".remotion",
  "stable-serve-url.txt",
);
