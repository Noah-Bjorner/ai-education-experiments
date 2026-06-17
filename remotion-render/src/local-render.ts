import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderRemotionVideo } from "./render/render-remotion";
import { uploadTsx } from "./storage/r2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

loadEnv({ path: path.join(repoRoot, ".env") });

const SAMPLE_TSX = `export const WIDTH = 1280;
export const HEIGHT = 720;
export const FPS = 30;
export const DURATION_IN_FRAMES = 90;

const RemotionVideo = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20, 70, 89], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, 30, 60, 89], [0.8, 1, 1, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FCFAF8",
        justifyContent: "center",
        alignItems: "center",
        color: "#1F1F1F",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 700, opacity, scale }}>
        Remotion render smoke test
      </div>
    </AbsoluteFill>
  );
};

export default RemotionVideo;
`;

async function resolveTsxUrl(): Promise<string> {
  const input = process.argv[2];

  if (input?.startsWith("http://") || input?.startsWith("https://")) {
    return input;
  }

  const tsx = input
    ? await readFile(path.join(repoRoot, "output", input), "utf8")
    : SAMPLE_TSX;

  return uploadTsx(tsx, { temporary: true });
}

async function main() {
  const tsxUrl = await resolveTsxUrl();
  const startedAt = Date.now();

  const result = await renderRemotionVideo({
    tsxUrl,
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 90,
  });

  console.log(
    JSON.stringify(
      {
        tsxUrl,
        ...result,
        elapsedMs: Date.now() - startedAt,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
