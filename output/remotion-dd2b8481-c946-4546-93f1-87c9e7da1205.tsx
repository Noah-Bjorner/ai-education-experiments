export const RemotionVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const growDuration = durationInFrames / 2;

  const scale =
    frame < growDuration
      ? interpolate(frame, [0, growDuration], [1, 2], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : interpolate(
          frame,
          [growDuration, durationInFrames],
          [2, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }
        );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at center, #1a1a2e 0%, #0f0f1a 100%)",
      }}
    >
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #ff6b6b 0%, #ee5a5a 40%, #c92a2a 100%)",
          boxShadow: "0 0 60px rgba(238, 90, 90, 0.5)",
          scale,
        }}
      />
    </div>
  );
};