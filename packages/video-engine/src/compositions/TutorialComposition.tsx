import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile } from 'remotion';
import { InteractionEvent, VideoTimelineItem } from '@automanual/shared';
import { BrowserRecording } from './BrowserRecording';
import { ZoomEffect } from './ZoomEffect';
import { ElementHighlight } from './ElementHighlight';
import { ClickRipple } from './ClickRipple';
import { AnimatedCursor } from './AnimatedCursor';
import { CaptionOverlay, CaptionSegment } from './CaptionOverlay';

export interface AudioSegmentProp {
  audioPath: string;
  startTime: number;
  duration: number;
  text: string;
  workflowId?: string;
}

export interface TutorialCompositionProps {
  browserVideoUrl: string;
  events: InteractionEvent[];
  timeline: VideoTimelineItem[];
  audioSegments: AudioSegmentProp[];
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
}

export const TutorialComposition: React.FC<TutorialCompositionProps> = ({
  browserVideoUrl,
  events = [],
  timeline = [],
  audioSegments = [],
  title = 'AutoManual AI Tutorial',
  fps = 30,
  width = 1920,
  height = 1080,
}) => {
  const captionSegments: CaptionSegment[] = audioSegments.map(a => ({
    text: a.text,
    startTime: a.startTime,
    duration: a.duration,
    workflowId: a.workflowId,
  }));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#090D16',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Zoom / Pan camera wrapper around video and interactions */}
      <ZoomEffect timeline={timeline} fps={fps} width={width} height={height}>
        {/* Base Layer: Playwright 1080p Browser Recording */}
        <BrowserRecording src={browserVideoUrl} />

        {/* Visual Target Glow / Highlight Box */}
        <ElementHighlight events={events} fps={fps} />

        {/* Click Expanding Ripple Rings */}
        <ClickRipple events={events} fps={fps} />

        {/* Smooth Animated Cursor Simulation */}
        <AnimatedCursor events={events} fps={fps} />
      </ZoomEffect>

      {/* Top HUD Branding Pill */}
      <div
        style={{
          position: 'absolute',
          top: '28px',
          left: '32px',
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '9999px',
          padding: '8px 18px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#10B981',
            boxShadow: '0 0 8px #10B981',
          }}
        />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: '#F8FAFC',
            textTransform: 'uppercase',
          }}
        >
          AutoManual AI
        </span>
        <span style={{ color: 'rgba(255, 255, 255, 0.25)', fontSize: '13px' }}>|</span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#CBD5E1',
          }}
        >
          {title}
        </span>
      </div>

      {/* Subtitles / Captions Banner */}
      <CaptionOverlay segments={captionSegments} fps={fps} />

      {/* Synchronized Audio Segments */}
      {audioSegments.map((segment, idx) => {
        if (!segment.audioPath) return null;
        const startFrame = Math.max(0, Math.floor(segment.startTime * fps));
        const durationFrames = Math.max(1, Math.ceil(segment.duration * fps));
        const resolvedAudioSrc =
          segment.audioPath.startsWith('http') || segment.audioPath.startsWith('blob:')
            ? segment.audioPath
            : staticFile(segment.audioPath);

        return (
          <Sequence
            key={`audio-segment-${idx}`}
            from={startFrame}
            durationInFrames={durationFrames}
          >
            <Audio src={resolvedAudioSrc} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
