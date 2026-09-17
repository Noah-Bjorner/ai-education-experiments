/** Loaded only for URL output; SVG output needs no storage credentials. */
export async function uploadWhiteboardSvg(svg: string): Promise<string> {
  const { uploadImage } = await import("../../../../../../lib/cloudflare.ts");
  const name = crypto.randomUUID();
  return uploadImage(
    new Blob([svg], { type: "image/svg+xml" }),
    `${name}.svg`,
    {
      prefix: "sixtus/whiteboards",
      name,
    },
  );
}
