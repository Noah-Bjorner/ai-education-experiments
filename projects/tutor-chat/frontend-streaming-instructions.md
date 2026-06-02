# Tutor Chat Frontend Streaming Instructions

Use this prompt for the frontend AI agent:

```text
Implement Tutor Chat streaming with a separate activity indicator. The activity indicator should only show two kinds of user-facing status:
1. The tutor is thinking.
2. The tutor is using a known tool.

Consume the backend response with AI SDK `useChat`; the backend returns an AI SDK UI message stream, so do not manually parse SSE chunks. The request body must include `messages`, `tutor_instructions`, and `student_profile`.

The backend also emits transient custom data events when a tool begins executing:
- `type: "data-tool-status"`
- `data.toolName`: `"question"` or `"webSearch"`
- `data.status`: `"started"`
- `data.label`: user-facing activity label, such as `"Creating a question..."` or `"Searching the web..."`
- `data.toolCallId`: the AI SDK tool call id

Use the `useChat` data-event callback for `data-tool-status` as the primary way to show tool activity. This event is intentionally transient, so it is not saved into message history and may not appear in `message.parts` after the stream finishes.

For the activity indicator, use `useChat().status`:
- `submitted`: show "Thinking..."
- `streaming`: show "Thinking..." unless the latest assistant message currently has an active tool part.
- `ready`: show no activity indicator.
- `error`: show an error/retry UI.

For fallback tool activity, inspect only the latest assistant message's `parts`. The only tool parts this API intentionally exposes are:
- `tool-question`
- `tool-webSearch`

Important: some tools can complete too quickly for the UI to visibly render an in-progress tool part. In this backend, `tool-question` is a synchronous local tool, so the regular tool part may go from absent to `state === "output-available"` very quickly. The `data-tool-status` event is sent from the tool's `execute` function as soon as the server starts running that tool.

To make tool usage visible, latch the latest `data-tool-status` label for a minimum duration, such as 500-800ms, unless an error appears. This is a UI presentation rule; it does not mean the tool is still running.

Treat tool states this way:
- `input-streaming`: the tool call is being prepared. Show a tool-specific status.
- `input-available`: the tool has complete input and is executing or ready to execute. Show a tool-specific status.
- `output-available`: the tool is done. Render the real tool output somewhere else if the product needs it. If no in-progress state was visible, briefly show the latched tool label before or alongside the output.
- `output-error`: show a tool error message.

Recommended labels:
- `tool-question` with `input-streaming` or `input-available`: "Creating a question..."
- `tool-webSearch` with `input-streaming`: "Preparing web search..."
- `tool-webSearch` with `input-available`: "Searching the web..."
- any tool with `output-error`: show `part.errorText` or "The tool failed."

Ignore every other part type in the activity indicator, including:
- `step-start`
- `text`
- `reasoning`
- source or file parts
- any unknown part type

Do not display raw stream state names like "next step", "step-start", "input-available", or "output-available" to the user. These are internal stream details.

Example activity derivation:

// First handle transient data events from useChat. The exact hook option name
// may vary by installed AI SDK version, but the event payload is the part.
function onDataPart(part) {
  if (part.type !== "data-tool-status") return;

  setLatchedActivity({
    kind: "tool",
    label: part.data.label,
    toolName: part.data.toolName,
    toolCallId: part.data.toolCallId,
    expiresAt: Date.now() + 800,
  });
}

// Then derive the current status. Prefer the latched tool activity over generic
// thinking while it has not expired.
function getTutorActivity(status, messages, latchedActivity) {
  if (status === "error") return { kind: "error", label: "Something went wrong." };
  if (latchedActivity && latchedActivity.expiresAt > Date.now()) return latchedActivity;

  const latestAssistant = [...messages].reverse().find(
    (message) => message.role === "assistant",
  );

  const parts = latestAssistant?.parts ?? [];
  for (const part of [...parts].reverse()) {
    if (part.type === "tool-question") {
      if (part.state === "output-error") {
        return { kind: "tool-error", label: part.errorText ?? "The question tool failed." };
      }
      if (part.state === "input-streaming" || part.state === "input-available") {
        return { kind: "tool", label: "Creating a question..." };
      }
      if (part.state === "output-available" && status !== "ready") {
        return { kind: "tool", label: "Creating a question..." };
      }
    }

    if (part.type === "tool-webSearch") {
      if (part.state === "output-error") {
        return { kind: "tool-error", label: part.errorText ?? "The web search failed." };
      }
      if (part.state === "input-streaming") {
        return { kind: "tool", label: "Preparing web search..." };
      }
      if (part.state === "input-available") {
        return { kind: "tool", label: "Searching the web..." };
      }
      if (part.state === "output-available" && status !== "ready") {
        return { kind: "tool", label: "Searching the web..." };
      }
    }
  }

  if (status === "ready") return null;

  if (status === "submitted" || status === "streaming") {
    return { kind: "thinking", label: "Thinking..." };
  }

  return null;
}

Render normal assistant message content separately if needed. This activity indicator should not render assistant text, `step-start`, or raw debug metadata.

Private hidden reasoning is not guaranteed to be available. Use `status` and tool lifecycle states for "thinking" and "using tools" UI.
```
