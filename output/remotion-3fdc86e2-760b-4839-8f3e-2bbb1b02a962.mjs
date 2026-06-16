const runtime = globalThis.__REMOTION_REMOTE_RUNTIME__;
if (!runtime) {
  throw new Error("Remotion remote runtime is not available.");
}
const { React, Remotion } = runtime;
const {
  AbsoluteFill,
  Audio,
  Easing,
  Freeze,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  Series,
  Video,
  cancelRender,
  continueRender,
  delayRender,
  getInputProps,
  interpolate,
  interpolateColors,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useCurrentScale,
  useVideoConfig
} = Remotion;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION_IN_FRAMES = 180;
const RemotionVideo = () => {
  const frame = useCurrentFrame();
  const half = DURATION_IN_FRAMES / 2;
  const size = frame < half ? interpolate(frame, [0, half], [120, 420], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1)
  }) : interpolate(frame, [half, DURATION_IN_FRAMES], [420, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1)
  });
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        width: WIDTH,
        height: HEIGHT,
        background: "radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    },
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          width: size,
          height: size,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b)",
          boxShadow: "0 0 60px rgba(255, 107, 107, 0.5)"
        }
      }
    )
  );
};
var stdin_default = RemotionVideo;
export {
  DURATION_IN_FRAMES,
  FPS,
  HEIGHT,
  WIDTH,
  stdin_default as default
};
