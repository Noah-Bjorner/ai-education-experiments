import type { MammothUIMessage } from "./types.ts";

export async function transformMessages(
    messages: MammothUIMessage[],
  ): Promise<MammothUIMessage[]> {
    const latest = getLatestUserMessage(messages);
    if (!latest) return messages;
  
    switch (getUserTurnType(latest)) {
      case "assessment_submission":
        return rewriteLatestUserMessage(messages, formatAssessmentSubmission);
      case "question_answer":
        return rewriteLatestUserMessage(messages, formatQuestionAnswer);
      default:
        return messages;
    }
}