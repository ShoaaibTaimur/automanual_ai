import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { VideoTimelineItem } from '@automanual/shared';

interface ZoomEffectProps {
  timeline: VideoTimelineItem[];
  fps: number;
  width: number;
  height: number;
  children: React.ReactNode;
}

export const ZoomEffect: React.FC<ZoomEffectProps> = ({
  timeline,
  fps,
  width,
  height,
  children,
}) => {
  const frame = useCurrentFrame();
  const currentTimeSec = frame / fps;

  // Find active timeline item with zoomTarget
  const activeItem = timeline.find(
    item =>
      item.zoomTarget &&
      currentTimeSec >= item.start &&
      currentTimeSec <= item.end
  );

  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;

  if (activeItem && activeItem.zoomTarget) {
    const targetScale = activeItem.zoomTarget.scale || 1.15;
    const transitionSec = 0.6;

    // Fade in / out zoom smoothly
    let factor = 1.0;
    if (currentTimeSec < activeItem.start + transitionSec) {
      factor = interpolate(
        currentTimeSec,
        [activeItem.start, activeItem.start + transitionSec],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
    } else if (currentTimeSec > activeItem.end - transitionSec) {
      factor = interpolate(
        currentTimeSec,
        [activeItem.end - transitionSec, activeItem.end],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
    }

    scale = 1.0 + (targetScale - 1.0) * factor;

    // Calculate center offset
    const targetX = activeItem.zoomTarget.x;
    const targetY = activeItem.zoomTarget.y;

    // Max translation clamp to keep recording fully visible
    const maxTranslateX = ((scale - 1) * width) / 2;
    const maxTranslateY = ((scale - 1) * height) / 2;

    const rawOffsetX = (width / 2 - targetX) * (scale - 1);
    const rawOffsetY = (height / 2 - targetY) * (scale - 1);

    translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, rawOffsetX)) * factor;
    translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, rawOffsetY)) * factor;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
        transformOrigin: 'center center',
        transition: 'transform 0.1s linear',
      }}
    >
      {children}
    </div>
  );
};
