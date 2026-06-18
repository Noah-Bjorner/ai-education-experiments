import { aptGet, ffmpeg } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk/v3";

const chromeHeadlessShellPackages = [
  "libnss3",
  "libnspr4",
  "libdbus-1-3",
  "libatk1.0-0",
  "libatk-bridge2.0-0",
  "libcups2",
  "libgbm-dev",
  "libasound2",
  "libxrandr2",
  "libxkbcommon-dev",
  "libxfixes3",
  "libxcomposite1",
  "libxdamage1",
  "libpango-1.0-0",
  "libcairo2",
] as const;

const remotionBrowserExtension = {
  name: "remotion-browser",
  onBuildComplete: async (context: {
    target: string;
    addLayer: (layer: {
      id: string;
      files?: Record<string, string>;
      commands?: string[];
    }) => void;
  }) => {
    if (context.target === "dev") {
      return;
    }

    context.addLayer({
      id: "remotion-browser",
      files: {
        "./scripts/ensure-browser.mjs": "/app/scripts/ensure-browser.mjs",
      },
      commands: ["node scripts/ensure-browser.mjs"],
    });
  },
};

const remotionStablePrebundleExtension = {
  name: "remotion-stable-prebundle",
  onBuildComplete: async (context: {
    target: string;
    addLayer: (layer: {
      id: string;
      files?: Record<string, string>;
      commands?: string[];
    }) => void;
  }) => {
    if (context.target === "dev") {
      return;
    }

    context.addLayer({
      id: "remotion-stable-prebundle",
      files: {
        "./scripts/prebundle-stable-app.mjs":
          "/app/scripts/prebundle-stable-app.mjs",
      },
      commands: ["node scripts/prebundle-stable-app.mjs"],
    });
  },
};

export default defineConfig({
  project: "proj_dobwylueborepmumfjpd",
  runtime: "node",
  logLevel: "log",
  build: {
    extensions: [
      ffmpeg(),
      aptGet({ packages: [...chromeHeadlessShellPackages] }),
      remotionBrowserExtension,
      remotionStablePrebundleExtension,
    ],
    external: [
      "remotion",
      "@remotion/renderer",
      "@remotion/bundler",
      "@rspack/core",
      "@rspack/binding",
      "react",
      "react-dom",
    ],
  },
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
});
