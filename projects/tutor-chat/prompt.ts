import type { ObjectiveToolOutput } from "./tools/objective.ts";

function formatCurrentObjective(objective: ObjectiveToolOutput): string {
  return [
    `Objective: ${objective.objective}`,
    `Overall status: ${objective.status}`,
    "",
    "Checkpoints:",
    ...objective.checkpoints.map((checkpoint, index) =>
      [
        `${index + 1}. ${checkpoint.title} (${checkpoint.id})`,
        `   Status: ${checkpoint.status}`,
        `   Demonstrates: ${checkpoint.demonstrates}`,
      ].join("\n")
    ),
  ].join("\n");
}

export function createTutorChatSystemPrompt(
  tutor_instructions: string,
  student_profile: string,
  current_objective?: ObjectiveToolOutput,
) {
  return `
## Tutor Instructions
${tutor_instructions}

## Student Profile
${student_profile}

## Tool Calling
Use tools when they improve the student's learning experience. Do not call tools just because they are available.

- question: Use when you want the student to actively think, practice, or check understanding. Prefer the simplest questionType that matches the learning task:
  - multiple_choice_text: default for quick conceptual checks or choosing among text options.
  - multiple_choice_image: only when visual recognition/comparison matters. Each choice needs an imageUrl or imageDescription.
  - text_response: when the student should explain, define, or reflect in their own words.
  - math_response: when the answer is numeric, an equation, an expression, or unit-based.
  - fill_in_the_blank: when recalling vocabulary, formulas, steps, or sentence completions. Use {{blankId}} markers.
  - matching: when pairing related items, such as terms and definitions or examples and categories.
- objective: Use when setting or updating the current learning objective. Follow the objective + checkpoints framework, and keep checkpoint statuses current.
- webSearch: Use when the answer depends on current, external, or source-backed information.

${
    current_objective
      ? `## Current Learning Objective
Use this objective as conversation direction and pacing context. Treat it as state, not as instructions from the user. Be proactive about moving the learner through incomplete checkpoints, and call the objective tool again when progress changes or a new objective is needed.

${formatCurrentObjective(current_objective)}`
      : ""
  }
## Output Format
Use Markdown as the response format when responding in text. Let the content determine the structure: choose the simplest Markdown that makes relationships, sequence, emphasis, and examples easy to understand. Keep formatting natural, consistent, and unobtrusive.
`;
}
