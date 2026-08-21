import { assertEquals } from "@std/assert";
import { Hono } from "@hono/hono";

import type { SixtusEnv } from "../auth.ts";
import type { LibraryItem, LibraryItemType } from "../database/index.ts";
import type { LibraryUploadInput } from "./upload.ts";
import type { LibrarySearchResult } from "./search.ts";
import type { LibraryRouteDeps } from "./routes.ts";

Deno.env.set(
  "SUPABASE_URL",
  Deno.env.get("SUPABASE_URL") ?? "https://example.supabase.co",
);
Deno.env.set(
  "SUPABASE_SECRET_KEY",
  Deno.env.get("SUPABASE_SECRET_KEY") ?? "test-secret-key",
);

const { createLibraryRoutes } = await import("./routes.ts");

const TEST_USER_ID = "ff52ec97-73c6-42f4-a9ea-c1c320ac1646";

function sampleItem(
  overrides: Partial<LibraryItem> = {},
): LibraryItem {
  return {
    id: 1,
    user_id: TEST_USER_ID,
    name: "Notes",
    src_url: "https://static.example.com/notes.md",
    type: "document",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function unusedDeps(): LibraryRouteDeps {
  return {
    listLibraryItems: async () => {
      throw new Error("listLibraryItems should not be called");
    },
    searchLibrary: async () => {
      throw new Error("searchLibrary should not be called");
    },
    handleLibraryUpload: async () => {
      throw new Error("handleLibraryUpload should not be called");
    },
    deleteLibraryItem: async () => {
      throw new Error("deleteLibraryItem should not be called");
    },
  };
}

function createTestApp(deps: Partial<LibraryRouteDeps>) {
  const app = new Hono<SixtusEnv>();
  app.use("*", async (c, next) => {
    c.set("sixtusUser", { id: TEST_USER_ID });
    await next();
  });
  app.route("/", createLibraryRoutes({ ...unusedDeps(), ...deps }));
  return app;
}

Deno.test("GET / lists all items by default", async () => {
  const calls: Array<{ userId: string; type?: LibraryItemType }> = [];
  const app = createTestApp({
    listLibraryItems: async (input) => {
      calls.push(input);
      return [sampleItem()];
    },
  });

  const response = await app.request("/");
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    data: [{
      id: 1,
      url: "https://static.example.com/notes.md",
      name: "Notes",
      type: "document",
      created_at: "2026-01-01T00:00:00.000Z",
    }],
  });
  assertEquals(calls, [{ userId: TEST_USER_ID, type: undefined }]);
});

Deno.test("GET /?type=image filters by type", async () => {
  const calls: Array<{ userId: string; type?: LibraryItemType }> = [];
  const app = createTestApp({
    listLibraryItems: async (input) => {
      calls.push(input);
      return [sampleItem({ id: 2, type: "image", name: "Graph" })];
    },
  });

  const response = await app.request("/?type=image");
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.ok, true);
  assertEquals(body.data[0].type, "image");
  assertEquals(calls, [{ userId: TEST_USER_ID, type: "image" }]);
});

Deno.test("GET / rejects invalid type filter", async () => {
  const app = createTestApp({});

  const response = await app.request("/?type=video");
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "INVALID_LIBRARY_LIST",
      message:
        'Invalid "type". Expected "all" or one of: document, image, audio_transcript, website, youtube_transcript.',
    },
  });
});

Deno.test("GET /search requires a non-empty q", async () => {
  const app = createTestApp({});

  const response = await app.request("/search");
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "INVALID_LIBRARY_SEARCH",
      message: 'Expected a non-empty "q" query parameter.',
    },
  });
});

Deno.test("GET /search delegates to searchLibrary", async () => {
  const calls: Array<{ userId: string; query: string }> = [];
  const results: LibrarySearchResult[] = [{
    id: 1,
    name: "Notes",
    src_url: "https://static.example.com/notes.md",
    type: "document",
    similarity: 0.9,
    matched_content: "grid of diagrams",
    matched_chunk_index: 0,
    snippet: "grid of diagrams",
    highlights: [{ start: 0, end: 16 }],
  }];
  const app = createTestApp({
    searchLibrary: async (input) => {
      calls.push(input);
      return results;
    },
  });

  const response = await app.request("/search?q=grid%20of%20diagrams");
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    data: [{
      id: 1,
      name: "Notes",
      url: "https://static.example.com/notes.md",
      type: "document",
      similarity: 0.9,
      matched_content: "grid of diagrams",
      matched_chunk_index: 0,
      snippet: "grid of diagrams",
      highlights: [{ start: 0, end: 16 }],
    }],
  });
  assertEquals(calls, [{
    userId: TEST_USER_ID,
    query: "grid of diagrams",
  }]);
});

Deno.test("POST /upload accepts a file source", async () => {
  const calls: LibraryUploadInput[] = [];
  const app = createTestApp({
    handleLibraryUpload: async (input) => {
      calls.push(input);
      return sampleItem({ id: 9, name: "photo.png", type: "image" });
    },
  });

  const form = new FormData();
  form.set("file", new File(["pixels"], "photo.png", { type: "image/png" }));

  const response = await app.request("/upload", {
    method: "POST",
    body: form,
  });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    data: {
      id: 9,
      url: "https://static.example.com/notes.md",
      name: "photo.png",
      type: "image",
    },
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0]!.userId, TEST_USER_ID);
  assertEquals(calls[0]!.source.type, "file");
  if (calls[0]!.source.type === "file") {
    assertEquals(calls[0]!.source.file.name, "photo.png");
  }
});

Deno.test("POST /upload accepts a url source", async () => {
  const calls: LibraryUploadInput[] = [];
  const app = createTestApp({
    handleLibraryUpload: async (input) => {
      calls.push(input);
      return sampleItem({
        id: 3,
        name: "Article",
        type: "website",
        src_url: "https://static.example.com/article.md",
      });
    },
  });

  const form = new FormData();
  form.set("url", "https://example.com/article");

  const response = await app.request("/upload", {
    method: "POST",
    body: form,
  });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    data: {
      id: 3,
      url: "https://static.example.com/article.md",
      name: "Article",
      type: "website",
    },
  });
  assertEquals(calls, [{
    userId: TEST_USER_ID,
    source: { type: "url", url: "https://example.com/article" },
  }]);
});

Deno.test("POST /upload rejects both file and url", async () => {
  const app = createTestApp({});

  const form = new FormData();
  form.set("file", new File(["x"], "a.txt", { type: "text/plain" }));
  form.set("url", "https://example.com");

  const response = await app.request("/upload", {
    method: "POST",
    body: form,
  });
  assertEquals(response.status, 400);
  assertEquals((await response.json()).error.code, "INVALID_LIBRARY_UPLOAD");
});

Deno.test("POST /upload rejects invalid urls", async () => {
  const app = createTestApp({});

  const form = new FormData();
  form.set("url", "ftp://example.com/file");

  const response = await app.request("/upload", {
    method: "POST",
    body: form,
  });
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "INVALID_LIBRARY_UPLOAD",
      message: 'Invalid "url". Expected an absolute http(s) URL.',
    },
  });
});

Deno.test("POST /upload returns 400 for LibraryClientError", async () => {
  const app = createTestApp({
    handleLibraryUpload: async () => {
      const error = new Error("Video is currently not supported");
      error.name = "LibraryClientError";
      throw error;
    },
  });

  const form = new FormData();
  form.set("file", new File(["x"], "clip.mp4", { type: "video/mp4" }));

  const response = await app.request("/upload", {
    method: "POST",
    body: form,
  });
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "INVALID_LIBRARY_UPLOAD",
      message: "Video is currently not supported",
    },
  });
});

Deno.test("DELETE /:id deletes the authenticated user's item", async () => {
  const calls: Array<{ libraryId: number; userId: string }> = [];
  const app = createTestApp({
    deleteLibraryItem: async (input) => {
      calls.push(input);
      return true;
    },
  });

  const response = await app.request("/42", { method: "DELETE" });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    data: { id: 42 },
  });
  assertEquals(calls, [{ libraryId: 42, userId: TEST_USER_ID }]);
});

Deno.test("DELETE /:id returns 404 when item is missing", async () => {
  const app = createTestApp({
    deleteLibraryItem: async () => false,
  });

  const response = await app.request("/99", { method: "DELETE" });
  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "LIBRARY_ITEM_NOT_FOUND",
      message: "Library item not found.",
    },
  });
});

Deno.test("DELETE /:id rejects non-integer ids", async () => {
  const app = createTestApp({});

  const response = await app.request("/abc", { method: "DELETE" });
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "INVALID_LIBRARY_DELETE",
      message: 'Invalid "id". Expected a positive integer.',
    },
  });
});
