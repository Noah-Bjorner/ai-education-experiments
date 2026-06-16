import "@std/dotenv/load";
import * as esbuild from "esbuild";
import { generateText, tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import { uploadDocument } from "../../../../lib/cloudflare.ts";
import { REMOTION_FILE_GENERATOR_INSTRUCTIONS } from "./PROMPT.ts";

const REMOTION_FILE_GENERATOR_MODEL = "anthropic/claude-opus-4.8";
const REMOTION_FILE_GENERATOR_MODEL_REASONING = "medium";

const demonstrationVideoConfigSchema = z.object({
  width: z.number().int().positive().describe("Video width in pixels."),
  height: z.number().int().positive().describe("Video height in pixels."),
  fps: z.number().int().positive().describe("Frames per second."),
  durationInFrames: z.number().int().positive().describe("Total video duration in frames."),
});

export const demonstrationOutputSchema = demonstrationVideoConfigSchema.extend({
  srcUrl: z.string().url().describe(
    "Public URL for the generated remotion .mjs file.",
  ),
});

export type DemonstrationOutput = z.infer<typeof demonstrationOutputSchema>;

const REMOTION_RUNTIME_BINDINGS = [
  "AbsoluteFill",
  "Audio",
  "Easing",
  "Freeze",
  "Img",
  "Loop",
  "OffthreadVideo",
  "Sequence",
  "Series",
  "Video",
  "cancelRender",
  "continueRender",
  "delayRender",
  "getInputProps",
  "interpolate",
  "interpolateColors",
  "random",
  "spring",
  "staticFile",
  "useCurrentFrame",
  "useCurrentScale",
  "useVideoConfig",
] as const;

type RuntimeAlias = {
  imported: string;
  local: string;
};

interface RuntimeImports {
  reactAliases: Set<string>;
  reactBindings: Map<string, RuntimeAlias>;
  remotionAliases: Set<string>;
  remotionBindings: Map<string, RuntimeAlias>;
}

function stripMarkdownCodeFence(source: string): string {
  const trimmed = source.trim();
  const match = trimmed.match(
    /^```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n([\s\S]*?)\n```$/,
  );

  return match ? match[1].trim() : trimmed;
}

function extractIntegerConstant(source: string, name: string): number {
  const match = source.match(
    new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*(?::\\s*number)?\\s*=\\s*(\\d+)\\s*(?:as\\s+const\\s*)?;`,
      "m",
    ),
  );

  if (!match) {
    throw new Error(
      `Generated Remotion file must define numeric constant ${name}.`,
    );
  }

  return Number(match[1]);
}

function extractDemonstrationVideoConfig(
  tsx: string,
): z.infer<typeof demonstrationVideoConfigSchema> {
  const source = stripMarkdownCodeFence(tsx);

  return demonstrationVideoConfigSchema.parse({
    width: extractIntegerConstant(source, "WIDTH"),
    height: extractIntegerConstant(source, "HEIGHT"),
    fps: extractIntegerConstant(source, "FPS"),
    durationInFrames: extractIntegerConstant(source, "DURATION_IN_FRAMES"),
  });
}

function parseNamedImports(importClause: string): RuntimeAlias[] {
  const namedMatch = importClause.match(/\{([\s\S]*?)\}/);

  if (!namedMatch) {
    return [];
  }

  return namedMatch[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry): RuntimeAlias[] => {
      const withoutType = entry.replace(/^type\s+/, "").trim();

      if (!withoutType) {
        return [];
      }

      const [imported, local = imported] = withoutType
        .split(/\s+as\s+/)
        .map((part) => part.trim());

      return [{ imported, local }];
    });
}

function parseObjectDestructureBindings(
  destructureClause: string,
): RuntimeAlias[] {
  return destructureClause
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry): RuntimeAlias[] => {
      const withoutDefault = entry.split("=")[0]?.trim();

      if (!withoutDefault || withoutDefault.startsWith("...")) {
        return [];
      }

      const [imported, local = imported] = withoutDefault
        .split(":")
        .map((part) => part.trim());

      if (!imported || !local) {
        return [];
      }

      return [{ imported, local }];
    });
}

function parseDefaultOrNamespaceAlias(importClause: string): string | null {
  const withoutNamedImports = importClause.replace(/\{[\s\S]*?\}/, "").trim();
  const namespaceMatch = withoutNamedImports.match(
    /\*\s+as\s+([A-Za-z_$][\w$]*)/,
  );

  if (namespaceMatch) {
    return namespaceMatch[1];
  }

  const defaultImport = withoutNamedImports
    .replace(/^type\s+/, "")
    .replace(/,$/, "")
    .trim();

  return defaultImport || null;
}

function addRuntimeImport(
  runtimeImports: RuntimeImports,
  moduleName: string,
  importClause: string,
): void {
  const target = moduleName === "react" ? "React" : "Remotion";
  const aliases = moduleName === "react"
    ? runtimeImports.reactAliases
    : runtimeImports.remotionAliases;
  const bindings = moduleName === "react"
    ? runtimeImports.reactBindings
    : runtimeImports.remotionBindings;
  const defaultOrNamespaceAlias = parseDefaultOrNamespaceAlias(importClause);

  if (defaultOrNamespaceAlias && defaultOrNamespaceAlias !== target) {
    aliases.add(defaultOrNamespaceAlias);
  }

  for (const binding of parseNamedImports(importClause)) {
    bindings.set(binding.local, binding);
  }
}

function removeRuntimeImports(
  source: string,
): { source: string; runtimeImports: RuntimeImports } {
  const runtimeImports: RuntimeImports = {
    reactAliases: new Set(),
    reactBindings: new Map(),
    remotionAliases: new Set(),
    remotionBindings: new Map(),
  };
  const importFromRegex =
    /(^|\n)\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g;
  const withoutRuntimeImports = source.replace(
    importFromRegex,
    (
      match,
      leadingNewline: string,
      importClause: string,
      moduleName: string,
    ) => {
      if (
        moduleName === "react" || moduleName === "remotion" ||
        moduleName === "@remotion/media"
      ) {
        addRuntimeImport(runtimeImports, moduleName, importClause);
        return leadingNewline;
      }

      return match;
    },
  );
  const sideEffectImportRegex =
    /(^|\n)\s*import\s+["'](react|remotion|@remotion\/media)["'];?/g;
  const withoutSideEffectImports = withoutRuntimeImports.replace(
    sideEffectImportRegex,
    "$1",
  );
  const runtimeDestructureRegex =
    /(^|\n)\s*(?:const|let|var)\s+\{([\s\S]*?)\}\s*=\s*(React|Remotion)\s*;?/g;
  const withoutRuntimeDestructures = withoutSideEffectImports.replace(
    runtimeDestructureRegex,
    (
      _match,
      leadingNewline: string,
      destructureClause: string,
      runtimeName: string,
    ) => {
      const bindings = runtimeName === "React"
        ? runtimeImports.reactBindings
        : runtimeImports.remotionBindings;

      for (
        const binding of parseObjectDestructureBindings(
          destructureClause,
        )
      ) {
        bindings.set(binding.local, binding);
      }

      return leadingNewline;
    },
  );

  return {
    source: withoutRuntimeDestructures,
    runtimeImports,
  };
}

function formatObjectDestructure(bindings: Iterable<RuntimeAlias>): string {
  return [...bindings]
    .map(({ imported, local }) =>
      imported === local ? imported : `${imported}: ${local}`
    )
    .join(",\n    ");
}

function buildRuntimePreamble(runtimeImports: RuntimeImports): string {
  const remotionBindings = new Map<string, RuntimeAlias>();

  for (const binding of REMOTION_RUNTIME_BINDINGS) {
    remotionBindings.set(binding, { imported: binding, local: binding });
  }

  for (const binding of runtimeImports.remotionBindings.values()) {
    remotionBindings.set(binding.local, binding);
  }

  const lines = [
    "const runtime = globalThis.__REMOTION_REMOTE_RUNTIME__;",
    "",
    "if (!runtime) {",
    '    throw new Error("Remotion remote runtime is not available.");',
    "}",
    "",
    "const { React, Remotion } = runtime;",
  ];
  const reactBindings = formatObjectDestructure(
    runtimeImports.reactBindings.values(),
  );

  if (reactBindings) {
    lines.push(`const {\n    ${reactBindings}\n} = React;`);
  }

  for (const alias of runtimeImports.reactAliases) {
    lines.push(`const ${alias} = React;`);
  }

  for (const alias of runtimeImports.remotionAliases) {
    lines.push(`const ${alias} = Remotion;`);
  }

  lines.push(
    `const {\n    ${
      formatObjectDestructure(remotionBindings.values())
    }\n} = Remotion;`,
  );

  return `${lines.join("\n")}\n\n`;
}

function assertNoAdditionalFunctionExports(source: string): void {
  const hasDefaultFunctionExport =
    /^\s*export\s+default\s+(?:async\s+)?function\b/m.test(source) ||
    /^\s*export\s+default\s+(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/m
      .test(source) ||
    /^\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?/m.test(source);
  const exportedFunctionNames = [
    ...source.matchAll(
      /^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    ),
    ...source.matchAll(
      /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm,
    ),
  ].map((match) => match[1]);

  if (
    exportedFunctionNames.length > 1 ||
    (hasDefaultFunctionExport && exportedFunctionNames.length > 0)
  ) {
    throw new Error(
      `Remote Remotion modules may only export one component function. Remove exported helper function(s): ${
        exportedFunctionNames.join(", ")
      }.`,
    );
  }
}

function assertRemoteModuleContract(mjs: string): void {
  if (/^\s*import\s/m.test(mjs)) {
    throw new Error(
      "Compiled Remotion module still contains import declarations.",
    );
  }

  if (/\bfrom\s+["'](?:react|remotion|@remotion\/media)["']/.test(mjs)) {
    throw new Error(
      "Compiled Remotion module still contains bare React or Remotion imports.",
    );
  }
}

async function convertTsxToMjs(tsx: string): Promise<string> {
  const source = stripMarkdownCodeFence(tsx);
  const { source: sourceWithoutImports, runtimeImports } = removeRuntimeImports(
    source,
  );
  const hasRuntimePreamble = sourceWithoutImports.includes(
    "__REMOTION_REMOTE_RUNTIME__",
  );
  const moduleSource = hasRuntimePreamble
    ? sourceWithoutImports
    : `${buildRuntimePreamble(runtimeImports)}${sourceWithoutImports}`;

  assertNoAdditionalFunctionExports(moduleSource);

  const result = await esbuild.transform(moduleSource, {
    loader: "tsx",
    format: "esm",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2020",
    charset: "utf8",
  });
  const mjs = result.code.trimEnd();

  assertRemoteModuleContract(mjs);

  return `${mjs}\n`;
}

const createDemonstrationInputSchema = z.object({
  instruction: z.string().min(1).describe(
    "A self-contained plan for the demonstration: what concept to show, what appears on screen, and how the motion unfolds over time.",
  ),
});

type CreateDemonstrationOptions = z.infer<
  typeof createDemonstrationInputSchema
>;

export async function createDemonstration(
  options: CreateDemonstrationOptions,
): Promise<DemonstrationOutput> {
  const { instruction } = options;
  const uniqueId = crypto.randomUUID();
  const outDir = `./output/${uniqueId}`;
  try {
    // grounding references pre-processing

    const { text: rawTsx } = await generateText({
      model: REMOTION_FILE_GENERATOR_MODEL,
      reasoning: REMOTION_FILE_GENERATOR_MODEL_REASONING,
      system: REMOTION_FILE_GENERATOR_INSTRUCTIONS,
      prompt: instruction,
    });
    await Deno.mkdir(outDir, { recursive: true });
    const videoConfig = extractDemonstrationVideoConfig(rawTsx);
    const tsxPath = `${outDir}/remotion-${uniqueId}.tsx`;
    await Deno.writeTextFile(tsxPath, rawTsx);

    const mjs = await convertTsxToMjs(rawTsx);
    const mjsFilename = `remotion-${uniqueId}.mjs`;
    const mjsPath = `${outDir}/${mjsFilename}`;
    await Deno.writeTextFile(mjsPath, mjs);

    const srcUrl = await uploadDocument(
      new Blob([mjs], { type: "text/javascript; charset=utf-8" }),
      mjsFilename,
      { temporary: true },
    );

    return demonstrationOutputSchema.parse({
      srcUrl,
      ...videoConfig,
    });
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    try {
      await Deno.remove(outDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.warn(
          "Failed to clean up demonstration output directory.",
          error,
        );
      }
    }
  }
}

export const demonstrationTool = tool({
  description: "Show the learner an idea visually, like sketching on a whiteboard, by generating a short animated clip. Plays alongside your written response and carries the visual part of the explanation. Pass instruction as a self-contained brief: the concept, what appears on screen, and how it moves over time.",
  inputSchema: createDemonstrationInputSchema,
  execute: createDemonstration,
});

export type DemonstrationToolInvocation = UIToolInvocation<
  typeof demonstrationTool
>;



/*
const start = performance.now();
const result = await createDemonstration({
  instruction:
    "Show the teritory held by Nazi Germany in the beginning of World War II and at the end.",
});
const end = performance.now();
console.log(
  `Result(v4) (${REMOTION_FILE_GENERATOR_MODEL}):`,
  JSON.stringify(result, null, 2),
);
console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
*/
/*
  Examples
  - Show how recursion works by visualizing the call stack for a factorial(3) calculation. First, show three stack frames piling up as the function calls itself down to the base case of factorial(1) = 1. Then, show the stack unwinding as values are returned back down the stack to compute the final result of 6.
  - Explain supply and demand curves by showing a graph with price on the vertical axis and quantity on the horizontal axis. Start with a downward-sloping demand curve and an upward-sloping supply curve, then highlight the equilibrium point where they intersect. Show what happens when demand increases by shifting the demand curve right, raising both equilibrium price and quantity.
  - Explain the offside rule in soccer by showing a simple field view with an attacker, defenders, the ball, and the goal. Pause at the moment the pass is made, draw a line through the second-to-last defender, and show that an attacker is offside if they are beyond that line and actively involved in the play. Contrast it with an onside example where the attacker stays level with or behind the defender when the pass is played.
  - Explain the three branches of government in the USA by showing three labeled pillars: Legislative, Executive, and Judicial. Show Congress making laws, the President enforcing laws, and the Supreme Court interpreting laws. Then animate arrows between the branches to show checks and balances, such as vetoes, judicial review, and congressional oversight.
  - Explain bell curve distributions by showing a normal distribution curve centered around the mean. Highlight that most values cluster near the center, fewer values appear toward the tails, and the curve is symmetric. Add bands for one, two, and three standard deviations to show how data becomes less common farther from the average.
  - Explain the multiple generations, long term effect on having an TFR(Total Fertility Rate) of 1.5 on total population by doing a graph showing how many children each generation will have.

  - Show the teritory held by Nazi Germany in the beginning of World War II and at the end.
  - Show the EUs expansion from inception to present day use blue to indicate the countries that joined.
  */
