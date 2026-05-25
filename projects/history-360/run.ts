import { workflow, WorkflowOutput } from "./workflow.ts";

const _localRun = async (prompt: string) => {
    const uniqueId = crypto.randomUUID();
    const fileName = `${prompt.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${uniqueId}`;
    const output: WorkflowOutput = await workflow(prompt);
    await Deno.mkdir(new URL("./output/", import.meta.url), { recursive: true });
    await Deno.writeTextFile(
      new URL(`./output/${fileName}.json`, import.meta.url),
      JSON.stringify(output, null, 2),
    );
}

