const MAX_TSX_BYTES = 2_000_000;

export async function fetchTsx(tsxUrl: string): Promise<string> {
  const response = await fetch(tsxUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch TSX from ${tsxUrl} (${response.status}).`,
    );
  }

  const tsx = await response.text();

  if (!tsx.trim()) {
    throw new Error(`TSX source at ${tsxUrl} is empty.`);
  }

  if (tsx.length > MAX_TSX_BYTES) {
    throw new Error(
      `TSX source exceeds maximum size of ${MAX_TSX_BYTES} bytes.`,
    );
  }

  return tsx;
}
