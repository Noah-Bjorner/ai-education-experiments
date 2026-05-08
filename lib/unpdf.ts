import { extractImages, extractText, getDocumentProxy, getMeta } from "@unpdf";

export type PdfTextResult = {
  totalPages: number;
  text: string;
  metadata: Awaited<ReturnType<typeof getMeta>>;
};

export type PdfImage = Awaited<ReturnType<typeof extractImages>>[number];

export type PdfImagesResult = {
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    images: PdfImage[];
  }>;
};

export type DownloadedPdfImage = Omit<PdfImage, "data"> & {
  path: string;
};

export type DownloadAllPdfImagesResult = {
  totalPages: number;
  outputDir: string;
  pages: Array<{
    pageNumber: number;
    images: DownloadedPdfImage[];
  }>;
};

export type PdfTextContentItem = {
  type: "text";
  pageNumber: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
};

export type PdfImageContentItem = {
  type: "image";
  pageNumber: number;
  imageIndex: number;
  image: PdfImage;
};

export type PdfContentItem = PdfTextContentItem | PdfImageContentItem;

export type PdfContentResult = {
  totalPages: number;
  pages: Array<{
    pageNumber: number;
    text: string;
    items: PdfContentItem[];
  }>;
};

type PdfJsTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
};

function isPdfJsTextItem(item: unknown): item is PdfJsTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string" &&
    "transform" in item &&
    Array.isArray(item.transform)
  );
}

function joinPath(directory: string, fileName: string): string {
  return `${directory.replace(/\/+$/, "")}/${fileName}`;
}

function fileStem(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).at(-1) ?? "pdf";
  return fileName.replace(/\.[^.]+$/, "");
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") ||
    "image";
}

function crc32(bytes: Uint8Array<ArrayBufferLike>): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(
  type: string,
  data: Uint8Array<ArrayBufferLike> = new Uint8Array(),
): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  const typeBytes = new TextEncoder().encode(type);

  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));

  return chunk;
}

function concatBytes(parts: Uint8Array<ArrayBufferLike>[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
}

async function deflate(
  bytes: Uint8Array<ArrayBufferLike>,
): Promise<Uint8Array> {
  const blobBytes: Uint8Array<ArrayBuffer> = new Uint8Array(bytes);
  const stream = new Blob([blobBytes]).stream().pipeThrough(
    new CompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodePng(
  image: Pick<PdfImage, "channels" | "data" | "height" | "width">,
): Promise<Uint8Array> {
  const colorTypes: Record<number, number> = {
    1: 0,
    2: 4,
    3: 2,
    4: 6,
  };
  const colorType = colorTypes[image.channels];

  if (colorType === undefined) {
    throw new TypeError(`Unsupported image channel count: ${image.channels}.`);
  }

  const bytesPerRow = image.width * image.channels;
  const expectedLength = bytesPerRow * image.height;

  if (image.data.length !== expectedLength) {
    throw new RangeError(
      `Image data length ${image.data.length} does not match ${expectedLength}.`,
    );
  }

  const scanlines = new Uint8Array((bytesPerRow + 1) * image.height);

  for (let row = 0; row < image.height; row++) {
    const sourceStart = row * bytesPerRow;
    const targetStart = row * (bytesPerRow + 1);

    scanlines[targetStart] = 0;
    scanlines.set(
      image.data.subarray(sourceStart, sourceStart + bytesPerRow),
      targetStart + 1,
    );
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, image.width);
  ihdrView.setUint32(4, image.height);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", await deflate(scanlines)),
    pngChunk("IEND"),
  ]);
}

export async function parsePdfText(
  filePath: string,
): Promise<PdfTextResult> {
  const bytes = await Deno.readFile(filePath);
  const pdf = await getDocumentProxy(bytes);
  const [{ totalPages, text }, metadata] = await Promise.all([
    extractText(pdf, { mergePages: true }),
    getMeta(pdf, { parseDates: true }),
  ]);

  return {
    totalPages,
    text,
    metadata,
  };
}

export async function parsePdfContent(
  filePath: string,
): Promise<PdfContentResult> {
  const bytes = await Deno.readFile(filePath);
  const pdf = await getDocumentProxy(bytes);
  const totalPages = pdf.numPages;
  const pages: PdfContentResult["pages"] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const textItems: PdfTextContentItem[] = [];

    for (const item of textContent.items) {
      if (!isPdfJsTextItem(item) || item.str.trim().length === 0) continue;

      textItems.push({
        type: "text",
        pageNumber,
        text: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: item.width,
        height: item.height,
        fontName: item.fontName,
      });
    }

    const images = await extractImages(pdf, pageNumber);
    const imageItems = images.map((image, index) => ({
      type: "image" as const,
      pageNumber,
      imageIndex: index,
      image,
    }));

    pages.push({
      pageNumber,
      text: textItems.map((item) => item.text).join(" "),
      items: [...textItems, ...imageItems],
    });
  }

  return {
    totalPages,
    pages,
  };
}

export async function parsePdfImages(
  filePath: string,
  pageNumber?: number,
): Promise<PdfImagesResult> {
  const bytes = await Deno.readFile(filePath);
  const pdf = await getDocumentProxy(bytes);
  const totalPages = pdf.numPages;

  if (pageNumber !== undefined && (pageNumber < 1 || pageNumber > totalPages)) {
    throw new RangeError(
      `Page ${pageNumber} is outside the PDF page range 1-${totalPages}.`,
    );
  }

  const pageNumbers = pageNumber === undefined
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [pageNumber];

  const pages = await Promise.all(
    pageNumbers.map(async (page) => ({
      pageNumber: page,
      images: await extractImages(pdf, page),
    })),
  );

  return {
    totalPages,
    pages,
  };
}

export async function downloadAllPdfImages(
  filePath: string,
  outputDir = "./pdf-images",
): Promise<DownloadAllPdfImagesResult> {
  const { totalPages, pages } = await parsePdfImages(filePath);
  const sourceStem = safeFileSegment(fileStem(filePath));

  await Deno.mkdir(outputDir, { recursive: true });

  const downloadedPages = await Promise.all(
    pages.map(async ({ pageNumber, images }) => ({
      pageNumber,
      images: await Promise.all(
        images.map(async (image, index) => {
          const fileName = `${sourceStem}-p${pageNumber}-i${index + 1}-${
            safeFileSegment(image.key)
          }.png`;
          const path = joinPath(outputDir, fileName);
          const { data: _data, ...imageWithoutData } = image;

          await Deno.writeFile(path, await encodePng(image));

          return {
            ...imageWithoutData,
            path,
          };
        }),
      ),
    })),
  );

  return {
    totalPages,
    outputDir,
    pages: downloadedPages,
  };
}

if (import.meta.main) {
  const result = await downloadAllPdfImages("./assets/ma-ak-9.pdf");
  console.log(result);
}
