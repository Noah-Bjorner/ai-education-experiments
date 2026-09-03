import { generateGlossary } from "./index.ts";
import type { GlossaryRequest } from "./schema.ts";

const request = {
  messages: [
    {
      id: "user-1",
      role: "user",
      parts: [
        {
          type: "text",
          text: "Can you explain how photosynthesis works?",
        },
      ],
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "text",
          text:
            "Photosynthesis is the process plants use to convert light energy into chemical energy. It mainly occurs in chloroplasts, where chlorophyll absorbs sunlight. During the light-dependent reactions, water is split and ATP and NADPH are produced.",
        },
      ],
    },
    {
      id: "assistant-2",
      role: "assistant",
      parts: [
        {
          type: "text",
          text:
            "The Calvin cycle then uses ATP and NADPH to fix carbon dioxide into glucose. Oxygen is released as a byproduct when water is split.",
        },
      ],
    },
  ],
} satisfies GlossaryRequest;

if (import.meta.main) {
  const start = performance.now();
  const result = await generateGlossary(request);

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `Time taken: ${((performance.now() - start) / 1000).toFixed(2)} seconds`,
  );
}
