import React from 'react';
import { OffthreadVideo, staticFile } from 'remotion';

interface BrowserRecordingProps {
  src: string;
}

export const BrowserRecording: React.FC<BrowserRecordingProps> = ({ src }) => {
  if (!src) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#0F172A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748B',
          fontSize: '24px',
        }}
      >
        Browser Recording
      </div>
    );
  }

  // If already full URL, use it directly; otherwise wrap in staticFile
  const resolvedSrc = src.startsWith('http') || src.startsWith('blob:') ? src : staticFile(src);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        left: 0,
        top: 0,
        backgroundColor: '#000',
      }}
    >
      <OffthreadVideo
        src={resolvedSrc}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};
