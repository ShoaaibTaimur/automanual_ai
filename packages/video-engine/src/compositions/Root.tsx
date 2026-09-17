import React from 'react';
import { Composition } from 'remotion';
import {
  TutorialComposition,
  TutorialCompositionProps,
} from './TutorialComposition';

export const COMPOSITION_ID = 'TutorialVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={TutorialComposition}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        browserVideoUrl: '',
        events: [],
        timeline: [],
        audioSegments: [],
        title: 'AutoManual AI Tutorial',
        fps: 30,
        width: 1920,
        height: 1080,
      } as TutorialCompositionProps}
      calculateMetadata={async ({ props }: { props: any }) => {
        const input = props as Partial<TutorialCompositionProps> & {
          durationInFrames?: number;
        };
        const fps = input.fps || 30;
        let durationInFrames = input.durationInFrames || 300;

        // If audio segments or timeline items exceed default duration, calculate max duration
        if (input.audioSegments && input.audioSegments.length > 0) {
          const maxAudioEnd = Math.max(
            ...input.audioSegments.map(a => (a.startTime || 0) + (a.duration || 0))
          );
          if (maxAudioEnd > 0) {
            durationInFrames = Math.max(durationInFrames, Math.ceil(maxAudioEnd * fps) + 30);
          }
        }

        if (input.timeline && input.timeline.length > 0) {
          const maxTimelineEnd = Math.max(...input.timeline.map(t => t.end || 0));
          if (maxTimelineEnd > 0) {
            durationInFrames = Math.max(durationInFrames, Math.ceil(maxTimelineEnd * fps) + 30);
          }
        }

        return {
          durationInFrames,
          fps,
          width: input.width || 1920,
          height: input.height || 1080,
        };
      }}
    />
  );
};
