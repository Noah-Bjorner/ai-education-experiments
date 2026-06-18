export const ALLOWED_TSX_URL_HOSTS = ["static.noahbjorner.com"] as const;

export const ALLOWED_TSX_URL_PATH_PREFIXES = ["tmp/docs/", "docs/"] as const;

export const REMOTION_RENDER_LIMITS = {
  maxWidth: 3840,
  maxHeight: 3840,
  maxFps: 60,
  maxDurationInFrames: 200000,
} as const;

export type TriggerRemotionRenderInput = {
  tsxUrl: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export type TriggerRemotionRenderResult = {
  videoUrl: string;
  runId: string;
};

export function assertAllowedTsxUrl(tsxUrl: string): void {
  let parsed: URL;

  try {
    parsed = new URL(tsxUrl);
  } catch {
    throw new Error(`Invalid tsxUrl: ${tsxUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`tsxUrl must use https: ${tsxUrl}`);
  }

  if (
    !ALLOWED_TSX_URL_HOSTS.includes(
      parsed.hostname as (typeof ALLOWED_TSX_URL_HOSTS)[number],
    )
  ) {
    throw new Error(
      `tsxUrl host is not allowed: ${parsed.hostname}. Allowed hosts: ${
        ALLOWED_TSX_URL_HOSTS.join(", ")
      }`,
    );
  }

  const normalizedPath = parsed.pathname.replace(/^\/+/, "");

  if (
    !ALLOWED_TSX_URL_PATH_PREFIXES.some((prefix) =>
      normalizedPath.startsWith(prefix)
    )
  ) {
    throw new Error(
      `tsxUrl path is not allowed: ${parsed.pathname}. Allowed prefixes: ${
        ALLOWED_TSX_URL_PATH_PREFIXES.map((prefix) => `/${prefix}`).join(", ")
      }`,
    );
  }
}

export function assertRenderDimensions(input: TriggerRemotionRenderInput): void {
  const { maxWidth, maxHeight, maxFps, maxDurationInFrames } =
    REMOTION_RENDER_LIMITS;

  if (!Number.isInteger(input.width) || input.width <= 0 || input.width > maxWidth) {
    throw new Error(`width must be a positive integer up to ${maxWidth}.`);
  }

  if (
    !Number.isInteger(input.height) || input.height <= 0 ||
    input.height > maxHeight
  ) {
    throw new Error(`height must be a positive integer up to ${maxHeight}.`);
  }

  if (!Number.isInteger(input.fps) || input.fps <= 0 || input.fps > maxFps) {
    throw new Error(`fps must be a positive integer up to ${maxFps}.`);
  }

  if (
    !Number.isInteger(input.durationInFrames) || input.durationInFrames <= 0 ||
    input.durationInFrames > maxDurationInFrames
  ) {
    throw new Error(
      `durationInFrames must be a positive integer up to ${maxDurationInFrames}.`,
    );
  }
}

export function validateTriggerRemotionRenderInput(
  input: TriggerRemotionRenderInput,
): TriggerRemotionRenderInput {
  assertAllowedTsxUrl(input.tsxUrl);
  assertRenderDimensions(input);
  return input;
}
