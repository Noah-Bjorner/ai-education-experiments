const runtime = globalThis.__REMOTION_REMOTE_RUNTIME__;

if (!runtime) {
  throw new Error("Remotion remote runtime is not available.");
}

const { React, Remotion } = runtime;

import { AbsoluteFill, interpolate, Easing, useCurrentFrame } from 'remotion';

export const fps = 30;
export const durationInFrames = 90;
export const width = 1920;
export const height = 1080;

export default function RemotionVideo() {
  const frame = useCurrentFrame();

  const scale = interpolate(
    frame,
    [0, durationInFrames / 2, durationInFrames],
    [1, 1.6, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.sin),
    }
  );

  const titleOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at center, #1e1b4b 0%, #0f172a 100%)',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
          boxShadow: '0 0 120px rgba(129, 140, 248, 0.5)',
          scale,
        }}
      />
      <div
        style={{
          marginTop: 160,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 64,
          fontWeight: 700,
          color: '#e2e8f0',
          letterSpacing: 8,
          textTransform: 'uppercase',
          opacity: titleOpacity,
        }}
      >
        Pulse
      </div>
    </AbsoluteFill>
  );
}