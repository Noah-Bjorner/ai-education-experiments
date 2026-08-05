function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    if (!last) return "upload.bin";
    return decodeURIComponent(last);
  } catch {
    return "upload.bin";
  }
}

export async function fileFromUrl(url: string, filename?: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  const name = filename ?? filenameFromUrl(url);
  return new File([blob], name, {
    type: blob.type || "application/octet-stream",
  });
}
