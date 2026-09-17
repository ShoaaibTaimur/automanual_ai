import React from 'react';
import { useCurrentFrame } from 'remotion';
import { InteractionEvent } from '@automanual/shared';

interface ElementHighlightProps {
  events: InteractionEvent[];
  fps: number;
}

export const ElementHighlight: React.FC<ElementHighlightProps> = ({ events, fps }) => {
  const frame = useCurrentFrame();
  const currentTimeMs = (frame / fps) * 1000;

  // Only highlight real interactive clicked elements (exclude dummy screen-center boxes)
  const activeEvent = events.find(
    e =>
      e.type === 'click' &&
      typeof e.x === 'number' &&
      typeof e.y === 'number' &&
      typeof e.width === 'number' &&
      typeof e.height === 'number' &&
      e.width > 12 &&
      e.width < 500 &&
      e.height > 12 &&
      e.height < 200 &&
      !(e.x === 960 && e.y === 540) &&
      currentTimeMs >= e.timestamp - 200 &&
      currentTimeMs <= e.timestamp + 800
  );

  if (!activeEvent || !activeEvent.width || !activeEvent.height) return null;

  const padding = 6;
  const left = (activeEvent.x ?? 0) - activeEvent.width / 2 - padding;
  const top = (activeEvent.y ?? 0) - activeEvent.height / 2 - padding;
  const width = activeEvent.width + padding * 2;
  const height = activeEvent.height + padding * 2;

  // Smooth pulse
  const pulse = Math.sin((frame / fps) * Math.PI * 3) * 0.15 + 0.85;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        borderRadius: '8px',
        border: `2px solid rgba(59, 130, 246, ${pulse})`,
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        boxShadow: `0 0 20px rgba(59, 130, 246, ${pulse * 0.6})`,
        pointerEvents: 'none',
        zIndex: 80,
        transition: 'all 0.15s ease-out',
      }}
    />
  );
};
