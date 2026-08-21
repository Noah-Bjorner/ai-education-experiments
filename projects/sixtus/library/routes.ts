import { Hono } from "@hono/hono";

import type { LibraryItem, LibraryItemType } from "../database/index.ts";
import type { SixtusEnv } from "../auth.ts";
import { sixtusSubscriptionMiddleware } from "../subscription.ts";
import type { LibraryUploadInput } from "./upload.ts";
import type { LibrarySearchResult } from "./search.ts";

const LIBRARY_ITEM_TYPES = [
  "document",
  "image",
  "audio_transcript",
  "website",
  "youtube_transcript",
] as const satisfies readonly LibraryItemType[];

export type LibraryRouteDeps = {
  listLibraryItems: (input: {
    userId: string;
    type?: LibraryItemType;
  }) => Promise<LibraryItem[]>;
  searchLibrary: (input: {
    userId: string;
    query: string;
  }) => Promise<LibrarySearchResult[]>;
  handleLibraryUpload: (
    input: LibraryUploadInput,
  ) => Promise<LibraryItem>;
  deleteLibraryItem: (input: {
    libraryId: number;
    userId: string;
  }) => Promise<boolean>;
};

export function createLibraryRoutes(
  deps: LibraryRouteDeps,
): Hono<SixtusEnv> {
  const {
    listLibraryItems: listItems,
    searchLibrary: searchItems,
    handleLibraryUpload: uploadItem,
    deleteLibraryItem: deleteItem,
  } = deps;

  const routes = new Hono<SixtusEnv>();

  routes.get("/", async (c) => {
    const user = c.get("sixtusUser");
    const rawType = c.req.query("type") ?? "all";

    if (rawType !== "all" && !isLibraryItemType(rawType)) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_LIBRARY_LIST",
            message:
              'Invalid "type". Expected "all" or one of: document, image, audio_transcript, website, youtube_transcript.',
          },
        },
        400,
      );
    }

    try {
      const items = await listItems({
        userId: user.id,
        type: rawType === "all" ? undefined : rawType,
      });

      return c.json({
        ok: true,
        data: items.map(serializeLibraryItem),
      });
    } catch (error) {
      console.error("Library list failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "LIBRARY_LIST_FAILED",
            message: "Failed to list library items.",
          },
        },
        500,
      );
    }
  });

  routes.get("/search", sixtusSubscriptionMiddleware, async (c) => {
    const user = c.get("sixtusUser");
    const query = (c.req.query("q") ?? "").trim();

    if (!query) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_LIBRARY_SEARCH",
            message: 'Expected a non-empty "q" query parameter.',
          },
        },
        400,
      );
    }

    try {
      const results = await searchItems({
        userId: user.id,
        query,
      });

      return c.json({
        ok: true,
        data: results.map(serializeLibrarySearchResult),
      });
    } catch (error) {
      console.error("Library search failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "LIBRARY_SEARCH_FAILED",
            message: "Failed to search the library.",
          },
        },
        500,
      );
    }
  });

  routes.post("/upload", sixtusSubscriptionMiddleware, async (c) => {
    const user = c.get("sixtusUser");

    let form: Awaited<ReturnType<typeof c.req.parseBody>>;
    try {
      form = await c.req.parseBody();
    } catch {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_LIBRARY_UPLOAD",
            message:
              'Expected multipart/form-data with either a "file" or a "url" field.',
          },
        },
        400,
      );
    }

    const rawFile = form.file;
    const rawUrl = typeof form.url === "string" ? form.url.trim() : "";
    const hasFile = rawFile instanceof File;
    const hasUrl = rawUrl.length > 0;

    if (hasFile === hasUrl) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_LIBRARY_UPLOAD",
            message:
              'Send exactly one of "file" (multipart file) or "url" (http/https link).',
          },
        },
        400,
      );
    }

    let source: LibraryUploadInput["source"];

    if (hasFile) {
      source = { type: "file", file: rawFile };
    } else {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("URL must use http or https");
        }
      } catch {
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_LIBRARY_UPLOAD",
              message: 'Invalid "url". Expected an absolute http(s) URL.',
            },
          },
          400,
        );
      }
      source = { type: "url", url: rawUrl };
    }

    try {
      const artifact = await uploadItem({
        userId: user.id,
        source,
      });

      return c.json({
        ok: true,
        data: {
          id: artifact.id,
          url: artifact.src_url,
          name: artifact.name,
          type: artifact.type,
        },
      });
    } catch (error) {
      if (isLibraryClientError(error)) {
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_LIBRARY_UPLOAD",
              message: error.message,
            },
          },
          400,
        );
      }

      console.error("Library upload failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "LIBRARY_UPLOAD_FAILED",
            message: "Failed to upload the file to the library.",
          },
        },
        500,
      );
    }
  });

  routes.delete("/:id", async (c) => {
    const user = c.get("sixtusUser");
    const rawId = c.req.param("id");
    const libraryId = Number(rawId);

    if (!Number.isInteger(libraryId) || libraryId <= 0) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_LIBRARY_DELETE",
            message: 'Invalid "id". Expected a positive integer.',
          },
        },
        400,
      );
    }

    try {
      const deleted = await deleteItem({
        libraryId,
        userId: user.id,
      });

      if (!deleted) {
        return c.json(
          {
            ok: false,
            error: {
              code: "LIBRARY_ITEM_NOT_FOUND",
              message: "Library item not found.",
            },
          },
          404,
        );
      }

      return c.json({
        ok: true,
        data: { id: libraryId },
      });
    } catch (error) {
      console.error("Library delete failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "LIBRARY_DELETE_FAILED",
            message: "Failed to delete the library item.",
          },
        },
        500,
      );
    }
  });

  return routes;
}

function isLibraryItemType(value: string): value is LibraryItemType {
  return (LIBRARY_ITEM_TYPES as readonly string[]).includes(value);
}

function isLibraryClientError(error: unknown): error is Error {
  return error instanceof Error && error.name === "LibraryClientError";
}

function serializeLibraryItem(item: LibraryItem) {
  return {
    id: item.id,
    url: item.src_url,
    name: item.name,
    type: item.type,
    created_at: item.created_at,
  };
}

function serializeLibrarySearchResult(result: LibrarySearchResult) {
  const { src_url, ...rest } = result;
  return {
    ...rest,
    url: src_url,
  };
}
