import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, Sequence } from "remotion";

export const WIDTH = 1200;
export const HEIGHT = 800;
export const FPS = 30;
export const DURATION_IN_FRAMES = 300;

const BG = "#FCFAF8";
const TEXT_PRIMARY = "#1F1F1F";
const TEXT_SECONDARY = "#6B6B6B";
const MUTED = "#979797";
const SUCCESS = "#22C55E";
const ACCENT = "#F59E0B";
const DANGER = "#EF4444";
const PRIMARY = "#F54E00";

const CENTER_X = WIDTH / 2;
const BASELINE_Y = 600;
const SIGMA_PX = 120;
const CURVE_PEAK_HEIGHT = 340;
const X_MIN = -3.5;
const X_MAX = 3.5;

const normalPDF = (x: number, mu: number, sigma: number) => {
  return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
};

const maxDensity = normalPDF(0, 0, 1);
const densityScale = CURVE_PEAK_HEIGHT / maxDensity;

const xToScreen = (x: number) => CENTER_X + x * SIGMA_PX;
const yForX = (x: number) => BASELINE_Y - normalPDF(x, 0, 1) * densityScale;

const buildAreaPath = (xStart: number, xEnd: number) => {
  const steps = 80;
  const dx = (xEnd - xStart) / steps;
  let d = `M ${xToScreen(xStart)} ${BASELINE_Y}`;
  for (let i = 0; i <= steps; i++) {
    const x = xStart + i * dx;
    d += ` L ${xToScreen(x)} ${yForX(x)}`;
  }
  d += ` L ${xToScreen(xEnd)} ${BASELINE_Y} Z`;
  return d;
};

const buildCurvePath = (xStart: number, xEnd: number) => {
  const steps = 120;
  const dx = (xEnd - xStart) / steps;
  let d = `M ${xToScreen(xStart)} ${yForX(xStart)}`;
  for (let i = 1; i <= steps; i++) {
    const x = xStart + i * dx;
    d += ` L ${xToScreen(x)} ${yForX(x)}`;
  }
  return d;
};

const seededValues: number[] = [];
let seedState = 12345;
const seededRandom = () => {
  seedState = (seedState * 9301 + 49297) % 233280;
  return seedState / 233280;
};
for (let i = 0; i < 56; i++) {
  const u1 = Math.max(0.0001, seededRandom());
  const u2 = seededRandom();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  seededValues.push(Math.max(-3.4, Math.min(3.4, z)));
}

const DotGrid = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage: "radial-gradient(circle, rgba(31,31,31,0.12) 1px, transparent 1px)",
      backgroundSize: "16px 16px",
    }}
  />
);

const Axis = () => {
  const tickXs = [-3, -2, -1, 0, 1, 2, 3];
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      <line
        x1={xToScreen(X_MIN)}
        y1={BASELINE_Y}
        x2={xToScreen(X_MAX)}
        y2={BASELINE_Y}
        stroke={TEXT_SECONDARY}
        strokeWidth={2}
      />
      {tickXs.map((t) => (
        <g key={t}>
          <line
            x1={xToScreen(t)}
            y1={BASELINE_Y}
            x2={xToScreen(t)}
            y2={BASELINE_Y + 8}
            stroke={TEXT_SECONDARY}
            strokeWidth={2}
          />
          <text
            x={xToScreen(t)}
            y={BASELINE_Y + 32}
            textAnchor="middle"
            fontSize={18}
            fill={TEXT_SECONDARY}
            fontWeight={500}
          >
            {t === 0 ? "μ" : `${t > 0 ? "+" : ""}${t}σ`}
          </text>
        </g>
      ))}
      <text
        x={xToScreen(0)}
        y={BASELINE_Y + 64}
        textAnchor="middle"
        fontSize={20}
        fill={TEXT_SECONDARY}
        fontWeight={500}
      >
        value
      </text>
    </svg>
  );
};

const BellCurve = () => (
  <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
    <path
      d={buildCurvePath(X_MIN, X_MAX)}
      fill="none"
      stroke={TEXT_PRIMARY}
      strokeWidth={5}
      strokeLinecap="round"
    />
  </svg>
);

const MeanLine = () => (
  <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
    <line
      x1={CENTER_X}
      y1={BASELINE_Y}
      x2={CENTER_X}
      y2={yForX(0) - 18}
      stroke={MUTED}
      strokeWidth={2}
      strokeDasharray="8 6"
    />
  </svg>
);

const SymmetryHighlight = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [100, 115, 125, 140], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: WIDTH,
        height: HEIGHT,
        opacity,
        pointerEvents: "none",
      }}
    >
      <svg width={WIDTH} height={HEIGHT}>
        <path
          d={`M ${xToScreen(-1.5)} ${yForX(-1.5)} L ${xToScreen(-0.5)} ${yForX(-0.5)}`}
          stroke={PRIMARY}
          strokeWidth={3}
          markerEnd="url(#arrow)"
        />
        <path
          d={`M ${xToScreen(1.5)} ${yForX(1.5)} L ${xToScreen(0.5)} ${yForX(0.5)}`}
          stroke={PRIMARY}
          strokeWidth={3}
          markerEnd="url(#arrow)"
        />
        <defs>
          <marker id="arrow" markerWidth={10} markerHeight={10} refX={8} refY={3} orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill={PRIMARY} />
          </marker>
        </defs>
      </svg>
      <div
        style={{
          position: "absolute",
          left: CENTER_X,
          top: yForX(0) - 86,
          transform: "translateX(-50%)",
          background: BG,
          padding: "6px 14px",
          borderRadius: 8,
          color: PRIMARY,
          fontSize: 22,
          fontWeight: 700,
          border: `2px solid ${PRIMARY}`,
          WebkitTextStroke: "4px " + BG,
          paintOrder: "stroke fill",
        }}
      >
        symmetric
      </div>
    </div>
  );
};

const DataDots = () => {
  const frame = useCurrentFrame();
  return (
    <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      {seededValues.map((z, i) => {
        const startFrame = 40 + i * 1.1;
        const endFrame = startFrame + 30;
        const t = interpolate(frame, [startFrame, endFrame], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        const startY = 180;
        const landY = yForX(z) - 6;
        const y = interpolate(t, [0, 1], [startY, landY]);
        const opacity = interpolate(frame, [startFrame, startFrame + 8, endFrame, endFrame + 20], [0, 1, 1, 0.85], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <circle
            key={i}
            cx={xToScreen(z)}
            cy={y}
            r={5}
            fill={PRIMARY}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
};

const Band = ({
  from,
  to,
  xStart,
  xEnd,
  color,
  label,
  sublabel,
  labelX,
}: {
  from: number;
  to: number;
  xStart: number;
  xEnd: number;
  color: string;
  label: string;
  sublabel: string;
  labelX: number;
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const currentStart = xStart + (xEnd - xStart) * p;
  const path = buildAreaPath(-currentStart, currentStart);
  const opacity = interpolate(frame, [from, from + 10, to], [0, 0.6, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelOpacity = interpolate(frame, [to - 10, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT, pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT}>
        <path d={path} fill={color} opacity={opacity} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: labelX,
          top: yForX(0) - 130,
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: labelOpacity,
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            color: TEXT_PRIMARY,
            lineHeight: 1,
            WebkitTextStroke: "5px " + BG,
            paintOrder: "stroke fill",
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 18,
            fontWeight: 500,
            color: TEXT_SECONDARY,
            whiteSpace: "nowrap",
            WebkitTextStroke: "4px " + BG,
            paintOrder: "stroke fill",
          }}
        >
          {sublabel}
        </div>
      </div>
    </div>
  );
};

const OuterBand = ({
  from,
  to,
  innerStart,
  outerEnd,
  color,
  label,
  sublabel,
  labelX,
}: {
  from: number;
  to: number;
  innerStart: number;
  outerEnd: number;
  color: string;
  label: string;
  sublabel: string;
  labelX: number;
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const currentOuter = innerStart + (outerEnd - innerStart) * p;
  const leftPath = buildAreaPath(-currentOuter, -innerStart);
  const rightPath = buildAreaPath(innerStart, currentOuter);
  const opacity = interpolate(frame, [from, from + 10, to], [0, 0.6, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelOpacity = interpolate(frame, [to - 10, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT, pointerEvents: "none" }}>
      <svg width={WIDTH} height={HEIGHT}>
        <path d={leftPath} fill={color} opacity={opacity} />
        <path d={rightPath} fill={color} opacity={opacity} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: labelX,
          top: yForX(outerEnd) + 30,
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: labelOpacity,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: TEXT_PRIMARY,
            lineHeight: 1,
            WebkitTextStroke: "5px " + BG,
            paintOrder: "stroke fill",
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 16,
            fontWeight: 500,
            color: TEXT_SECONDARY,
            whiteSpace: "nowrap",
            WebkitTextStroke: "4px " + BG,
            paintOrder: "stroke fill",
          }}
        >
          {sublabel}
        </div>
      </div>
    </div>
  );
};

export default function RemotionVideo() {
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <DotGrid />

      <div
        style={{
          position: "absolute",
          top: HEIGHT * 0.06,
          left: 0,
          width: WIDTH,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: HEIGHT * 0.06,
            fontWeight: 800,
            color: TEXT_PRIMARY,
            WebkitTextStroke: "6px " + BG,
            paintOrder: "stroke fill",
          }}
        >
          The Normal Distribution
        </h1>
        <p
          style={{
            margin: "12px 0 0",
            fontSize: HEIGHT * 0.03,
            fontWeight: 500,
            color: TEXT_SECONDARY,
            WebkitTextStroke: "4px " + BG,
            paintOrder: "stroke fill",
          }}
        >
          a bell curve centered on the mean
        </p>
      </div>

      <Axis />
      <MeanLine />

      <Sequence from={130} durationInFrames={120} layout="none">
        <Band
          from={130}
          to={170}
          xStart={0}
          xEnd={1}
          color={`${SUCCESS}40`}
          label="68%"
          sublabel="within 1 standard deviation"
          labelX={CENTER_X}
        />
      </Sequence>

      <Sequence from={170} durationInFrames={80} layout="none">
        <OuterBand
          from={170}
          to={210}
          innerStart={1}
          outerEnd={2}
          color={`${ACCENT}40`}
          label="95%"
          sublabel="within 2 standard deviations"
          labelX={xToScreen(1.5)}
        />
      </Sequence>

      <Sequence from={210} durationInFrames={90} layout="none">
        <OuterBand
          from={210}
          to={250}
          innerStart={2}
          outerEnd={3.5}
          color={`${DANGER}40`}
          label="99.7%"
          sublabel="within 3 standard deviations"
          labelX={xToScreen(2.75)}
        />
      </Sequence>

      <BellCurve />

      <Sequence from={40} durationInFrames={100} layout="none">
        <DataDots />
      </Sequence>

      <SymmetryHighlight />

      <div
        style={{
          position: "absolute",
          top: BASELINE_Y - 18,
          left: xToScreen(0) + 12,
          fontSize: 20,
          fontWeight: 700,
          color: TEXT_PRIMARY,
          WebkitTextStroke: "4px " + BG,
          paintOrder: "stroke fill",
        }}
      >
        mean
      </div>
    </AbsoluteFill>
  );
}