function isRemoteImage(source: string): boolean {
	return source.startsWith("http://") || source.startsWith("https://");
}

/** Returns a local file path, downloading remote image URLs into outDir when needed. */
export async function ensureLocalImagePath(
	source: string,
	outDir: string,
	prefix = "image-ref",
): Promise<string> {
	if (!isRemoteImage(source)) {
		return source;
	}

	const response = await fetch(source);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
	}

	const contentType = response.headers.get("content-type") ?? "image/jpeg";
	const ext = contentType.includes("png")
		? "png"
		: contentType.includes("webp")
		? "webp"
		: "jpg";
	await Deno.mkdir(outDir, { recursive: true });
	const path = `${outDir}/${prefix}-${crypto.randomUUID()}.${ext}`;
	await Deno.writeFile(path, new Uint8Array(await response.arrayBuffer()));
	return path;
}

export async function saveBase64ToFile(base64: string, outDir: string, prefix: string, format = "jpg"): Promise<string> {
	await Deno.mkdir(outDir, { recursive: true });
	const filename = `${prefix}-${crypto.randomUUID()}.${format}`;
	const path = `${outDir}/${filename}`;
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	await Deno.writeFile(path, bytes);
	return path;
}