import React from "react";
import type { RemotionSceneSpec, SpecSceneElement } from "../../../client/spec-contract.ts";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "remotion";

type SpecVideoProps = RemotionSceneSpec;

function isVisible(
  frame: number,
  element: { startFrame?: number; endFrame?: number },
  durationInFrames: number,
): boolean {
  const start = element.startFrame ?? 0;
  const end = element.endFrame ?? durationInFrames;
  return frame >= start && frame < end;
}

function getOpacity(
  frame: number,
  element: { opacity?: number; startFrame?: number; endFrame?: number },
  durationInFrames: number,
): number {
  if (!isVisible(frame, element, durationInFrames)) {
    return 0;
  }

  return element.opacity ?? 1;
}

function renderElement(
  element: SpecSceneElement,
  frame: number,
  durationInFrames: number,
  background: string,
  key: string,
): React.ReactNode {
  const opacity = getOpacity(frame, element, durationInFrames);

  if (opacity <= 0) {
    return null;
  }

  switch (element.type) {
    case "text": {
      const strokeWidth = element.strokeWidth ?? 5;
      const strokeColor = element.strokeColor ?? background;

      return (
        <div
          key={key}
          style={{
            position: "absolute",
            left: element.x,
            top: element.y,
            transform: element.textAlign === "center"
              ? "translateX(-50%)"
              : element.textAlign === "right"
              ? "translateX(-100%)"
              : undefined,
            color: element.color ?? "#111111",
            fontSize: element.fontSize ?? 48,
            fontWeight: 600,
            textAlign: element.textAlign ?? "center",
            opacity,
            WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
            paintOrder: "stroke fill",
            whiteSpace: "pre-wrap",
            maxWidth: "90%",
          }}
        >
          {element.text}
        </div>
      );
    }
    case "rect":
      return (
        <div
          key={key}
          style={{
            position: "absolute",
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            backgroundColor: element.fill ?? "transparent",
            border: element.stroke
              ? `${element.strokeWidth ?? 2}px solid ${element.stroke}`
              : undefined,
            borderRadius: element.borderRadius ?? 0,
            opacity,
          }}
        />
      );
    case "circle":
      return (
        <div
          key={key}
          style={{
            position: "absolute",
            left: element.cx - element.r,
            top: element.cy - element.r,
            width: element.r * 2,
            height: element.r * 2,
            borderRadius: "50%",
            backgroundColor: element.fill ?? "transparent",
            border: element.stroke
              ? `${element.strokeWidth ?? 2}px solid ${element.stroke}`
              : undefined,
            opacity,
          }}
        />
      );
    case "line": {
      const dx = element.x2 - element.x1;
      const dy = element.y2 - element.y1;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      return (
        <div
          key={key}
          style={{
            position: "absolute",
            left: element.x1,
            top: element.y1,
            width: length,
            height: element.strokeWidth ?? 2,
            backgroundColor: element.stroke ?? "#111111",
            transformOrigin: "0 50%",
            transform: `rotate(${angle}deg)`,
            opacity,
          }}
        />
      );
    }
    case "group":
      return (
        <React.Fragment key={key}>
          {element.elements.map((child, index) =>
            renderElement(
              child,
              frame,
              durationInFrames,
              background,
              `${key}-${index}`,
            )
          )}
        </React.Fragment>
      );
    default:
      return null;
  }
}

export const SpecVideo: React.FC<SpecVideoProps> = (props) => {
  const frame = useCurrentFrame();
  const fadeInEnd = Math.min(15, props.durationInFrames);
  const fadeOutStart = Math.max(props.durationInFrames - 15, fadeInEnd);
  const masterOpacity = interpolate(
    frame,
    [0, fadeInEnd, fadeOutStart, props.durationInFrames],
    [0, 1, 1, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: props.background,
        opacity: masterOpacity,
      }}
    >
      {props.elements.map((element, index) =>
        renderElement(
          element,
          frame,
          props.durationInFrames,
          props.background,
          `element-${index}`,
        )
      )}
    </AbsoluteFill>
  );
};

export default SpecVideo;
