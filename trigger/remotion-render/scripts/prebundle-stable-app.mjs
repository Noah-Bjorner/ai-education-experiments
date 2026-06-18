import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { mkdir, writeFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const remotionDir = path.join(rootDir, ".remotion");
const serveUrlFile = path.join(remotionDir, "stable-serve-url.txt");

await mkdir(remotionDir, { recursive: true });

const serveUrl = await bundle({
  entryPoint: path.join(rootDir, "src/remotion/index.ts"),
  webpackOverride: (config) => config,
});

await writeFile(serveUrlFile, serveUrl, "utf8");
console.log(`Pre-bundled stable Remotion app: ${serveUrl}`);
