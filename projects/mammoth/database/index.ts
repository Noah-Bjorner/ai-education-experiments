import "@std/dotenv/load";

export type LibraryItemType =
  | "document"
  | "image"
  | "audio_transcript"
  | "website"
  | "youtube_transcript";

export type LibraryItem = {
  id: number;
  user_id: string;
  name: string;
  src_url: string;
  type: LibraryItemType;
  created_at: string;
};

export type LibraryEmbeddingChunk = {
  chunkIndex: number;
  content: string;
  embedding: number[];
};

export type LibraryEmbedding = {
  id: number;
  library_id: number;
  user_id: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  created_at: string;
};

export type LibrarySearchMatch = {
  id: number;
  name: string;
  src_url: string;
  type: LibraryItemType;
  similarity: number;
  matched_content: string;
  matched_chunk_index: number;
};

const EMBEDDING_DIMENSIONS = 1536;

const supabaseURL = requiredEnvironmentVariable("SUPABASE_URL").replace(
  /\/$/,
  "",
);
const supabaseSecretKey = requiredEnvironmentVariable("SUPABASE_SECRET_KEY");

export async function createLibraryItem(input: {
  userId: string;
  name: string;
  srcUrl: string;
  type: LibraryItemType;
}): Promise<LibraryItem> {
  const response = await supabaseRequest("/rest/v1/library", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: input.userId,
      name: input.name,
      src_url: input.srcUrl,
      type: input.type,
    }),
  });

  const rows = await response.json() as LibraryItem[];
  const item = rows[0];
  if (!item) {
    throw new Error("Supabase did not return the created library item.");
  }

  return item;
}

export async function createLibraryEmbeddings(input: {
  libraryId: number;
  userId: string;
  chunks: LibraryEmbeddingChunk[];
}): Promise<LibraryEmbedding[]> {
  if (input.chunks.length === 0) {
    return [];
  }

  assertEmbeddingDimensions(input.chunks);

  const response = await supabaseRequest("/rest/v1/library_embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(
      input.chunks.map((chunk) => ({
        library_id: input.libraryId,
        user_id: input.userId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
      })),
    ),
  });

  return await response.json() as LibraryEmbedding[];
}

/** Inserts a library item and its embedding chunks in one Postgres RPC / transaction. */
export async function createLibraryWithEmbeddings(input: {
  userId: string;
  name: string;
  srcUrl: string;
  type: LibraryItemType;
  chunks: LibraryEmbeddingChunk[];
}): Promise<LibraryItem> {
  assertEmbeddingDimensions(input.chunks);

  const response = await supabaseRequest(
    "/rest/v1/rpc/create_library_with_embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: input.userId,
        p_name: input.name,
        p_src_url: input.srcUrl,
        p_type: input.type,
        p_chunks: input.chunks,
      }),
    },
  );

  const item = await response.json() as LibraryItem;
  if (!item?.id) {
    throw new Error("Supabase RPC did not return the created library item.");
  }

  return item;
}

/** Lists library items for a user, newest first. Optionally filter by exact stored type. */
export async function listLibraryItems(input: {
  userId: string;
  type?: LibraryItemType;
}): Promise<LibraryItem[]> {
  const params = new URLSearchParams({
    user_id: `eq.${input.userId}`,
    order: "created_at.desc",
    select: "*",
  });
  if (input.type) {
    params.set("type", `eq.${input.type}`);
  }

  const response = await supabaseRequest(
    `/rest/v1/library?${params.toString()}`,
    { method: "GET" },
  );

  return await response.json() as LibraryItem[];
}

/** Semantic search: one best-matching library item per root row, ranked by chunk similarity. */
export async function matchLibraryItems(input: {
  userId: string;
  queryEmbedding: number[];
  matchThreshold?: number;
  matchCount?: number;
}): Promise<LibrarySearchMatch[]> {
  if (input.queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have ${EMBEDDING_DIMENSIONS} dimensions, got ${input.queryEmbedding.length}.`,
    );
  }

  const response = await supabaseRequest(
    "/rest/v1/rpc/match_library_items",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: input.queryEmbedding,
        match_threshold: input.matchThreshold ?? 0.7,
        match_count: input.matchCount ?? 10,
        filter_user_id: input.userId,
      }),
    },
  );

  return await response.json() as LibrarySearchMatch[];
}

/** Deletes a library item. Related `library_embeddings` rows are removed by ON DELETE CASCADE. */
export async function deleteLibraryItem(input: {
  libraryId: number;
  userId: string;
}): Promise<boolean> {
  const response = await supabaseRequest(
    `/rest/v1/library?id=eq.${encodeURIComponent(String(input.libraryId))}` +
      `&user_id=eq.${encodeURIComponent(input.userId)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=representation",
      },
    },
  );

  const rows = await response.json() as LibraryItem[];
  return rows.length > 0;
}

async function supabaseRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", supabaseSecretKey);
  headers.set("Authorization", `Bearer ${supabaseSecretKey}`);

  const response = await fetch(`${supabaseURL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Supabase Data API request failed (${response.status}): ${details}`,
    );
  }

  return response;
}

function assertEmbeddingDimensions(chunks: LibraryEmbeddingChunk[]): void {
  for (const chunk of chunks) {
    if (chunk.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding must have ${EMBEDDING_DIMENSIONS} dimensions, got ${chunk.embedding.length}.`,
      );
    }
  }
}

function requiredEnvironmentVariable(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}
