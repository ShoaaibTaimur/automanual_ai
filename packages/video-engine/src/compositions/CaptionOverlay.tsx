import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

export interface CaptionSegment {
  text: string;
  startTime: number;
  duration: number;
  workflowId?: string;
}

interface CaptionOverlayProps {
  segments: CaptionSegment[];
  fps: number;
}

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ segments, fps }) => {
  const frame = useCurrentFrame();
  const currentTimeSec = frame / fps;

  // Active segment
  const activeSegment = segments.find(
    s => currentTimeSec >= s.startTime && currentTimeSec <= s.startTime + s.duration
  );

  if (!activeSegment || !activeSegment.text) return null;

  // Segment index
  const currentIndex = segments.indexOf(activeSegment);
  const total = segments.length;

  // Gentle fade-in over 6 frames at segment start
  const segmentStartFrame = activeSegment.startTime * fps;
  const opacity = interpolate(
    frame,
    [segmentStartFrame, segmentStartFrame + 6],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '48px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '1280px',
        width: '90%',
        zIndex: 110,
        opacity,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          borderRadius: '16px',
          padding: '16px 28px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#60A5FA',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              padding: '2px 8px',
              borderRadius: '9999px',
              border: '1px solid rgba(96, 165, 250, 0.3)',
            }}
          >
            Step {currentIndex + 1} of {total}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#94A3B8',
              textTransform: 'capitalize',
            }}
          >
            {activeSegment.workflowId?.replace(/-/g, ' ') || 'Walkthrough'}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '18px',
            lineHeight: '1.45',
            fontWeight: 500,
            color: '#F8FAFC',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            letterSpacing: '-0.01em',
            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          {activeSegment.text}
        </p>
      </div>
    </div>
  );
};
