import { VideoTimelineItem, InteractionEvent } from '@automanual/shared';
import { GeneratedAudioSegment } from './voice-generator';

export class TimelineBuilder {
  buildTimeline(
    events: InteractionEvent[],
    audioSegments: GeneratedAudioSegment[]
  ): VideoTimelineItem[] {
    const timeline: VideoTimelineItem[] = [];

    // Intro segment
    const firstAudio = audioSegments[0];
    timeline.push({
      start: 0,
      end: firstAudio ? firstAudio.startTime + firstAudio.duration : 4,
      type: 'intro',
      narration: firstAudio ? firstAudio.text : 'Welcome to the user manual walkthrough.',
      audioPath: firstAudio?.audioPath,
    });

    // Interaction-driven timeline items
    for (const event of events) {
      const eventSec = event.timestamp / 1000;
      const associatedAudio = audioSegments.find(
        (a) => eventSec >= a.startTime && eventSec <= a.startTime + a.duration
      );

      const item: VideoTimelineItem = {
        start: eventSec,
        end: eventSec + 2.5,
        type: event.type === 'click' ? 'interaction' : 'navigation',
        action: event.type,
        target: event.elementText || event.selector,
        narration: associatedAudio?.text,
        audioPath: associatedAudio?.audioPath,
      };

      timeline.push(item);
    }

    // Sort by start timestamp
    timeline.sort((a, b) => a.start - b.start);

    return timeline;
  }
}
