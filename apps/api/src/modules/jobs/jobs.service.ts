import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus, ExplorationPlan, decryptCredentials } from '@automanual/shared';
import { WorkflowExecutor, BrowserRunner, LoginManager } from '@automanual/browser-agent';
import { AiEngine } from '@automanual/ai-engine';
import { RemotionVideoRenderer } from '@automanual/video-engine';
import Redis from 'ioredis';
import * as path from 'path';
import * as fs from 'fs';

export interface GenerationJobData {
  projectId: string;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue: Queue<GenerationJobData> | null = null;
  private worker: Worker<GenerationJobData> | null = null;
  private redisConnection: Redis | null = null;
  private workflowExecutor = new WorkflowExecutor();
  private loginManager = new LoginManager();
  private aiEngine = new AiEngine();
  private videoRenderer = new RemotionVideoRenderer();

  // Projects that have been requested to cancel
  private cancelledProjectIds = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.redisConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
      this.redisConnection.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}`);
      });

      this.queue = new Queue<GenerationJobData>('manual-generation', {
        connection: this.redisConnection,
      });

      this.worker = new Worker<GenerationJobData>(
        'manual-generation',
        async (job: Job<GenerationJobData>) => {
          await this.processGenerationJob(job);
        },
        { connection: this.redisConnection, concurrency: 1 }
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Job ${job.id} for project ${job.data.projectId} completed.`);
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(`Job ${job?.id} failed: ${err.message}`);
      });

      this.logger.log('BullMQ Queue & Worker initialized for generation pipeline.');
    } catch (err: any) {
      this.logger.warn(`Failed to initialize BullMQ: ${err.message}. Pipeline will run in-memory fallback if needed.`);
    }
  }

  async onModuleDestroy() {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    if (this.redisConnection) await this.redisConnection.quit();
  }

  async startGenerationPipeline(projectId: string) {
    this.logger.log(`Enqueueing manual generation pipeline for project ${projectId}...`);
    // Clear any previous cancel flag when starting fresh
    this.cancelledProjectIds.delete(projectId);

    if (this.queue) {
      const job = await this.queue.add('execute-workflow-pipeline', { projectId }, {
        attempts: 2,
        removeOnComplete: true,
      });
      return { enqueued: true, jobId: job.id };
    } else {
      setImmediate(() => this.processPipelineDirect(projectId));
      return { enqueued: true, inMemory: true };
    }
  }

  /** Cancel a running project pipeline. Safe to call at any time. */
  async cancelProject(projectId: string): Promise<void> {
    this.cancelledProjectIds.add(projectId);
    this.logger.log(`Cancel requested for project ${projectId}`);

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.FAILED,
        errorMessage: 'Pipeline cancelled by user.',
      },
    }).catch(() => {});
  }

  private checkCancelled(projectId: string) {
    if (this.cancelledProjectIds.has(projectId)) {
      this.cancelledProjectIds.delete(projectId);
      throw new Error('CANCELLED');
    }
  }

  private async processGenerationJob(job: Job<GenerationJobData>) {
    const { projectId } = job.data;
    await this.processPipelineDirect(projectId, job);
  }

  private async processPipelineDirect(projectId: string, job?: Job<GenerationJobData>) {
    try {
      this.logger.log(`Starting autonomous execution pipeline for project ${projectId}...`);

      // ─── Timing bookkeeping ──────────────────────────────────────────────────
      const pipelineStart = Date.now();
      const stageTimings: Record<string, { startMs: number; endMs?: number; durationMs?: number }> = {};

      const startStage = (stage: string) => {
        stageTimings[stage] = { startMs: Date.now() };
      };

      const endStage = (stage: string) => {
        const s = stageTimings[stage];
        if (s) {
          s.endMs = Date.now();
          s.durationMs = s.endMs - s.startMs;
          const secs = Math.round(s.durationMs / 1000);
          const min = Math.floor(secs / 60);
          const sec = secs % 60;
          const humanTime = min > 0 ? `${min}m ${sec}s` : `${sec}s`;
          this.logger.log(`[Stage: ${stage}] completed in ${humanTime}`);
        }
      };
      // ────────────────────────────────────────────────────────────────────────

      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          plan: {
            include: { workflows: { orderBy: { priority: 'asc' } } },
          },
        },
      });

      if (!project || !project.plan) {
        throw new Error(`Project ${projectId} or approved plan not found.`);
      }

      // Stage 1: EXECUTING
      startStage('discovery');
      await this.updateStatus(projectId, ProjectStatus.EXECUTING, 15, job);

      const storageBase = process.env.STORAGE_PATH || './storage';
      const projectStorageDir = path.resolve(storageBase, 'projects', projectId);
      const sessionPath = path.join(projectStorageDir, 'session.json');
      const audioDir = path.join(projectStorageDir, 'audio');
      fs.mkdirSync(audioDir, { recursive: true });

      const planData: ExplorationPlan = {
        title: project.plan.title,
        estimatedDuration: project.plan.estimatedDuration,
        workflows: project.plan.workflows.map(w => ({
          id: w.workflowId,
          title: w.title,
          priority: w.priority,
          steps: (w.stepsJson || []) as any,
        })),
      };

      // Stage 2: RECORDING
      this.checkCancelled(projectId);
      endStage('discovery');
      startStage('recording');
      await this.updateStatus(projectId, ProjectStatus.RECORDING, 35, job);

      // Session from discovery phase is reused — no second login needed
      this.logger.log(`Executing ${planData.workflows.length} workflows in Chromium at 1920x1080...`);

      const executionResult = await this.workflowExecutor.executePlan(
        planData,
        project.baseUrl,
        {
          storageDir: projectStorageDir,
          storageStatePath: fs.existsSync(sessionPath) ? sessionPath : undefined,
        }
      );

      this.logger.log(`Browser execution completed. Video: ${executionResult.videoPath}, Events: ${executionResult.events.length}`);

      // Save Recording record to database
      await this.prisma.recording.create({
        data: {
          projectId,
          videoPath: executionResult.videoPath,
          rawEventsJson: executionResult.events as any,
          durationSeconds: executionResult.durationSeconds,
        },
      });

      // Stage 3: GENERATING_NARRATION
      this.checkCancelled(projectId);
      endStage('recording');
      startStage('narration');
      await this.updateStatus(projectId, ProjectStatus.GENERATING_NARRATION, 55, job);
      this.logger.log(`Generating narration script for ${project.name}...`);

      const rawSegments = await this.aiEngine.generateNarration(
        project.name,
        planData.workflows,
        executionResult.events
      );

      // Clean old narration segments if any
      await this.prisma.narrationSegment.deleteMany({ where: { projectId } });

      const savedDbSegments = [];
      for (const seg of rawSegments) {
        const dbSeg = await this.prisma.narrationSegment.create({
          data: {
            projectId,
            workflowId: seg.workflowId,
            startEventIndex: seg.startEventIndex,
            endEventIndex: seg.endEventIndex,
            text: seg.text,
          },
        });
        savedDbSegments.push(dbSeg);
      }

      this.logger.log(`Saved ${savedDbSegments.length} narration segments to database.`);

      // Stage 4: GENERATING_VOICE (Synthesize audio files & timing metadata)
      endStage('narration');
      startStage('voice');
      await this.updateStatus(projectId, ProjectStatus.GENERATING_VOICE, 75, job);
      this.logger.log(`Generating voiceover audio files for ${project.name}...`);

      const audioSegments = await this.aiEngine.generateVoiceover(
        rawSegments,
        executionResult.events,
        audioDir
      );

      for (let i = 0; i < audioSegments.length; i++) {
        const aSeg = audioSegments[i];
        const dbSeg = savedDbSegments[i];
        if (dbSeg) {
          await this.prisma.narrationSegment.update({
            where: { id: dbSeg.id },
            data: {
              audioPath: aSeg.audioPath,
              durationSeconds: aSeg.duration,
              startTime: aSeg.startTime,
            },
          });
        }
      }

      // Build and save synchronized video timeline
      const timeline = this.aiEngine.buildTimeline(executionResult.events, audioSegments);
      const timelinePath = path.join(projectStorageDir, 'timeline.json');
      fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2), 'utf8');
      this.logger.log(`Saved synchronized timeline with ${timeline.length} items to ${timelinePath}`);

      // Stage 5: RENDERING_VIDEO
      this.checkCancelled(projectId);
      endStage('voice');
      startStage('rendering');
      await this.updateStatus(projectId, ProjectStatus.RENDERING_VIDEO, 85, job);
      this.logger.log(`Rendering final studio tutorial MP4 for ${project.name}...`);

      const rendersDir = path.join(projectStorageDir, 'renders');
      if (!fs.existsSync(rendersDir)) {
        fs.mkdirSync(rendersDir, { recursive: true });
      }
      const outputMp4Path = path.join(rendersDir, 'tutorial.mp4');

      const videoRender = await this.prisma.videoRender.create({
        data: {
          projectId,
          status: ProjectStatus.RENDERING_VIDEO,
          progress: 0,
        },
      });

      try {
        const renderResult = await this.videoRenderer.render({
          browserRecordingPath: executionResult.videoPath,
          events: executionResult.events,
          timeline,
          audioSegments: audioSegments.map(a => ({
            audioPath: a.audioPath || '',
            startTime: a.startTime || 0,
            duration: a.duration || 1,
            text: a.text,
            workflowId: a.workflowId,
          })),
          outputPath: outputMp4Path,
          title: `${project.name} Walkthrough`,
          fps: 30,
          width: 1920,
          height: 1080,
          onProgress: async (percent: number) => {
            const overallProgress = Math.min(99, 85 + Math.floor((percent / 100) * 14));
            if (job) {
              await job.updateProgress(overallProgress).catch(() => {});
            }
            await this.prisma.videoRender.update({
              where: { id: videoRender.id },
              data: { progress: percent },
            }).catch(() => {});
          },
        });

        const outputUrl = `/storage/projects/${projectId}/renders/tutorial.mp4`;
        await this.prisma.videoRender.update({
          where: { id: videoRender.id },
          data: {
            status: ProjectStatus.COMPLETED,
            progress: 100,
            outputUrl,
          },
        });

        this.logger.log(`Rendered video saved: ${renderResult.outputPath} (${renderResult.duration.toFixed(1)}s)`);
      } catch (renderErr: any) {
        this.logger.error(`Video render failed for ${projectId}: ${renderErr.message}`);
        await this.prisma.videoRender.update({
          where: { id: videoRender.id },
          data: {
            status: ProjectStatus.FAILED,
            errorMessage: renderErr.message,
          },
        });
        throw renderErr;
      }

      // Stage 6: COMPLETED
      endStage('rendering');
      await this.updateStatus(projectId, ProjectStatus.COMPLETED, 100, job);

      // Persist timing data to timings.json
      const totalMs = Date.now() - pipelineStart;
      const timingsData = {
        startedAt: new Date(pipelineStart).toISOString(),
        completedAt: new Date().toISOString(),
        totalMs,
        stages: {
          discoveryMs: stageTimings.discovery?.durationMs ?? 0,
          recordingMs: stageTimings.recording?.durationMs ?? 0,
          narrationMs: stageTimings.narration?.durationMs ?? 0,
          voiceMs: stageTimings.voice?.durationMs ?? 0,
          renderingMs: stageTimings.rendering?.durationMs ?? 0,
        },
      };
      const timingsPath = path.join(projectStorageDir, 'timings.json');
      fs.writeFileSync(timingsPath, JSON.stringify(timingsData, null, 2), 'utf8');
      this.logger.log(`Pipeline fully completed for project ${projectId}. Total time: ${Math.round(totalMs / 1000)}s. Timings saved to ${timingsPath}`);
    } catch (err: any) {
      if (err.message === 'CANCELLED') {
        this.logger.log(`Pipeline cancelled for project ${projectId}.`);
        // Status already set by cancelProject()
        return;
      }
      this.logger.error(`Pipeline error for ${projectId}: ${err.message}`);
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          status: ProjectStatus.FAILED,
          errorMessage: `Pipeline error: ${err.message}`,
        },
      });
    }
  }

  private async updateStatus(
    projectId: string,
    status: ProjectStatus,
    progress: number,
    job?: Job<GenerationJobData>
  ) {
    if (job) {
      await job.updateProgress(progress).catch(() => {});
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status },
    });

    this.logger.log(`Project ${projectId} transitioned to ${status} (${progress}%)`);
  }
}
