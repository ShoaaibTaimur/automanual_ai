'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { 
  Bot, 
  Sparkles, 
  Clock, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  Compass, 
  Globe, 
  FileText,
  AlertCircle,
  Activity,
  Check,
  Download,
  Play,
  Volume2,
  Tv,
  ListVideo,
  Copy,
  ExternalLink,
  Film,
  Flame,
  Subtitles,
  ChevronRight
} from 'lucide-react';

export default function ProjectDetailsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'workflows' | 'routes'>('video');
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

  const fetchProjectData = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}`);
      if (!res.ok) throw new Error('Failed to load project details');
      const data = await res.json();
      setProject(data);

      if (data.status === 'COMPLETED' && data.videoRenders?.length > 0) {
        setActiveTab('video');
      } else {
        setActiveTab('workflows');
      }

      if (data.plan) {
        setPlan(data.plan);
      } else {
        const planRes = await fetch(`${apiUrl}/api/projects/${projectId}/plan`).catch(() => null);
        if (planRes && planRes.ok) {
          const planData = await planRes.json();
          setPlan(planData);
        }
      }

      // Fetch status info
      const statusRes = await fetch(`${apiUrl}/api/projects/${projectId}/status`).catch(() => null);
      if (statusRes && statusRes.ok) {
        const sData = await statusRes.json();
        setStatusInfo(sData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  // Polling status when in active pipeline
  useEffect(() => {
    if (!project) return;
    const activeStatuses = [
      'EXECUTING',
      'RECORDING',
      'GENERATING_NARRATION',
      'GENERATING_VOICE',
      'RENDERING_VIDEO',
    ];

    if (!activeStatuses.includes(project.status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/projects/${projectId}/status`);
        if (res.ok) {
          const s = await res.json();
          setStatusInfo(s);
          setProject((prev: any) => ({ ...prev, status: s.status }));
          if (s.status === 'COMPLETED' || s.status === 'FAILED') {
            clearInterval(interval);
            await fetchProjectData();
          }
        }
      } catch {
        // Silent poll error
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [project?.status, projectId]);

  const handleApprovePlan = async () => {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}/plan/approve`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to approve plan');
      const approvedData = await res.json();
      setProject(approvedData.project);
      setPlan(approvedData.plan);
      await fetchProjectData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleSeek = (timeInSeconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeInSeconds;
      videoRef.current.play().catch(() => {});
      videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getActionBadge = (action: string) => {
    switch (action?.toLowerCase()) {
      case 'navigate':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">NAVIGATE</span>;
      case 'click':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">CLICK</span>;
      case 'input':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">INPUT</span>;
      case 'explain':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">EXPLAIN</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">{action?.toUpperCase()}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-400 flex items-center justify-center text-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="font-medium text-slate-300">Loading project studio...</span>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#030712] text-rose-400 flex flex-col items-center justify-center gap-3">
        <AlertCircle className="w-8 h-8 text-rose-500" />
        <span className="font-semibold text-sm">Project not found.</span>
        <a href="/" className="text-xs text-indigo-400 hover:underline">← Return to Dashboard</a>
      </div>
    );
  }

  const durationMin = plan ? Math.floor(plan.estimatedDuration / 60) : 0;
  const durationSec = plan ? plan.estimatedDuration % 60 : 0;
  const isApproved = plan?.approved || project.status === 'COMPLETED' || project.status === 'EXECUTING';
  const completedRender = project.videoRenders?.find((r: any) => r.status === 'COMPLETED') || project.videoRenders?.[0];
  const videoStreamUrl = completedRender?.outputUrl ? `${apiUrl}${completedRender.outputUrl}` : null;
  const narrations = (project.narrations || []).sort((a: any, b: any) => (a.startTime || 0) - (b.startTime || 0));

  return (
    <main className="min-h-screen bg-[#030712] text-slate-100 selection:bg-indigo-500 selection:text-white pb-24 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[350px] bg-gradient-to-b from-indigo-600/10 via-sky-600/5 to-transparent blur-3xl pointer-events-none" />

      {/* Sticky Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 bg-[#030712]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-medium transition">
              ← Dashboard
            </a>
            <span className="text-slate-700">/</span>
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-sm text-white tracking-tight">{project.name}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border ${
                project.status === 'COMPLETED' 
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : project.status.includes('ING')
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 animate-pulse'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {project.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <a 
              href={project.baseUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition truncate max-w-xs"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">{project.baseUrl}</span>
              <ExternalLink className="w-3 h-3 text-slate-600 shrink-0" />
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-8 relative z-10">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Live Pipeline Progress Banner (Active when in pipeline) */}
        {statusInfo && statusInfo.progress > 0 && statusInfo.status !== 'COMPLETED' && (
          <div className="mb-8 p-6 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span>Autonomous Generation Pipeline: {statusInfo.status}</span>
              </div>
              <span className="text-sm font-bold text-white">{statusInfo.progress}%</span>
            </div>

            {/* Progress Track */}
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mb-4 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${statusInfo.progress}%` }}
              />
            </div>

            <div className="grid grid-cols-5 text-center text-[10px] font-medium text-slate-400 gap-2">
              <span className={statusInfo.progress >= 20 ? 'text-indigo-400 font-bold' : ''}>1. Discovered</span>
              <span className={statusInfo.progress >= 50 ? 'text-indigo-400 font-bold' : ''}>2. Executed</span>
              <span className={statusInfo.progress >= 70 ? 'text-indigo-400 font-bold' : ''}>3. Narrated</span>
              <span className={statusInfo.progress >= 85 ? 'text-indigo-400 font-bold' : ''}>4. Voice Synthesized</span>
              <span className={statusInfo.progress === 100 ? 'text-emerald-400 font-bold' : ''}>5. Video Rendered</span>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mb-6 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'video'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Studio Video & Narration</span>
            {project.status === 'COMPLETED' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('workflows')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'workflows'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Workflows Sequence ({plan?.workflows?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('routes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'routes'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Discovered Routes ({project.discovery?.sections?.length || 0})</span>
          </button>
        </div>

        {/* TAB 1: STUDIO VIDEO & NARRATION */}
        {activeTab === 'video' && (
          <div className="space-y-8">
            {videoStreamUrl ? (
              <div className="space-y-6">
                {/* Hero Studio Video Player */}
                <div className="relative group rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl">
                  <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                    <video
                      ref={videoRef}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain"
                      poster="/video-poster.png"
                    >
                      <source src={videoStreamUrl} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  {/* Studio Video Control & Metadata Bar */}
                  <div className="p-4 sm:p-5 bg-slate-900/90 backdrop-blur-md border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold font-mono">
                        1080p FULL HD
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                        30 FPS
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                        Zero-Cost Offline TTS
                      </span>
                      <span className="text-slate-400 text-xs flex items-center gap-1 ml-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        {durationMin > 0 ? `${durationMin}m ${durationSec}s` : `${durationSec}s`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
                      <button
                        onClick={() => handleCopyLink(videoStreamUrl)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>

                      <a
                        href={videoStreamUrl}
                        download={`${project.name.toLowerCase()}-user-manual.mp4`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-semibold transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download MP4</span>
                      </a>
                    </div>
                  </div>
                </div>

                {/* Synchronized Narration Transcript */}
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                        <Subtitles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">
                          Synchronized Narration Transcript
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Click any segment to jump video playback directly to that feature demonstration.
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {narrations.length} Segments
                    </span>
                  </div>

                  <div className="grid gap-3 pt-2">
                    {narrations.map((n: any, idx: number) => {
                      const startTimeSec = Math.round((n.startTime || 0) * 10) / 10;
                      return (
                        <div
                          key={n.id || idx}
                          onClick={() => handleSeek(startTimeSec)}
                          className="group p-4 rounded-xl bg-slate-950/60 hover:bg-indigo-950/20 border border-slate-800/80 hover:border-indigo-500/40 transition cursor-pointer flex items-start gap-4"
                        >
                          <button
                            type="button"
                            className="px-2.5 py-1 rounded-md bg-indigo-500/10 group-hover:bg-indigo-500 text-indigo-300 group-hover:text-white border border-indigo-500/20 text-xs font-mono font-bold transition flex items-center gap-1 shrink-0"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{formatTime(startTimeSec)}</span>
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                                {n.workflowId ? n.workflowId.replace(/-/g, ' ') : `Segment ${idx + 1}`}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({n.durationSeconds}s)
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed group-hover:text-white transition">
                              "{n.text}"
                            </p>
                          </div>

                          <div className="shrink-0 pt-1 text-slate-600 group-hover:text-indigo-400 transition">
                            <Volume2 className="w-4 h-4" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
                  <Tv className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">
                    {project.status === 'AWAITING_APPROVAL' 
                      ? 'Plan Awaiting Your Approval'
                      : 'Video Render in Progress'}
                  </h3>
                  <p className="text-slate-400 text-xs max-w-md mx-auto">
                    {project.status === 'AWAITING_APPROVAL'
                      ? 'Switch to the Workflows tab to inspect the sequence and approve generation to produce the studio video.'
                      : 'The autonomous pipeline is currently recording browser actions, synthesizing voice, and rendering 1080p MP4.'}
                  </p>
                </div>
                {project.status === 'AWAITING_APPROVAL' && (
                  <button
                    onClick={() => setActiveTab('workflows')}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                  >
                    View & Approve Workflows →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WORKFLOWS SEQUENCE */}
        {activeTab === 'workflows' && (
          <div className="space-y-6">
            {/* Plan Header Card */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 mb-3 border border-indigo-500/20">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Sequenced Manual Plan
                </div>
                <h1 className="text-2xl font-bold text-white mb-1">
                  {plan?.title || `${project.name} User Manual Plan`}
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm">
                  Safe non-destructive demonstration order designed by autonomous crawler.
                </p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {plan && (
                  <div className="flex items-center gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <div className="text-slate-400 flex items-center justify-center gap-1 mb-0.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        Duration
                      </div>
                      <div className="text-sm font-bold text-white">
                        {durationMin}m {durationSec ? `${durationSec}s` : ''}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <div className="text-slate-400 flex items-center justify-center gap-1 mb-0.5">
                        <Layers className="w-3.5 h-3.5 text-sky-400" />
                        Workflows
                      </div>
                      <div className="text-sm font-bold text-white">
                        {plan.workflows?.length || 0}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Workflows List */}
            {plan && plan.workflows && plan.workflows.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-4">
                  {plan.workflows.map((workflow: any) => {
                    const steps = (workflow.stepsJson || workflow.steps || []) as any[];

                    return (
                      <div
                        key={workflow.id || workflow.workflowId}
                        className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center">
                              {workflow.priority}
                            </span>
                            <h3 className="font-semibold text-white text-sm">
                              {workflow.title}
                            </h3>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {steps.length} actions
                          </span>
                        </div>

                        <div className="space-y-2.5 pl-9">
                          {steps.map((step: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-3 text-xs">
                              <div className="pt-0.5">{getActionBadge(step.action)}</div>
                              <div className="flex-1 text-slate-300">
                                <span>{step.description}</span>
                                {step.target && (
                                  <span className="ml-2 font-mono text-[11px] text-indigo-300/80 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                    {step.target}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Approve Plan CTA Box */}
                <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900 to-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-white mb-1">
                      {isApproved ? 'Plan Approved & Sequenced' : 'Plan Ready for Generation'}
                    </h4>
                    <p className="text-slate-400 text-xs">
                      {isApproved
                        ? `Autonomous pipeline was triggered. Current status: ${project.status}`
                        : 'Approving starts browser execution, 1080p recording, and Remotion video rendering.'}
                    </p>
                  </div>

                  {isApproved ? (
                    <div className="px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Approved</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleApprovePlan}
                      disabled={approving || project.status !== 'AWAITING_APPROVAL'}
                      className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 disabled:opacity-50 shrink-0"
                    >
                      {approving ? (
                        <span>Starting Pipeline...</span>
                      ) : (
                        <>
                          <span>Approve & Generate Manual</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-2xl border border-dashed border-slate-800 text-center text-slate-400 text-xs">
                <Compass className="w-8 h-8 mx-auto text-slate-600 mb-3" />
                No exploration plan found.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DISCOVERED ROUTES */}
        {activeTab === 'routes' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Discovered Application Sections</h3>
                <p className="text-xs text-slate-400">Routes and UI features mapped during autonomous crawler exploration.</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {project.discovery?.sections?.length || 0} Sections Mapped
              </span>
            </div>

            {project.discovery?.sections?.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {project.discovery.sections.map((section: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-white">{section.name}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {section.route}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      {section.description}
                    </p>

                    {section.features && section.features.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1.5">
                          Detected Features
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {section.features.slice(0, 4).map((f: string, fIdx: number) => (
                            <span
                              key={fIdx}
                              className="px-2 py-0.5 rounded text-[10px] bg-slate-950 text-slate-300 border border-slate-800 truncate max-w-[200px]"
                            >
                              {f}
                            </span>
                          ))}
                          {section.features.length > 4 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-950 text-slate-500 border border-slate-800">
                              +{section.features.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 rounded-2xl border border-dashed border-slate-800 text-center text-slate-400 text-xs">
                <Compass className="w-8 h-8 mx-auto text-slate-600 mb-3" />
                No routes discovered yet.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
