export const WIDTH = 1280;
export const HEIGHT = 720;
export const FPS = 30;
export const DURATION_IN_FRAMES = 90;

const RemotionVideo = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 20, 70, 89], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = interpolate(frame, [0, 25, 65, 89], [0.85, 1, 1, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const waveOffset = interpolate(frame, [30, 89], [0, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          opacity,
          scale,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: "#f8fafc",
            letterSpacing: "-0.02em",
          }}
        >
          Hello, World!
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: "#94a3b8",
            transform: `translateY(${Math.sin(frame / 8) * waveOffset}px)`,
          }}
        >
          Remotion render test
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default RemotionVideo;
