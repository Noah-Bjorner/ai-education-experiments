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
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION_IN_FRAMES = 90;
const RemotionVideo = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(
    frame,
    [0, DURATION_IN_FRAMES / 2, DURATION_IN_FRAMES],
    [0.5, 1.5, 0.5],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );
  const opacity = interpolate(
    frame,
    [0, DURATION_IN_FRAMES / 2, DURATION_IN_FRAMES],
    [0.6, 1, 0.6],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }
  );
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        width: WIDTH,
        height: HEIGHT,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }
    },
    /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle at 30% 30%, #ff6b6b, #c0392b)",
          scale,
          opacity,
          boxShadow: "0 0 80px rgba(255, 107, 107, 0.5)"
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
