import { whiteboardSpecWith } from "../index.ts";
import { classifyWhiteboardGoal } from "../classifier.ts";
/** Opt-in paid evaluation. No provider calls or files are created without --live.
 * deno run --allow-sys --allow-env --allow-read --allow-write --allow-net spec/eval.ts --live [output-directory]
 */
import { InvalidSpecOutput, type SpecGenerationEvent } from "./index.ts";
import { WhiteboardSpecError } from "./validation.ts";

export const SPEC_EVAL_CASES = [
  {
    id: "xy-chart",
    goal:
      "Draw a bar chart comparing books read: Ada 4, Ben 7, Cam 3. Label the axes and call out Ben's bar as the highest.",
  },
  {
    id: "pie-chart",
    goal:
      "Show how 20 books split into 12 fiction, 6 nonfiction, and 2 poetry. Circle the fiction percentage and explain that fiction is more than half.",
  },
  {
    id: "math",
    goal:
      "Help a seventh grader solve 2(x + 3) = 10. Show each algebra step and box the final answer.",
  },
  {
    id: "coordinate",
    goal:
      "Graph y = 2*x on coordinate axes from -3 to 3. Add a labeled point at (1, 2) and an arrow callout explaining its coordinates.",
  },
  {
    id: "geometry",
    goal:
      "Draw a right triangle with perpendicular sides 3 cm and 4 cm and hypotenuse 5 cm. Mark the right angle and explain which sides are perpendicular.",
  },
  {
    id: "text",
    goal:
      "Create a text-only board posing this question: What additional evidence would distinguish correlation from causation? No charts or diagrams.",
  },
  {
    id: "triangle-area",
    goal:
      "Help a sixth grader connect perpendicular height to triangle area: base 10 cm and height 6 cm. Show a diagram with a right-angle mark, then the formula and substitution. Annotate the height to distinguish it from a sloping side.",
  },
  {
    id: "question-chart-takeaway",
    goal:
      "Pose this question, then show a scatter plot, then state a takeaway: Does studying longer cause higher scores? Illustrative pairs (hours, score): (1,50), (2,60), (3,65), (4,80). Conclude that association alone does not establish causation. Label the data as illustrative.",
  },
] as const;

if (import.meta.main) {
  if (!Deno.args.includes("--live")) {
    console.log(
      "Live evaluation is disabled. Pass --live to run both modes and retain specs and diagnostics.",
    );
  } else {
    const { generateSpecOutput } = await import(
      "./provider.ts"
    );
    const directory = Deno.args.find((arg) => arg !== "--live") ??
      `output/spec-eval/${new Date().toISOString().replaceAll(":", "-")}`;
    await Deno.mkdir(directory, { recursive: true });
    const summary: { id: string; mode: string; ok: boolean }[] = [];
    for (const mode of ["fast", "smart"] as const) {
      for (const entry of SPEC_EVAL_CASES) {
        const events: SpecGenerationEvent[] = [];
        const attempts: unknown[] = [];
        let classification: unknown;
        const input = { goal: entry.goal, mode };
        const base = `${directory}/${entry.id}-${mode}`;
        let diagnostic: unknown;
        let ok = false;
        try {
          const spec = await whiteboardSpecWith(input, {
            classify: async (goal) => {
              const result = await classifyWhiteboardGoal(goal);
              classification = result;
              return result;
            },
            generate: async (request) => {
              try {
                const result = await generateSpecOutput(request);
                attempts.push({ output: result.output });
                return result;
              } catch (error) {
                if (error instanceof InvalidSpecOutput) {
                  attempts.push({ output: error.output, decodingFailed: true });
                }
                throw error;
              }
            },
            report: (event) => events.push(event),
          });
          await Deno.writeTextFile(
            `${base}.spec.json`,
            JSON.stringify(spec, null, 2),
          );
          diagnostic = { input, events, outcome: "success" };
          ok = true;
        } catch (error) {
          diagnostic = {
            input,
            events,
            outcome: "failure",
            error: error instanceof WhiteboardSpecError
              ? { name: error.name, issues: error.issues }
              : {
                name: error instanceof Error ? error.name : "UnknownError",
                message: error instanceof Error
                  ? error.message
                  : "Unexpected failure",
              },
          };
        }
        await Deno.writeTextFile(
          `${base}.diagnostics.json`,
          JSON.stringify({ diagnostic, classification, attempts }, null, 2),
        );
        summary.push({ id: entry.id, mode, ok });
        console.log(`${mode}/${entry.id}: ${ok ? "passed" : "failed"}`);
      }
    }
    await Deno.writeTextFile(
      `${directory}/summary.json`,
      JSON.stringify(summary, null, 2),
    );
    if (summary.some((result) => !result.ok)) Deno.exitCode = 1;
  }
}
