import React from "react";
import { Composition } from "remotion";
import type { RemotionSceneSpec } from "../../../client/spec-contract.ts";
import SpecVideo from "./SpecVideo";

export const DEFAULT_SPEC: RemotionSceneSpec = {
  background: "#f8fafc",
  width: 1200,
  height: 800,
  fps: 30,
  durationInFrames: 300,
  elements: [
    {
      type: "text",
      text: "Spec renderer ready",
      x: 600,
      y: 360,
      fontSize: 56,
      color: "#0f172a",
      textAlign: "center",
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={SpecVideo}
        durationInFrames={DEFAULT_SPEC.durationInFrames}
        fps={DEFAULT_SPEC.fps}
        width={DEFAULT_SPEC.width}
        height={DEFAULT_SPEC.height}
        defaultProps={DEFAULT_SPEC}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames,
          fps: props.fps,
          width: props.width,
          height: props.height,
        })}
      />
    </>
  );
};
