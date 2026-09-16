import { contextualize } from "./issues.ts";

/** Public errors expose actionable issues, never raw provider responses or stacks. */
export function whiteboardHttpError(cause: unknown, generated: boolean) {
  const error = contextualize(cause, {});
  const status = !generated && error.repairable ? 422 as const : 500 as const;
  return {
    status,
    body: {
      ok: false as const,
      error: {
        code: "WHITEBOARD_EXECUTE_FAILED",
        message:
          error.issues.some((issue) => issue.code === "INTERNAL_RENDER_ERROR")
            ? "Failed to execute the whiteboard request."
            : "The whiteboard contains content that could not be rendered.",
        issues: error.issues,
      },
    },
  };
}
