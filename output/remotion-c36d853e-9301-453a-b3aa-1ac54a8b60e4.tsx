export const WIDTH = 1280;
export const HEIGHT = 720;
export const FPS = 30;
export const DURATION_IN_FRAMES = 90;

const RemotionVideo = () => {
  const frame = useCurrentFrame();

  const scale = interpolate(
    frame,
    [0, DURATION_IN_FRAMES / 2, DURATION_IN_FRAMES],
    [0.5, 1.5, 0.5],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const opacity = interpolate(
    frame,
    [0, DURATION_IN_FRAMES / 2, DURATION_IN_FRAMES],
    [0.6, 1, 0.6],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle at 30% 30%, #ff6b6b, #c0392b)",
          scale: scale,
          opacity: opacity,
          boxShadow: "0 0 80px rgba(255, 107, 107, 0.5)",
        }}
      />
    </div>
  );
};

export default RemotionVideo;