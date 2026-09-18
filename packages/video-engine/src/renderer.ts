import path from 'path';
import fs from 'fs';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { InteractionEvent, VideoTimelineItem } from '@automanual/shared';
import { COMPOSITION_ID } from './compositions/Root';
import { AudioSegmentProp } from './compositions/TutorialComposition';

export interface RenderVideoOptions {
  timeline: VideoTimelineItem[];
  browserRecordingPath: string;
  outputPath: string;
  events?: InteractionEvent[];
  audioSegments?: AudioSegmentProp[];
  title?: string;
  fps?: number;
  width?: number;
  height?: number;
  publicDir?: string;
  onProgress?: (progress: number) => void;
}

export interface IVideoRenderer {
  render(options: RenderVideoOptions): Promise<{ outputPath: string; duration: number }>;
}

export class RemotionVideoRenderer implements IVideoRenderer {
  private static cachedBundleLocation: string | null = null;
  private static bundleLock: Promise<string> | null = null;

  private publicDir: string;

  constructor(publicDir?: string) {
    this.publicDir = publicDir || path.resolve(process.cwd(), 'storage');
  }

  private async getBundle(): Promise<string> {
    if (RemotionVideoRenderer.cachedBundleLocation) {
      return RemotionVideoRenderer.cachedBundleLocation;
    }

    if (RemotionVideoRenderer.bundleLock) {
      return RemotionVideoRenderer.bundleLock;
    }

    RemotionVideoRenderer.bundleLock = (async () => {
      const entryPoint = path.resolve(__dirname, 'index-remotion.ts');
      const fallbackEntryPoint = path.resolve(__dirname, 'index-remotion.js');
      const resolvedEntry = fs.existsSync(entryPoint) ? entryPoint : fallbackEntryPoint;

      const bundleLocation = await bundle({
        entryPoint: resolvedEntry,
        publicDir: this.publicDir,
      });

      RemotionVideoRenderer.cachedBundleLocation = bundleLocation;
      return bundleLocation;
    })();

    return RemotionVideoRenderer.bundleLock;
  }

  private toStaticRelPath(filePath: string): string {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('blob:')) {
      return filePath;
    }

    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (absPath.startsWith(this.publicDir)) {
      const rel = path.relative(this.publicDir, absPath);
      return rel.startsWith('/') ? rel : `/${rel}`;
    }

    // Fallback: If not within publicDir, copy or link to publicDir/_shared
    try {
      const sharedDir = path.join(this.publicDir, '_shared');
      if (!fs.existsSync(sharedDir)) {
        fs.mkdirSync(sharedDir, { recursive: true });
      }
      const destFile = path.join(sharedDir, path.basename(filePath));
      if (!fs.existsSync(destFile)) {
        fs.copyFileSync(absPath, destFile);
      }
      return `/_shared/${path.basename(filePath)}`;
    } catch {
      return filePath;
    }
  }

  async render(options: RenderVideoOptions): Promise<{ outputPath: string; duration: number }> {
    const fps = options.fps || 30;
    const width = options.width || 1920;
    const height = options.height || 1080;
    const events = options.events || [];
    const timeline = options.timeline || [];
    const title = options.title || 'AutoManual AI Tutorial';

    // Ensure output directory exists
    const outDir = path.dirname(options.outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Resolve static assets relative to publicDir
    const browserVideoRel = this.toStaticRelPath(options.browserRecordingPath);
    const resolvedAudioSegments: AudioSegmentProp[] = (options.audioSegments || []).map(seg => ({
      ...seg,
      audioPath: this.toStaticRelPath(seg.audioPath),
    }));

    // Calculate duration in frames
    let maxSeconds = 10; // minimum fallback duration

    if (resolvedAudioSegments.length > 0) {
      const maxAudio = Math.max(...resolvedAudioSegments.map(a => a.startTime + a.duration));
      if (maxAudio > maxSeconds) maxSeconds = maxAudio;
    }

    if (timeline.length > 0) {
      const maxTimeline = Math.max(...timeline.map(t => t.end));
      if (maxTimeline > maxSeconds) maxSeconds = maxTimeline;
    }

    if (events.length > 0) {
      const maxEventSec = Math.max(...events.map(e => e.timestamp)) / 1000;
      if (maxEventSec > maxSeconds) maxSeconds = maxEventSec;
    }

    // Add 1.5s padding at end for outro / comfortable view
    const totalDurationSeconds = maxSeconds + 1.5;
    const durationInFrames = Math.max(30, Math.ceil(totalDurationSeconds * fps));

    const bundleLocation = await this.getBundle();

    // Ensure Remotion's public folder dynamically links directly to current storage/projects
    // Prevents 404 when recordings and audio are created after webpack bundle was initialized
    try {
      const bundlePublicDir = path.join(bundleLocation, 'public');
      if (!fs.existsSync(bundlePublicDir)) {
        fs.mkdirSync(bundlePublicDir, { recursive: true });
      }
      const projectsSrc = path.resolve(this.publicDir, 'projects');
      const projectsDest = path.join(bundlePublicDir, 'projects');
      if (fs.existsSync(projectsSrc)) {
        if (fs.existsSync(projectsDest)) {
          const stat = fs.lstatSync(projectsDest);
          if (!stat.isSymbolicLink()) {
            fs.rmSync(projectsDest, { recursive: true, force: true });
            fs.symlinkSync(projectsSrc, projectsDest, 'junction');
          }
        } else {
          fs.symlinkSync(projectsSrc, projectsDest, 'junction');
        }
      }
    } catch {
      // If symlink fails, copy as fallback
      try {
        const bundleProjects = path.join(bundleLocation, 'public', 'projects');
        fs.cpSync(path.resolve(this.publicDir, 'projects'), bundleProjects, { recursive: true });
      } catch {}
    }

    const inputProps = {
      browserVideoUrl: browserVideoRel,
      events,
      timeline,
      audioSegments: resolvedAudioSegments,
      title,
      fps,
      width,
      height,
      durationInFrames,
    };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: COMPOSITION_ID,
      inputProps,
    });

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: options.outputPath,
      inputProps,
      overwrite: true,
      onProgress: ({ progress }) => {
        const percent = Math.floor(progress * 100);
        if (options.onProgress) {
          options.onProgress(percent);
        }
      },
    });

    return {
      outputPath: options.outputPath,
      duration: totalDurationSeconds,
    };
  }
}
