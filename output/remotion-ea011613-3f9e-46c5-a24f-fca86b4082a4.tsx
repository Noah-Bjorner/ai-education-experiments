import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';

export const width = 1080;
export const height = 1080;
export const fps = 30;
export const durationInFrames = 120;

const BG = '#0f172a';
const CIRCLE = '#60a5fa';

const RemotionVideo: React.FC = () => {
	const frame = useCurrentFrame();

	const scale = interpolate(frame, [0, 30, 60, 90, 119], [0.6, 1.25, 0.75, 1.15, 0.6], {
		easing: Easing.bezier(0.45, 0, 0.55, 1),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const opacity = interpolate(frame, [0, 15, 60, 105, 119], [0.7, 1, 1, 0.9, 0.7], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill
			style={{
				backgroundColor: BG,
				justifyContent: 'center',
				alignItems: 'center',
			}}
		>
			<div
				style={{
					width: 260,
					height: 260,
					borderRadius: '50%',
					background: `radial-gradient(circle at 35% 35%, #93c5fd 0%, ${CIRCLE} 45%, #2563eb 100%)`,
					boxShadow: '0 0 80px rgba(96, 165, 250, 0.35)',
					scale,
					opacity,
				}}
			/>
		</AbsoluteFill>
	);
};

export default RemotionVideo;