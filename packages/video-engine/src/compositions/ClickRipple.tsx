import React from 'react';
import { useCurrentFrame } from 'remotion';
import { InteractionEvent } from '@automanual/shared';

interface ClickRippleProps {
  events: InteractionEvent[];
  fps: number;
}

export const ClickRipple: React.FC<ClickRippleProps> = ({ events, fps }) => {
  const frame = useCurrentFrame();
  const currentTimeMs = (frame / fps) * 1000;

  // Active click events within 500ms window
  const activeClicks = events.filter(
    e =>
      e.type === 'click' &&
      typeof e.x === 'number' &&
      typeof e.y === 'number' &&
      currentTimeMs >= e.timestamp &&
      currentTimeMs <= e.timestamp + 500
  );

  if (activeClicks.length === 0) return null;

  return (
    <>
      {activeClicks.map(click => {
        const elapsed = currentTimeMs - click.timestamp;
        const progress = elapsed / 500; // 0 to 1
        const radius = progress * 55; // Expands to 55px
        const opacity = Math.max(0, 1 - progress);
        const x = click.x!;
        const y = click.y!;

        return (
          <div
            key={`ripple-${click.id}-${click.timestamp}`}
            style={{
              position: 'absolute',
              left: x - radius,
              top: y - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: '50%',
              border: `2.5px solid rgba(59, 130, 246, ${opacity})`,
              backgroundColor: `rgba(96, 165, 250, ${opacity * 0.25})`,
              boxShadow: `0 0 16px rgba(59, 130, 246, ${opacity * 0.8})`,
              pointerEvents: 'none',
              zIndex: 90,
            }}
          />
        );
      })}
    </>
  );
};
