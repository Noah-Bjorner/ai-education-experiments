import "@std/dotenv/load";
import { Redis } from "@upstash/redis";

const url = Deno.env.get("UPSTASH_REDIS_REST_URL_SIXTUS");
const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN_SIXTUS");
if (!url || !token) {
  throw new Error(
    "UPSTASH_REDIS_REST_URL_SIXTUS and UPSTASH_REDIS_REST_TOKEN_SIXTUS are required",
  );
}

const redis = new Redis({ url, token });

export interface SixtusRedisCacheSetOptions {
  /** Seconds until the key expires */
  ex?: number;
  /** Milliseconds until the key expires */
  px?: number;
}

export async function setSixtusRedisCache<T>(
  key: string,
  value: T,
  options?: SixtusRedisCacheSetOptions,
): Promise<void> {
  if (options?.ex != null) {
    await redis.set(key, value, { ex: options.ex });
    return;
  }
  if (options?.px != null) {
    await redis.set(key, value, { px: options.px });
    return;
  }
  await redis.set(key, value);
}

export async function getSixtusRedisCache<T>(
  key: string,
): Promise<T | null> {
  return await redis.get<T>(key);
}
