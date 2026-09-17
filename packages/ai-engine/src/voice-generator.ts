import OpenAI from 'openai';
import { NarrationSegment, InteractionEvent } from '@automanual/shared';
import * as fs from 'fs';
import * as path from 'path';

export interface GeneratedAudioSegment extends NarrationSegment {
  audioPath: string;
  duration: number;
  startTime: number;
}

export interface IVoiceProvider {
  generateAudio(text: string, outputPath: string): Promise<{ durationSeconds: number }>;
}

export class OpenAIVoiceProvider implements IVoiceProvider {
  private openai: OpenAI;
  private voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

  constructor(apiKey: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy') {
    this.openai = new OpenAI({ apiKey });
    this.voice = voice;
  }

  async generateAudio(text: string, outputPath: string): Promise<{ durationSeconds: number }> {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const mp3 = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice: this.voice,
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    // Estimate duration: ~150 words per minute + padding
    const wordCount = text.split(/\s+/).length;
    const durationSeconds = Math.max(2, Math.round((wordCount / 150) * 60 * 10) / 10);

    return { durationSeconds };
  }
}

import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

export class MacNativeVoiceProvider implements IVoiceProvider {
  private voice: string;

  constructor(voice: string = 'Samantha') {
    this.voice = voice;
  }

  async generateAudio(text: string, outputPath: string): Promise<{ durationSeconds: number }> {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const cleanText = text.replace(/["'\\]/g, ' ').trim();
    await execFileAsync('/usr/bin/say', [
      '-v',
      this.voice,
      '-o',
      outputPath,
      '--file-format=WAVE',
      '--data-format=LEI16@22050',
      cleanText,
    ]);

    const stats = fs.statSync(outputPath);
    const audioDataSize = Math.max(0, stats.size - 44);
    const durationSeconds = Math.max(1, Math.round((audioDataSize / (22050 * 2)) * 10) / 10);

    return { durationSeconds };
  }
}

export class SyntheticVoiceProvider implements IVoiceProvider {
  async generateAudio(text: string, outputPath: string): Promise<{ durationSeconds: number }> {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Generate valid minimal WAV audio file (44.1kHz, 16-bit, mono)
    const wordCount = text.split(/\s+/).length;
    const durationSeconds = Math.max(3, Math.round((wordCount / 140) * 60));
    const sampleRate = 44100;
    const numSamples = sampleRate * durationSeconds;
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample

    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Write subtle silence / ambient carrier
    for (let i = 0; i < numSamples; i++) {
      buffer.writeInt16LE(0, 44 + i * 2);
    }

    fs.writeFileSync(outputPath, buffer);

    return { durationSeconds };
  }
}

export class VoiceGenerator {
  private provider: IVoiceProvider;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key && key.trim().length > 0 && !key.includes('your-openai-api-key')) {
      this.provider = new OpenAIVoiceProvider(key, 'alloy');
    } else if (process.platform === 'darwin') {
      this.provider = new MacNativeVoiceProvider('Samantha');
    } else {
      this.provider = new SyntheticVoiceProvider();
    }
  }

  setProvider(provider: IVoiceProvider) {
    this.provider = provider;
  }

  async generateVoiceover(
    segments: NarrationSegment[],
    events: InteractionEvent[],
    outputDir: string
  ): Promise<GeneratedAudioSegment[]> {
    fs.mkdirSync(outputDir, { recursive: true });
    const results: GeneratedAudioSegment[] = [];

    let currentTimelineTime = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const filename = `voice-segment-${i + 1}-${seg.workflowId}.wav`;
      const audioPath = path.join(outputDir, filename);

      const { durationSeconds } = await this.provider.generateAudio(seg.text, audioPath);

      // Align startTime strictly with the start event timestamp of this workflow in the browser
      const startEvent = events[seg.startEventIndex];
      const startTime = startEvent ? startEvent.timestamp / 1000 : currentTimelineTime;

      // Ensure segment duration fits comfortably within the workflow's active window
      let adjustedDuration = durationSeconds;
      if (i < segments.length - 1) {
        const nextStartEvent = events[segments[i + 1].startEventIndex];
        if (nextStartEvent) {
          const nextStartSec = nextStartEvent.timestamp / 1000;
          const availableWindow = Math.max(2, nextStartSec - startTime - 0.5);
          adjustedDuration = Math.min(durationSeconds, availableWindow);
        }
      }

      currentTimelineTime = startTime + adjustedDuration;

      results.push({
        ...seg,
        audioPath,
        duration: adjustedDuration,
        startTime,
      });
    }

    return results;
  }
}
