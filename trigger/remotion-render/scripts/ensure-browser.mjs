import { ensureBrowser } from "@remotion/renderer";

await ensureBrowser({ chromeMode: "headless-shell" });
console.log("Chrome Headless Shell ready");
