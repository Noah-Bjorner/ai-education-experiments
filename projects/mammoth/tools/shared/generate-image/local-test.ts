import { generateImage } from "./index.ts";

if (import.meta.main) {
  const result = await generateImage({
    model: "google/gemini-3.1-flash-lite-image",
    prompt: "A beautiful sunset over a calm ocean",
    useLanguageModel: true,
    aspectRatio: "16:9",
    resolution: "1K",
  });
  console.log("result: ", result);
}
