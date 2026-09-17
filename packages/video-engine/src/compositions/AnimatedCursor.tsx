import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { InteractionEvent } from '@automanual/shared';

interface AnimatedCursorProps {
  events: InteractionEvent[];
  fps: number;
}

export const AnimatedCursor: React.FC<AnimatedCursorProps> = ({ events, fps }) => {
  const frame = useCurrentFrame();
  const currentTimeMs = (frame / fps) * 1000;

  // Filter events with coordinates
  const coordEvents = events.filter(e => typeof e.x === 'number' && typeof e.y === 'number');
  if (coordEvents.length === 0) return null;

  // Find surrounding events for interpolation
  let prevEvent = coordEvents[0];
  let nextEvent = coordEvents[0];

  for (let i = 0; i < coordEvents.length; i++) {
    if (coordEvents[i].timestamp <= currentTimeMs) {
      prevEvent = coordEvents[i];
      nextEvent = coordEvents[i + 1] || coordEvents[i];
    } else {
      nextEvent = coordEvents[i];
      break;
    }
  }

  let x = prevEvent.x ?? 960;
  let y = prevEvent.y ?? 540;

  if (prevEvent !== nextEvent && nextEvent.timestamp > prevEvent.timestamp) {
    const moveDuration = Math.min(600, nextEvent.timestamp - prevEvent.timestamp);
    const moveStart = nextEvent.timestamp - moveDuration;

    if (currentTimeMs >= moveStart && currentTimeMs <= nextEvent.timestamp) {
      const progress = interpolate(
        currentTimeMs,
        [moveStart, nextEvent.timestamp],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
      // Smooth cubic bezier easing
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      x = (prevEvent.x ?? 960) + ((nextEvent.x ?? 960) - (prevEvent.x ?? 960)) * eased;
      y = (prevEvent.y ?? 540) + ((nextEvent.y ?? 540) - (prevEvent.y ?? 540)) * eased;
    } else if (currentTimeMs > nextEvent.timestamp) {
      x = nextEvent.x ?? 960;
      y = nextEvent.y ?? 540;
    }
  }

  // Click pulse detection (within 150ms of any click)
  const isClicking = coordEvents.some(
    e => e.type === 'click' && Math.abs(currentTimeMs - e.timestamp) < 150
  );

  const scale = isClicking ? 0.85 : 1.0;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
        zIndex: 100,
        transition: 'transform 0.05s linear',
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.45))',
        }}
      >
        <path
          d="M3 3L10.07 20.97L13.58 13.58L20.97 10.07L3 3Z"
          fill="#3B82F6"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
