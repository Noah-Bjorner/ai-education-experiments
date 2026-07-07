import "@std/dotenv/load";
import { google } from '@ai-sdk/google';
import { generateText, type ToolSet } from '@ai';

//plan: do the complete exeucution function first then the whole tool wrappiing and integration
//status: figure out if I need any other tools and review and improve current code quality

export const gatherContext = async (prompt: string) => {
  const start = performance.now();
  const { text, sources } = await generateText({
    model: 'google/gemini-3.5-flash',
    reasoning: 'low',
    tools: {
      google_search: google.tools.googleSearch({}),
      url_context: google.tools.urlContext({}),
    } as ToolSet,
    prompt: prompt,
  });
  const end = performance.now();
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
  console.log(text);
  console.log(sources);
}

