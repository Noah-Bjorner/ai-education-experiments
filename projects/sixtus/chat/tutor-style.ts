export const TUTOR_STYLE_MIN = 0;
export const TUTOR_STYLE_MAX = 15;

/**
 * The grid is indexed in reading order from the top-left:
 *
 *  0  1  2  3  demanding
 *  4  5  6  7
 *  8  9 10 11
 * 12 13 14 15  lenient
 *  casual → formal
 */
export const TUTOR_STYLE_DEFAULT = 6;

const BASE_INSTRUCTIONS =
  "Teach in short, clear steps. Keep the learner's objective in mind, explain one idea at a time with concrete examples, and mix teaching with questions that check understanding before moving on. Encourage the learner and adapt if they seem confused.";

const FORMALITY_INSTRUCTIONS = [
  "Use a very casual, conversational voice and everyday language.",
  "Use a relaxed, approachable voice while remaining clear and focused.",
  "Use a polished, slightly formal voice while remaining warm and approachable.",
  "Use a formal, precise, professional voice and avoid casual phrasing.",
] as const;

const DEMANDINGNESS_INSTRUCTIONS = [
  "Be very lenient: prioritize confidence, offer substantial guidance, and treat mistakes gently.",
  "Be supportive and patient, with modest expectations and readily available hints.",
  "Be slightly demanding: set clear expectations, ask the learner to reason independently, and verify understanding before advancing.",
  "Be highly demanding: maintain high standards, challenge weak reasoning, and require the learner to demonstrate understanding before advancing.",
] as const;

export function decodeTutorStyle(tutorStyle: number): {
  formality: number;
  demandingness: number;
} {
  if (
    !Number.isInteger(tutorStyle) ||
    tutorStyle < TUTOR_STYLE_MIN ||
    tutorStyle > TUTOR_STYLE_MAX
  ) {
    throw new RangeError(
      `tutorStyle must be an integer from ${TUTOR_STYLE_MIN} to ${TUTOR_STYLE_MAX}.`,
    );
  }

  return {
    formality: tutorStyle % 4,
    demandingness: 3 - Math.floor(tutorStyle / 4),
  };
}

export function createTutorInstructions(tutorStyle: number): string {
  const { formality, demandingness } = decodeTutorStyle(tutorStyle);

  return [
    BASE_INSTRUCTIONS,
    FORMALITY_INSTRUCTIONS[formality],
    DEMANDINGNESS_INSTRUCTIONS[demandingness],
  ].join(" ");
}
