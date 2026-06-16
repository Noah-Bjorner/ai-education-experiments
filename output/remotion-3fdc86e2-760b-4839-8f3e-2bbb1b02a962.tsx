export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION_IN_FRAMES = 180;

const RemotionVideo = () => {
  const frame = useCurrentFrame();
  const half = DURATION_IN_FRAMES / 2;

  const size =
    frame < half
      ? interpolate(frame, [0, half], [120, 420], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
        })
      : interpolate(frame, [half, DURATION_IN_FRAMES], [420, 120], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
        });

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        background: "radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b)",
          boxShadow: "0 0 60px rgba(255, 107, 107, 0.5)",
        }}
      />
    </div>
  );
};

export default RemotionVideo;