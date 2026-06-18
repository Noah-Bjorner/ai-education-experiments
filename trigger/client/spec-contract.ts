import { REMOTION_RENDER_LIMITS } from "./contract.ts";

const MAX_ELEMENTS = 200;
const MAX_TEXT_LENGTH = 500;
const MAX_NESTING_DEPTH = 4;

const frameRangeSchema = {
  startFrame: "number (optional, default 0)",
  endFrame: "number (optional, default durationInFrames)",
} as const;

/** Shared visual element types rendered by the stable Remotion app. */
export type SpecTextElement = {
  type: "text";
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  textAlign?: "left" | "center" | "right";
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  startFrame?: number;
  endFrame?: number;
};

export type SpecRectElement = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  opacity?: number;
  startFrame?: number;
  endFrame?: number;
};

export type SpecCircleElement = {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  startFrame?: number;
  endFrame?: number;
};

export type SpecLineElement = {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  startFrame?: number;
  endFrame?: number;
};

export type SpecGroupElement = {
  type: "group";
  elements: SpecSceneElement[];
  opacity?: number;
  startFrame?: number;
  endFrame?: number;
};

export type SpecSceneElement =
  | SpecTextElement
  | SpecRectElement
  | SpecCircleElement
  | SpecLineElement
  | SpecGroupElement;

export type RemotionSceneSpec = {
  background: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  elements: SpecSceneElement[];
};

export type TriggerRemotionSpecRenderInput = {
  spec: RemotionSceneSpec;
};

export type TriggerRemotionSpecRenderResult = {
  videoUrl: string;
  runId: string;
};

function assertIntegerInRange(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return value as number;
}

function assertOptionalFrameRange(
  element: { startFrame?: unknown; endFrame?: unknown },
  durationInFrames: number,
  label: string,
): void {
  if (element.startFrame !== undefined) {
    assertIntegerInRange(element.startFrame, `${label}.startFrame`, 0, durationInFrames - 1);
  }

  if (element.endFrame !== undefined) {
    assertIntegerInRange(element.endFrame, `${label}.endFrame`, 1, durationInFrames);
  }

  if (
    element.startFrame !== undefined &&
    element.endFrame !== undefined &&
    (element.startFrame as number) >= (element.endFrame as number)
  ) {
    throw new Error(`${label}.startFrame must be less than ${label}.endFrame.`);
  }
}

function validateElement(
  element: unknown,
  durationInFrames: number,
  depth: number,
  path: string,
): SpecSceneElement {
  if (depth > MAX_NESTING_DEPTH) {
    throw new Error(`Spec nesting exceeds max depth of ${MAX_NESTING_DEPTH} at ${path}.`);
  }

  if (!element || typeof element !== "object" || !("type" in element)) {
    throw new Error(`Invalid element at ${path}: missing type.`);
  }

  const typed = element as Record<string, unknown>;
  assertOptionalFrameRange(typed, durationInFrames, path);

  switch (typed.type) {
    case "text": {
      if (typeof typed.text !== "string" || typed.text.length === 0) {
        throw new Error(`${path}.text must be a non-empty string.`);
      }

      if (typed.text.length > MAX_TEXT_LENGTH) {
        throw new Error(`${path}.text exceeds max length of ${MAX_TEXT_LENGTH}.`);
      }

      return typed as SpecTextElement;
    }
    case "rect":
    case "circle":
    case "line":
      return typed as SpecRectElement | SpecCircleElement | SpecLineElement;
    case "group": {
      if (!Array.isArray(typed.elements)) {
        throw new Error(`${path}.elements must be an array.`);
      }

      return {
        ...(typed as SpecGroupElement),
        elements: typed.elements.map((child, index) =>
          validateElement(child, durationInFrames, depth + 1, `${path}.elements[${index}]`)
        ),
      };
    }
    default:
      throw new Error(`Unsupported element type at ${path}: ${String(typed.type)}.`);
  }
}

function countElements(elements: SpecSceneElement[]): number {
  return elements.reduce((count, element) => {
    if (element.type === "group") {
      return count + 1 + countElements(element.elements);
    }

    return count + 1;
  }, 0);
}

export function validateRemotionSceneSpec(spec: unknown): RemotionSceneSpec {
  if (!spec || typeof spec !== "object") {
    throw new Error("spec must be an object.");
  }

  const candidate = spec as Partial<RemotionSceneSpec>;

  if (typeof candidate.background !== "string" || candidate.background.length === 0) {
    throw new Error("spec.background must be a non-empty string.");
  }

  const width = assertIntegerInRange(
    candidate.width,
    "spec.width",
    1,
    REMOTION_RENDER_LIMITS.maxWidth,
  );
  const height = assertIntegerInRange(
    candidate.height,
    "spec.height",
    1,
    REMOTION_RENDER_LIMITS.maxHeight,
  );
  const fps = assertIntegerInRange(
    candidate.fps,
    "spec.fps",
    1,
    REMOTION_RENDER_LIMITS.maxFps,
  );
  const durationInFrames = assertIntegerInRange(
    candidate.durationInFrames,
    "spec.durationInFrames",
    1,
    REMOTION_RENDER_LIMITS.maxDurationInFrames,
  );

  if (!Array.isArray(candidate.elements)) {
    throw new Error("spec.elements must be an array.");
  }

  const elements = candidate.elements.map((element, index) =>
    validateElement(element, durationInFrames, 0, `spec.elements[${index}]`)
  );

  if (countElements(elements) > MAX_ELEMENTS) {
    throw new Error(`spec exceeds max element count of ${MAX_ELEMENTS}.`);
  }

  return {
    background: candidate.background,
    width,
    height,
    fps,
    durationInFrames,
    elements,
  };
}

export function validateTriggerRemotionSpecRenderInput(
  input: TriggerRemotionSpecRenderInput,
): TriggerRemotionSpecRenderInput {
  return {
    spec: validateRemotionSceneSpec(input.spec),
  };
}

export const SPEC_FRAME_RANGE_DOCS = frameRangeSchema;
